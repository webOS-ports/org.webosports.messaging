/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/lib/threader.js through assign.js, on an in-memory db8: which conversation a message
 * lands in, and what it does to it. Each case is a way the threader went wrong before, or one
 * the legacy chatthreader already had a fix for that the LuneOS service lacked.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');

var { createFakeDb } = require('./service/fakedb');
var seed = require('./service/seed');
var { createAssigner } = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'assign.js'));

var quiet = { log: function () {}, error: function () {} };
var THREAD = "com.palm.chatthread:1";
var MESSAGE = "com.palm.message:1";

async function setup(records) {
    var db = createFakeDb();
    var tempdb = createFakeDb({ name: "tmp" });
    if (records && records.length) { await seed.putAll(db, records); }
    return { db: db, tempdb: tempdb };
}

// Store the messages as the transports would, then let the service thread them.
async function deliver(env, msgs, opts) {
    await seed.putAll(env.db, msgs);
    var assigner = createAssigner(Object.assign({ db: env.db, tempdb: env.tempdb, log: quiet }, opts || {}));
    return assigner.assign(0);
}

function threads(env) { return env.db.all(THREAD); }
function threadOf(env, msg) {
    var m = env.db.all(MESSAGE).find(function (r) { return r._id === msg._id; });
    assert.ok(m.conversations && m.conversations.length, 'message ' + msg.messageText + ' was not threaded');
    return threads(env).find(function (t) { return t._id === m.conversations[0]; });
}

describe('threading a message', function () {
    it('puts a reply under its sender, not under the account it was sent to', async function () {
        var herman = seed.person({ name: { givenName: "Herman van", familyName: "Hazendonk" },
            ims: [{ value: "herrie.1982", type: "type_teams" }] });
        var env = await setup([herman]);
        var out = seed.imOut("herrie.1982", "debug test from VM");
        var reply = seed.imIn("herrie.1982", "Test to VM");
        await deliver(env, [out, reply]);
        var t = threadOf(env, reply);
        assert.equal(t._id, threadOf(env, out)._id);
        assert.equal(t.personId, herman._id);
        assert.equal(t.displayName, "Herman van Hazendonk");
        assert.equal(threads(env).length, 1);
        assert.ok(!threads(env).some(function (x) { return /luneostest/.test(x.displayName + x.normalizedAddress); }));
    });

    it('puts an outgoing message under each recipient', async function () {
        var env = await setup();
        var msg = seed.smsOut(["5551234567", "5559876543"], "hi both");
        await deliver(env, [msg]);
        var m = env.db.all(MESSAGE)[0];
        assert.equal(m.conversations.length, 2);
        assert.deepEqual(threads(env).map(function (t) { return t.normalizedAddress; }).sort(), ["5551234567", "5559876543"]);
    });

    it('keeps a channel in one thread whoever speaks, linked to its imchannel', async function () {
        var channel = { _kind: "com.palm.imchannel:1", serviceName: "type_discord", remoteId: "chan-42",
            serverId: "server-rec-1", displayName: "general" };
        var env = await setup([channel]);
        var opts = { service: "type_discord", account: "me", channelName: "chan-42", channelDisplayName: "general", serverName: "LuneOS" };
        var a = seed.imIn("alice", "hello", opts);
        var b = seed.imIn("bob", "hi alice", opts);
        await deliver(env, [a, b]);
        var t = threadOf(env, a);
        assert.equal(threadOf(env, b)._id, t._id);
        assert.equal(threads(env).length, 1);
        assert.equal(t.displayName, "general");
        assert.equal(t.channelId, channel._id);
        assert.equal(t.serverId, "server-rec-1");
        assert.equal(t.replyAddress, "chan-42");
        assert.equal(env.db.all("com.palm.imchannel:1")[0].chatThreadId, t._id);
        assert.equal(t.unreadCount, 2);
    });

    it('never names a channel by its raw id, and takes its real title when one arrives', async function () {
        var env = await setup();
        var opts = { service: "type_whatsapp", account: "+31600000000", channelName: "120363025246125486@g.us", serverName: "WhatsApp" };
        var first = seed.imIn("31611111111@s.whatsapp.net", "x", Object.assign({ channelDisplayName: "120363025246125486@g.us" }, opts));
        await deliver(env, [first]);
        assert.equal(threadOf(env, first).displayName, "WhatsApp");
        var later = seed.imIn("31611111111@s.whatsapp.net", "y", Object.assign({ channelDisplayName: "Family" }, opts));
        await deliver(env, [later]);
        assert.equal(threadOf(env, later)._id, threadOf(env, first)._id);
        assert.equal(threadOf(env, later).displayName, "Family");
    });

    it('finds a channel thread started before its imchannel existed, and links it', async function () {
        var env = await setup();
        var opts = { service: "type_discord", account: "me", channelName: "chan-7", channelDisplayName: "dev" };
        var a = seed.imIn("alice", "first", opts);
        await deliver(env, [a]);
        var channel = { _kind: "com.palm.imchannel:1", serviceName: "type_discord", remoteId: "chan-7", serverId: "srv" };
        await seed.putAll(env.db, [channel]);
        var b = seed.imIn("bob", "second", opts);
        await deliver(env, [b]);
        assert.equal(threadOf(env, b)._id, threadOf(env, a)._id);
        assert.equal(threadOf(env, b).channelId, channel._id);
        assert.equal(env.db.all("com.palm.imchannel:1")[0].chatThreadId, threadOf(env, a)._id);
    });

    it('keeps a group chat in one thread', async function () {
        var env = await setup();
        var a = seed.imIn("alice", "a", { groupChatName: "room@conference" });
        var b = seed.imIn("bob", "b", { groupChatName: "room@conference" });
        await deliver(env, [a, b]);
        assert.equal(threadOf(env, a)._id, threadOf(env, b)._id);
        assert.equal(threads(env).length, 1);
    });

    it('threads every WhatsApp spelling of a number together, and finds a contact stored with +', async function () {
        var ben = seed.person({ name: { givenName: "Ben" }, ims: [{ value: "+31612345678", type: "type_whatsapp" }] });
        var env = await setup([ben]);
        var opts = { service: "type_whatsapp", account: "+31600000000" };
        var out = seed.imOut("+31612345678", "hoi", opts);
        var inc = seed.imIn("31612345678@s.whatsapp.net", "hoi terug", opts);
        await deliver(env, [out, inc]);
        assert.equal(threadOf(env, out)._id, threadOf(env, inc)._id);
        assert.equal(threadOf(env, inc).personId, ben._id);
        assert.equal(threadOf(env, inc).normalizedAddress, "+31612345678");
    });

    it('threads an SMS however the number is written, and finds its contact', async function () {
        var ann = seed.person({ name: { givenName: "Ann" }, phones: ["+31 6 12345678"] });
        var env = await setup([ann]);
        var a = seed.smsIn("+31612345678", "one");
        var b = seed.smsIn("06 12345678", "two");
        await deliver(env, [a, b]);
        assert.equal(threadOf(env, a).personId, ann._id);
        assert.equal(threadOf(env, b)._id, threadOf(env, a)._id);
        assert.equal(threadOf(env, a).displayName, "Ann");
    });

    it('adopts the thread a contact had before it was linked, instead of starting another', async function () {
        var env = await setup();
        var first = seed.imIn("newfriend", "hi", { name: "New Friend" });
        await deliver(env, [first]);
        var before = threadOf(env, first);
        assert.equal(before.personId, undefined);
        var friend = seed.person({ name: { givenName: "Nina" }, ims: [{ value: "newfriend", type: "type_teams" }] });
        await seed.putAll(env.db, [friend]);
        var second = seed.imIn("newfriend", "again");
        await deliver(env, [second]);
        var after = threadOf(env, second);
        assert.equal(after._id, before._id);
        assert.equal(after.personId, friend._id);
        assert.equal(after.displayName, "Nina");
        assert.equal(threads(env).length, 1);
    });

    it('names a non-contact thread by the sender name and never replaces it with the address', async function () {
        var env = await setup();
        var a = seed.imIn("herrie.1982", "hi", { name: "Herrie 🦊" });
        await deliver(env, [a]);
        assert.equal(threadOf(env, a).displayName, "Herrie 🦊");
        var b = seed.imIn("herrie.1982", "no name this time");
        await deliver(env, [b]);
        assert.equal(threadOf(env, b).displayName, "Herrie 🦊");
        var c = seed.imIn("nobody.named", "hello");
        await deliver(env, [c]);
        assert.equal(threadOf(env, c).displayName, "nobody.named");
    });

    it('picks the contact on the account the message came in on when several share the address', async function () {
        var other = seed.person({ name: { givenName: "Work Alex" }, ims: [{ value: "alex", type: "type_teams" }], contactIds: ["c-work"] });
        var mine = seed.person({ name: { givenName: "Home Alex" }, ims: [{ value: "alex", type: "type_teams" }], contactIds: ["c-home"] });
        var env = await setup([other, mine,
            { _kind: "com.palm.contact:1", _id: "c-work", accountId: "acc-work" },
            { _kind: "com.palm.contact:1", _id: "c-home", accountId: "acc-home" },
            { _kind: "com.palm.imloginstate.libpurple:1", serviceName: "type_teams", username: "work@corp", accountId: "acc-work" },
            { _kind: "com.palm.imloginstate.libpurple:1", serviceName: "type_teams", username: "luneostest@herrie.org", accountId: "acc-home" }]);
        var m = seed.imIn("alex", "hi");
        await deliver(env, [m]);
        assert.equal(threadOf(env, m).personId, mine._id);
    });

    it('takes up the contact\'s name when it is given one after the thread was made', async function () {
        var ben = seed.person({ ims: [{ value: "+31612345678", type: "type_signal" }] });
        var env = await setup([ben]);
        var opts = { service: "type_signal", account: "+31600000000" };
        var first = seed.imIn("+31612345678", "hoi", opts);
        await deliver(env, [first]);
        assert.equal(threadOf(env, first).displayName, "+31612345678");
        await env.db.merge([{ _id: ben._id, name: { givenName: "Ben" } }]);
        var second = seed.imIn("+31612345678", "nog een", opts);
        await deliver(env, [second]);
        assert.equal(threadOf(env, second)._id, threadOf(env, first)._id);
        assert.equal(threadOf(env, second).displayName, "Ben");
    });

    it('replies on the service and address the newest message came in on', async function () {
        var ben = seed.person({ name: { givenName: "Ben" }, ims: [
            { value: "+31612345678", type: "type_whatsapp" },
            { value: "+31612345678", type: "type_signal" }] });
        var env = await setup([ben]);
        var wa = seed.imIn("31612345678@s.whatsapp.net", "via whatsapp", { service: "type_whatsapp", account: "+31600000000" });
        await deliver(env, [wa]);
        assert.equal(threadOf(env, wa).replyService, "type_whatsapp");
        var signal = seed.imIn("+31612345678", "via signal", { service: "type_signal", account: "+31600000000" });
        await deliver(env, [signal]);
        var t = threadOf(env, signal);
        assert.equal(t._id, threadOf(env, wa)._id);
        assert.equal(t.replyService, "type_signal");
        assert.equal(t.replyAddress, "+31612345678");
        assert.equal(threads(env).length, 1);
    });

    it('falls back to the buddy record when no contact im matches', async function () {
        var zed = seed.person({ name: { givenName: "Zed" }, ims: [] });
        var env = await setup([zed]);
        await env.tempdb.put([{ _kind: "com.palm.imbuddystatus:1", username: "zed#1234", serviceName: "type_discord", personId: zed._id }]);
        var m = seed.imIn("zed#1234", "yo", { service: "type_discord", account: "me" });
        await deliver(env, [m]);
        assert.equal(threadOf(env, m).personId, zed._id);
    });
});

describe('what a message does to its thread', function () {
    it('counts unread incoming messages, a muted one included, and nothing else', async function () {
        var env = await setup();
        await deliver(env, [
            seed.imIn("p", "unread"),
            seed.imIn("p", "muted", { flags: { noNotification: true } }),
            seed.imIn("p", "read", { flags: { read: true } }),
            seed.imOut("p", "mine"),
            seed.smsIn("5551234567", "replacement", { smsType: 0x41 }),
            seed.smsIn("5551234567", "normal")
        ]);
        var byAddr = {};
        threads(env).forEach(function (t) { byAddr[t.normalizedAddress] = t; });
        assert.equal(byAddr.p.unreadCount, 2);
        assert.equal(byAddr["5551234567"].unreadCount, 1);
    });

    it('marks a thread outgoing for a message sent and clears it for a reply', async function () {
        var env = await setup();
        var out = seed.imOut("p", "sent");
        await deliver(env, [out]);
        assert.equal(threadOf(env, out).flags.outgoing, true);
        var reply = seed.imIn("p", "reply");
        await deliver(env, [reply]);
        assert.equal(threadOf(env, reply).flags.outgoing, false);
        assert.equal(threadOf(env, reply).summary, "reply");
    });

    it('does not let back-filled history take the summary or move the thread back in time', async function () {
        var env = await setup();
        var now = seed.imIn("p", "latest");
        await deliver(env, [now]);
        var old = seed.imIn("p", "from last year", { at: now.localTimestamp - 365 * 86400000 });
        await deliver(env, [old]);
        var t = threadOf(env, old);
        assert.equal(t.summary, "latest");
        assert.equal(t.timestamp, now.localTimestamp);
        assert.equal(t.unreadCount, 2);
    });

    it('shows a hidden thread again when a message comes in', async function () {
        var env = await setup();
        var a = seed.imIn("p", "one");
        await deliver(env, [a]);
        await env.db.merge([{ _id: threadOf(env, a)._id, flags: { visible: false } }]);
        var b = seed.imIn("p", "two");
        await deliver(env, [b]);
        assert.equal(threadOf(env, b).flags.visible, true);
    });

    // Muted, archived and pinned are set by the app's Chats list (app/src/util/chatFlags.js).
    async function chatWith(flags) {
        var env = await setup();
        var a = seed.imIn("p", "one", { flags: { read: true } });
        await deliver(env, [a]);
        var id = threadOf(env, a)._id;
        await env.db.merge([{ _id: id, flags: flags }]);
        var seen = null;
        var notifier = { notify: function (newest) { seen = newest; return Promise.resolve(newest.size); } };
        var b = seed.imIn("p", "two");
        await deliver(env, [b], { notifier: notifier });
        return { thread: threadOf(env, b), notified: Array.from(seen.keys()), id: id };
    }

    it('brings an archived chat back with a new message, and notifies', async function () {
        var r = await chatWith({ archived: true, pinned: false });
        assert.equal(r.thread.flags.archived, false);
        assert.equal(r.thread.flags.visible, true);
        assert.deepEqual(r.notified, [r.id]);
    });

    it('keeps a muted chat quiet, and archived if it was, but still counts the message', async function () {
        var r = await chatWith({ archived: true, muted: true });
        assert.equal(r.thread.flags.archived, true);
        assert.equal(r.thread.flags.muted, true);
        assert.equal(r.thread.unreadCount, 1);
        assert.equal(r.thread.summary, "two");
        assert.deepEqual(r.notified, []);
        var m = await chatWith({ muted: true });
        assert.equal(m.thread.flags.archived, undefined);
        assert.deepEqual(m.notified, []);
    });

    it('keeps the flags the app set on a chat when a message comes in', async function () {
        var r = await chatWith({ pinned: true, markedUnread: true });
        assert.equal(r.thread.flags.pinned, true);
        assert.equal(r.thread.flags.markedUnread, true);
        assert.equal(r.thread.flags.archived, undefined);
        assert.deepEqual(r.notified, [r.id]);
    });

    it('does not bring an archived chat back for a message I sent or one already read', async function () {
        var env = await setup();
        var a = seed.imIn("p", "one", { flags: { read: true } });
        await deliver(env, [a]);
        var id = threadOf(env, a)._id;
        await env.db.merge([{ _id: id, flags: { archived: true } }]);
        await deliver(env, [seed.imOut("p", "from my other phone"), seed.imIn("p", "read there", { flags: { read: true } })]);
        assert.equal(threads(env).find(function (t) { return t._id === id; }).flags.archived, true);
    });

    it('puts a message with no address in a "No Recipient" thread, even without flags', async function () {
        var env = await setup();
        var m = { _kind: seed.IM, folder: "inbox", serviceName: "type_teams", messageText: "?", localTimestamp: seed.tick() };
        await deliver(env, [m]);
        assert.equal(threadOf(env, m).displayName, "No Recipient");
    });

    it('takes an MMS summary from its text part and a subject over the body', async function () {
        var env = await setup();
        var mms = { _kind: seed.SMS, folder: "inbox", serviceName: "mms", from: { addr: "5551234567" },
            attachments: [{ mimeType: "image/jpeg" }, { mimeType: "text/plain", partText: "look" }], localTimestamp: seed.tick() };
        var subj = seed.imIn("q", "body", {});
        subj.subject = "Subject";
        await deliver(env, [mms, subj]);
        assert.equal(threadOf(env, mms).summary, "look");
        assert.equal(threadOf(env, subj).summary, "Subject");
    });

    it('writes threads and messages without _rev, so a concurrent change by the app cannot refuse them', async function () {
        var env = await setup();
        var a = seed.imIn("p", "one");
        await deliver(env, [a]);
        var merges = [];
        var real = env.db.merge;
        env.db.merge = function (objects) { merges.push.apply(merges, objects); return real(objects); };
        await deliver(env, [seed.imIn("p", "two")]);
        assert.ok(merges.length >= 2);
        merges.forEach(function (o) { assert.equal(o._rev, undefined, JSON.stringify(o)); });
    });
});
