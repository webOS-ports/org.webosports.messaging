/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * A deterministic mailbox for the volume tests: contacts, accounts, channels and several hundred
 * messages, each message tagged with the conversation(s) it belongs in. The tags come from how
 * the mailbox was built (this message is from person 17, that one is in channel 3), never from
 * the threader's rules, so the test can hold the threader to them.
 *
 *   generate(seed, { persons, messages }) -> { persons, late, channels, buddies, loginstates,
 *                                              accounts, messages, keys, names }
 *
 * messages[i].expect is the list of conversation keys ([] for a message that must stay
 * unthreaded); keys maps each key to what it is; names maps a key to the title its thread must
 * have, where that is known.
 *
 * What it mixes in: IM on four transports and two Teams accounts, the same contact over SMS,
 * Teams and WhatsApp; WhatsApp numbers as "<digits>@s.whatsapp.net", "+<digits>" and bare digits;
 * phone numbers with and without country code, with the Dutch trunk 0, in (555) 123-4567 form;
 * address case; contacts found only through their buddy record; channels with and without an
 * imchannel, with raw WhatsApp group ids for names; group chats; a muted channel; read, hidden
 * and SMS replacement messages; emoji; an SMS to several people; and history that arrives after
 * newer messages; and contacts that only turn up halfway (late: their indexes in persons), whose
 * earlier messages are already in a thread keyed on the address that the contact must take over.
 *
 * Left out on purpose: an unknown (no contact) number written once with its trunk 0 and once with
 * its country code. Thread keys keep the app's last-ten-digits rule, so those two become two
 * threads until a contact links them; service-threader.test.js covers the contact case.
 */

"use strict";

var seedlib = require('./seed');

var IM = seedlib.IM, SMS = seedlib.SMS;

// mulberry32: small, fast and the same on every run.
function prng(seed) {
    var a = seed >>> 0;
    function next() {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
        next: next,
        int: function (n) { return Math.floor(next() * n); },
        pick: function (list) { return list[Math.floor(next() * list.length)]; },
        chance: function (p) { return next() < p; }
    };
}

var GIVEN = ["Anna", "Bram", "Chloé", "Daan", "Eva", "Finn", "Greta", "Hugo", "Iris", "José", "Kees", "Lotte",
    "Milan", "Noor", "Otto", "Pien", "Quinn", "Ruben", "Sanne", "Thijs", "Uma", "Vince", "Wouter", "Zoë"];
var FAMILY = ["de Vries", "Jansen", "Bakker", "Visser", "Smit", "Meijer", "Mulder", "Bos", "Vos", "Peters",
    "Hendriks", "Dekker", "Brouwer", "O'Neill", "Nguyễn", "Müller"];
var NICKS = ["🦊 Fox", "Bobby", "DJ ✨", "Mam", "Pap", "Opa", "Teamlead", "Buurman"];
var WORDS = ["hoi", "hello", "lunch?", "ok", "see you", "running late", "👍", "😂", "call me", "on my way", "thanks!",
    "meeting moved to 3", "did you get it", "🎉🎉", "sure", "no", "maybe tomorrow", "where are you", "❤️", "LOL"];

var ACCOUNTS = [
    { serviceName: "type_teams", username: "luneostest@herrie.org", accountId: "acc-teams-1" },
    { serviceName: "type_teams", username: "second@herrie.org", accountId: "acc-teams-2" },
    { serviceName: "type_whatsapp", username: "31600000001@s.whatsapp.net", accountId: "acc-wa" },
    { serviceName: "type_discord", username: "luneos#0001", accountId: "acc-discord" }
];

function hex(r, n) {
    var s = "";
    for (var i = 0; i < n; i++) { s += "0123456789abcdef".charAt(r.int(16)); }
    return s;
}

function shuffle(r, list) {
    for (var i = list.length - 1; i > 0; i--) {
        var j = r.int(i + 1), t = list[i];
        list[i] = list[j];
        list[j] = t;
    }
    return list;
}

function generate(seed, opts) {
    opts = opts || {};
    var r = prng(seed);
    var nPersons = opts.persons || 300;
    var nMessages = opts.messages || 800;
    var used = new Set();
    var keys = {}, names = {};

    // A number nobody else has, compared on its last nine digits so no two can meet.
    function freshDigits(make) {
        for (;;) {
            var d = make();
            if (!used.has(d.slice(-9))) { used.add(d.slice(-9)); return d; }
        }
    }
    function nlMobile() { return freshDigits(function () { return "316" + String(10000000 + r.int(89999999)); }); }
    function usNumber() { return freshDigits(function () { return "1" + String(200 + r.int(700)) + String(2000000 + r.int(7999999)); }); }

    // How an SMS transport might write a number: for a Dutch one with its country code or its
    // trunk 0; for a US one with or without the 1, grouped or not.
    function smsForm(c) {
        if (c.country === "nl") { return r.pick(["+" + c.digits, "0" + c.digits.slice(2), "+31 6 " + c.digits.slice(3)]); }
        var d = c.digits.slice(1);
        return r.pick(["+" + c.digits, d, "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6), "+1 " + d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6)]);
    }
    function teamsForm(id) { return r.chance(0.3) ? id.toUpperCase().replace("8:ORGID:", "8:orgid:") : id; }

    // Contacts. Each reaches us over one to three transports.
    var persons = [], buddies = [];
    for (var p = 0; p < nPersons; p++) {
        var key = "person:" + p;
        var fields = { ims: [], phones: [] };
        var shape = r.next();
        if (shape < 0.8) { fields.name = { givenName: r.pick(GIVEN), familyName: r.pick(FAMILY) }; }
        else if (shape < 0.93) { fields.nickname = r.pick(NICKS); }
        var via = { key: key };
        if (r.chance(0.55)) {
            var nl = r.chance(0.5);
            via.phone = { country: nl ? "nl" : "us", digits: nl ? nlMobile() : usNumber() };
            fields.phones.push(nl ? "+31 6 " + via.phone.digits.slice(3) : "+" + via.phone.digits);
        }
        if (r.chance(0.4) || !via.phone) {
            via.teams = "8:orgid:" + hex(r, 8) + "-" + hex(r, 4);
            fields.ims.push({ value: via.teams, type: "type_teams" });
        }
        if (r.chance(0.35)) {
            via.wa = via.phone && via.phone.country === "nl" ? via.phone.digits : nlMobile();
            // Contacts hold a WhatsApp number in whatever form they were synced with; a few only
            // with spaces in it, which no lookup matches, so only their buddy record finds them.
            var form = r.int(4);
            if (form === 3) {
                fields.ims.push({ value: "+" + via.wa.slice(0, 2) + " " + via.wa.slice(2, 3) + " " + via.wa.slice(3), type: "type_whatsapp" });
                buddies.push({ _kind: "com.palm.imbuddystatus:1", username: via.wa + "@s.whatsapp.net", serviceName: "type_whatsapp", personIndex: p });
            } else {
                fields.ims.push({ value: [ "+" + via.wa, via.wa, via.wa + "@s.whatsapp.net" ][form], type: "type_whatsapp" });
            }
        }
        if (r.chance(0.15)) {
            via.discord = String(100000000000 + r.int(899999999999));
            fields.ims.push({ value: via.discord, type: "type_discord" });
        }
        var record = seedlib.person(fields);
        // A contact synced late reaches us one way only: one reached several ways before its
        // contact existed has a thread per way, and nothing joins those afterwards.
        var ways = ["phone", "teams", "wa", "discord"].filter(function (w) { return via[w]; }).length;
        var late = ways === 1 && !(via.phone && via.phone.country === "nl") && r.chance(0.3);
        persons.push({ record: record, via: via, late: late });
        keys[key] = { type: "person", index: p };
        names[key] = expectedName(record);
    }

    // People with no contact: their messages are threaded on the address alone.
    var strangers = [];
    for (var s = 0; s < 60; s++) {
        var sk = "stranger:" + s, st = { key: sk };
        var kind = r.int(4);
        if (kind === 0) { st.phone = { country: "us", digits: usNumber() }; }
        else if (kind === 1) { st.teams = "8:orgid:" + hex(r, 8) + "-" + hex(r, 4); }
        else if (kind === 2) { st.wa = nlMobile(); }
        else { st.discord = String(100000000000 + r.int(899999999999)); }
        strangers.push(st);
        keys[sk] = { type: "address" };
    }

    // Channels: some with an imchannel record (imlibpurpleservice has synced the server), some
    // not yet; WhatsApp groups whose subject is not known come with their raw id as the name.
    var channels = [], channelRecords = [];
    for (var c = 0; c < 15; c++) {
        var ck = "channel:" + c;
        var svc = r.pick(["type_discord", "type_teams", "type_whatsapp"]);
        var remoteId = svc === "type_whatsapp" ? "1203630" + String(10000000 + r.int(89999999)) + "@g.us"
            : svc === "type_teams" ? "19:" + hex(r, 16) + "@thread.tacv2" : "9" + String(10000000000 + r.int(89999999999));
        var title = "#" + r.pick(["general", "random", "luneos", "dev", "family 👪", "football", "builds"]) + "-" + c;
        var ch = { key: ck, serviceName: svc, remoteId: remoteId, title: title, muted: c === 0,
            rawName: svc === "type_whatsapp" && r.chance(0.5) };
        if (r.chance(0.6)) {
            channelRecords.push({ _kind: "com.palm.imchannel:1", serviceName: svc, remoteId: remoteId,
                displayName: ch.rawName ? remoteId : title, serverId: "srv-" + c, channelIndex: c });
            ch.hasRecord = true;
        }
        channels.push(ch);
        keys[ck] = { type: "channel" };
        if (!ch.rawName) { names[ck] = title; }
    }

    var groups = [];
    for (var g = 0; g < 5; g++) {
        groups.push({ key: "group:" + g, name: "grp-" + hex(r, 10), serviceName: r.pick(["type_teams", "type_discord"]) });
        keys["group:" + g] = { type: "group" };
    }

    // Who talks: a few chatty contacts carry most of the traffic, as in a real mailbox.
    var talkers = persons.map(function (x) { return { conv: "person", who: x.via }; })
        .concat(strangers.map(function (x) { return { conv: "stranger", who: x }; }));
    var weights = talkers.map(function (t, i) { return 1 / (1 + (i * 7919 % talkers.length) / 8); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    function talker() {
        var x = r.next() * total;
        for (var i = 0; i < talkers.length; i++) { x -= weights[i]; if (x <= 0) { return talkers[i]; } }
        return talkers[talkers.length - 1];
    }
    function text() {
        var n = 1 + r.int(4), out = [];
        for (var i = 0; i < n; i++) { out.push(r.pick(WORDS)); }
        return out.join(" ");
    }
    function account(serviceName) {
        return r.pick(ACCOUNTS.filter(function (a) { return a.serviceName === serviceName; }));
    }

    var clock = 1793190000000;
    var messages = [];
    while (messages.length < nMessages) {
        clock += 1000 + r.int(20000);
        var roll = r.next();
        var m;
        if (roll < 0.12) {
            m = channelMessage(r.pick(channels));
        } else if (roll < 0.15) {
            m = groupMessage(r.pick(groups));
        } else if (roll < 0.18) {
            m = multiSms();
        } else {
            m = directMessage(talker().who);
        }
        if (!m) { continue; }
        m.localTimestamp = clock;
        m.messageText = m.messageText || text();
        if (m.folder === "inbox") {
            m.flags = Object.assign({}, m.flags);
            if (r.chance(0.35)) { m.flags.read = true; }
            if (r.chance(0.02)) { m.flags.visible = false; m.expect = []; }
        }
        messages.push(m);
    }

    function directMessage(who) {
        var ways = [];
        if (who.phone) { ways.push("sms"); }
        if (who.teams) { ways.push("type_teams"); }
        if (who.wa) { ways.push("type_whatsapp"); }
        if (who.discord) { ways.push("type_discord"); }
        var svc = r.pick(ways);
        var out = r.chance(0.35);
        var addr;
        if (svc === "sms") { addr = smsForm(who.phone); }
        else if (svc === "type_teams") { addr = teamsForm(who.teams); }
        else if (svc === "type_whatsapp") {
            // The transport writes the JID; the app writes "+<digits>" when it sends.
            addr = out ? r.pick(["+" + who.wa, who.wa + "@s.whatsapp.net"]) : who.wa + "@s.whatsapp.net";
        } else { addr = who.discord; }
        if (svc === "sms") {
            var sm = out ? seedlib.smsOut([addr], "") : seedlib.smsIn(addr, "");
            if (!out && r.chance(0.04)) { sm.smsType = 0x41 + r.int(7); }
            sm.expect = [who.key];
            return sm;
        }
        var acc = account(svc);
        var im = out ? seedlib.imOut(addr, "", { service: svc, account: acc.username })
            : seedlib.imIn(addr, "", { service: svc, account: acc.username, name: r.chance(0.3) ? r.pick(GIVEN) : undefined });
        im.expect = [who.key];
        return im;
    }

    function channelMessage(ch) {
        var out = r.chance(0.2);
        var acc = account(ch.serviceName);
        var speaker = r.chance(0.5) ? persons[r.int(persons.length)].via : null;
        var from = speaker && ch.serviceName === "type_teams" && speaker.teams ? speaker.teams
            : speaker && ch.serviceName === "type_whatsapp" && speaker.wa ? speaker.wa + "@s.whatsapp.net"
            : ch.serviceName === "type_whatsapp" ? nlMobile() + "@s.whatsapp.net" : "member-" + hex(r, 6);
        var opts = { service: ch.serviceName, account: acc.username, channelName: ch.remoteId,
            channelDisplayName: ch.rawName ? ch.remoteId : ch.title, serverName: "Server " + ch.key };
        if (ch.muted && !out) { opts.flags = { noNotification: true }; }
        var m = out ? seedlib.imOut(ch.remoteId, "", opts) : seedlib.imIn(from, "", opts);
        if (out) {
            ["channelName", "channelDisplayName", "serverName"].forEach(function (k) { m[k] = opts[k]; });
        }
        m.expect = [ch.key];
        return m;
    }

    function groupMessage(gr) {
        var acc = account(gr.serviceName);
        var m = r.chance(0.3) ? seedlib.imOut("member-" + hex(r, 6), "", { service: gr.serviceName, account: acc.username })
            : seedlib.imIn("member-" + hex(r, 6), "", { service: gr.serviceName, account: acc.username });
        m.groupChatName = gr.name;
        m.expect = [gr.key];
        return m;
    }

    // One SMS to two or three people: it belongs in each of their conversations.
    function multiSms() {
        var phones = talkers.map(function (t) { return t.who; }).filter(function (w) { return w.phone; });
        var to = [], seen = new Set();
        var n = 2 + r.int(2);
        while (to.length < n) {
            var w = r.pick(phones);
            if (!seen.has(w.key)) { seen.add(w.key); to.push(w); }
        }
        var m = seedlib.smsOut(to.map(function (w) { return smsForm(w.phone); }), "");
        m.expect = to.map(function (w) { return w.key; });
        return m;
    }

    // History arrives late: a sync back-fills older messages after newer ones are in.
    var order = messages.slice();
    for (var i = 0; i < order.length; i++) {
        if (r.chance(0.15)) {
            var j = i + r.int(order.length - i);
            var t = order[i]; order[i] = order[j]; order[j] = t;
        }
    }

    return {
        persons: persons.map(function (x) { return x.record; }),
        late: persons.map(function (x, i) { return x.late ? i : -1; }).filter(function (i) { return i !== -1; }),
        buddies: buddies, channels: channelRecords,
        loginstates: ACCOUNTS.map(function (a) { return Object.assign({ _kind: "com.palm.imloginstate.libpurple:1" }, a); }),
        accounts: ACCOUNTS, messages: order, keys: keys, names: names, prng: r, shuffle: shuffle
    };
}

// What a person's thread is called, worked out from the record as the contacts app shows it.
function expectedName(person) {
    var n = person.name || {};
    var full = [n.givenName, n.familyName].filter(Boolean).join(" ");
    if (full) { return full; }
    if (person.nickname) { return person.nickname; }
    if (person.ims.length) { return person.ims[0].value; }
    return person.phoneNumbers[0].value;
}

module.exports = { generate, prng, ACCOUNTS, IM, SMS };
