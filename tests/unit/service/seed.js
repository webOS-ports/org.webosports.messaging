/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Records shaped as LuneOS writes them, for the service tests: an IM message as
 * imlibpurpleservice stores it (an incoming one with "to" set to the account itself), a person as
 * the contacts linker builds it, an imchannel as syncServersChannels keeps it.
 */

"use strict";

var IM = "com.palm.immessage.libpurple:1";
var SMS = "com.palm.smsmessage:1";

var clock = 1793190000000;
function tick() { clock += 1000; return clock; }

// An incoming IM: from the peer, to the account.
function imIn(peer, text, opts) {
    opts = opts || {};
    var m = {
        _kind: IM, folder: "inbox", status: "successful", serviceName: opts.service || "type_teams",
        username: opts.account || "luneostest@herrie.org", messageText: text,
        from: { addr: peer }, to: [{ addr: opts.account || "luneostest@herrie.org" }],
        localTimestamp: opts.at || tick()
    };
    if (opts.name) { m.from.name = opts.name; }
    if (opts.flags) { m.flags = opts.flags; }
    ["channelName", "channelDisplayName", "serverName", "serverId", "groupChatName"].forEach(function (k) {
        if (opts[k] !== undefined) { m[k] = opts[k]; }
    });
    return m;
}

// An outgoing IM: from the account, to the peer(s).
function imOut(peers, text, opts) {
    opts = opts || {};
    return {
        _kind: IM, folder: "outbox", status: "successful", serviceName: opts.service || "type_teams",
        username: opts.account || "luneostest@herrie.org", messageText: text,
        from: { addr: opts.account || "luneostest@herrie.org" },
        to: [].concat(peers).map(function (p) { return typeof p === "string" ? { addr: p } : p; }),
        localTimestamp: opts.at || tick(), flags: { visible: true, read: true }
    };
}

function smsIn(number, text, opts) {
    opts = opts || {};
    var m = { _kind: SMS, folder: "inbox", serviceName: "sms", messageText: text,
        from: { addr: number }, localTimestamp: opts.at || tick() };
    if (opts.smsType !== undefined) { m.smsType = opts.smsType; }
    if (opts.flags) { m.flags = opts.flags; }
    return m;
}

function smsOut(numbers, text, opts) {
    opts = opts || {};
    return { _kind: SMS, folder: "outbox", serviceName: "sms", messageText: text,
        to: [].concat(numbers).map(function (n) { return { addr: n }; }),
        localTimestamp: opts.at || tick(), flags: { visible: true, read: true } };
}

// A person with ims [{value, type}] and/or phones [value], as the contacts linker stores it.
function person(fields) {
    var p = { _kind: "com.palm.person:1", name: fields.name || {}, nickname: fields.nickname || "",
        contactIds: fields.contactIds || [], ims: [], phoneNumbers: [] };
    (fields.ims || []).forEach(function (im) {
        p.ims.push({ value: im.value, type: im.type, normalizedValue: im.normalizedValue || String(im.value).trim().toLowerCase() });
    });
    (fields.phones || []).forEach(function (ph) {
        // The contacts framework's search form, for a number without an extension.
        var digits = String(ph).replace(/\D/g, "");
        var subscriber = digits.slice(-Math.min(digits.length, fields.subscriberLength || 8));
        p.phoneNumbers.push({ value: ph, normalizedValue: "-" + subscriber.split("").reverse().join("") + "-" });
    });
    return p;
}

async function putAll(db, objects) {
    var r = await db.put(objects);
    objects.forEach(function (o, i) { o._id = r[i].id; o._rev = r[i].rev; });
    return objects;
}

module.exports = { IM, SMS, imIn, imOut, smsIn, smsOut, person, putAll, tick };
