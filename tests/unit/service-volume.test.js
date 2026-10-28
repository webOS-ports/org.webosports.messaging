/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * The service against a full mailbox: 300 contacts, 60 strangers, 15 channels, 5 group chats and
 * 800 messages (tests/unit/service/volume.js), delivered in bursts of different sizes with
 * history back-filled out of order, then read elsewhere and partly deleted - all through the bus
 * methods and the db8 watches' revisions, as on a device. Some contacts are only synced halfway
 * through, so their threads start keyed on an address and must be taken over. After each stage the threads are held
 * to the conversations the mailbox was built from:
 *
 *   - every message in exactly the thread(s) of its conversation, each conversation one thread,
 *     no two conversations sharing one; hidden messages left alone
 *   - no thread for one of our own accounts (the reply-under-the-account bug)
 *   - each thread's unread count, summary, time and outgoing flag as its messages say
 *   - each contact's thread under the contact's name, each named channel under its name
 *   - at most one toast per thread per burst, none for the muted channel
 *   - a db8 call budget, so a change that makes threading cost a query per message shows up
 *
 * VOLUME_SEEDS=1,2,3 runs other mailboxes (default: three fixed seeds).
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');

var { ask } = require('./service/palmbus');
var { boot } = require('./service/boot');
var seed = require('./service/seed');
var volume = require('./service/volume');
var address = require('../../service/lib/address.js');

var MESSAGE = "com.palm.message:1";
var THREAD = "com.palm.chatthread:1";

var SEEDS = (process.env.VOLUME_SEEDS || "1,2,3").split(",").map(Number);

function isReplacement(m) { return m.smsType >= 0x41 && m.smsType <= 0x47; }
function visible(m) { return !(m.flags && m.flags.visible === false); }
function unread(m) { return m.folder === "inbox" && visible(m) && !(m.flags && m.flags.read) && !isReplacement(m); }

// Each conversation key -> its thread _id, checking that the mapping is one to one.
function threadsOf(mailbox, stored) {
    var byKey = new Map(), byThread = new Map();
    stored.forEach(function (m) {
        var want = mailbox.expectFor.get(m._id);
        var got = m.conversations || [];
        if (!want.length) {
            assert.deepEqual(got, [], 'a hidden message was threaded: ' + m._id);
            return;
        }
        assert.equal(got.length, want.length, 'message ' + m._id + ' (' + want.join(",") + ') is in ' + got.length + ' threads');
        want.forEach(function (key) {
            var ids = got.filter(function (id) { return !byThread.has(id) || byThread.get(id) === key; });
            assert.ok(ids.length, 'message ' + m._id + ' of ' + key + ' sits only in threads of other conversations: ' +
                got.map(function (id) { return byThread.get(id); }).join(","));
            var id = byKey.has(key) ? byKey.get(key) : ids[0];
            assert.ok(got.indexOf(id) !== -1, key + ' is split over threads ' + byKey.get(key) + ' and ' + got.join(","));
            byKey.set(key, id);
            byThread.set(id, key);
        });
    });
    return byKey;
}

// The thread of each conversation as its messages say it should be.
function checkThreads(env, mailbox, label) {
    var stored = env.db.all(MESSAGE);
    var live = stored.filter(function (m) { return !m._del; });
    var byKey = threadsOf(mailbox, live);
    var threads = new Map(env.db.all(THREAD).filter(function (t) { return !t._del; }).map(function (t) { return [t._id, t]; }));
    var owner = new Map();
    byKey.forEach(function (id, key) { owner.set(id, key); });
    var own = new Set(mailbox.accounts.map(function (a) { return address.normalizeAddress(a.username, a.serviceName); }));

    threads.forEach(function (t, id) {
        assert.ok(!own.has(t.normalizedAddress), label + ': a thread for our own account ' + t.normalizedAddress);
        if (!owner.has(id)) {
            // Only a thread every message has left may be without a conversation.
            assert.equal(t.flags.visible, false, label + ': thread ' + id + ' (' + t.displayName + ') belongs to no conversation');
        }
    });

    byKey.forEach(function (id, key) {
        var t = threads.get(id);
        assert.ok(t, label + ': ' + key + ' points at a missing thread');
        var mine = live.filter(function (m) { return mailbox.expectFor.get(m._id).indexOf(key) !== -1; });
        var newest = mine.reduce(function (a, m) { return !a || m.localTimestamp > a.localTimestamp ? m : a; }, null);
        var want = { unreadCount: mine.filter(unread).length, summary: newest.messageText,
            timestamp: newest.localTimestamp, outgoing: newest.folder === "outbox", visible: true };
        var got = { unreadCount: t.unreadCount, summary: t.summary, timestamp: t.timestamp,
            outgoing: t.flags.outgoing, visible: t.flags.visible };
        assert.deepEqual(got, want, label + ': ' + key + ' (' + t.displayName + ')');
        // A late contact's thread takes its name with the first message after the contact appeared:
        // nothing re-threads when a contact is added on its own.
        if (mailbox.names[key] && (!mailbox.lateKeys.has(key) || mailbox.afterSync.has(key))) {
            assert.equal(t.displayName, mailbox.names[key], label + ': name of ' + key);
        }
    });
    return { conversations: byKey.size, threads: threads.size };
}

// Everything but the messages and the late contacts.
async function load(env, mailbox) {
    var late = new Set(mailbox.late);
    await seed.putAll(env.db, mailbox.persons.filter(function (p, i) { return !late.has(i); }));
    await seed.putAll(env.db, mailbox.loginstates);
    await seed.putAll(env.db, mailbox.channels.map(function (c) {
        var rec = Object.assign({}, c);
        delete rec.channelIndex;
        return rec;
    }));
    await putBuddies(env, mailbox, function (i) { return !late.has(i); });
}

function putBuddies(env, mailbox, which) {
    var list = mailbox.buddies.filter(function (b) { return which(b.personIndex); });
    return seed.putAll(env.tempdb, list.map(function (b) {
        return { _kind: b._kind, username: b.username, serviceName: b.serviceName, personId: mailbox.persons[b.personIndex]._id };
    }));
}

// The contact sync catches up: the late contacts appear.
async function syncLate(env, mailbox) {
    var late = new Set(mailbox.late);
    await seed.putAll(env.db, mailbox.persons.filter(function (p, i) { return late.has(i); }));
    await putBuddies(env, mailbox, function (i) { return late.has(i); });
}

// Put the messages in bursts of 1 to 120 and let the watch fire after each.
async function deliver(env, mailbox) {
    var r = mailbox.prng;
    var rev = 0, i = 0, bursts = 0, synced = false;
    mailbox.expectFor = new Map();
    mailbox.afterSync = new Set();
    mailbox.lateKeys = new Set(mailbox.late.map(function (i) { return "person:" + i; }));
    while (i < mailbox.messages.length) {
        if (!synced && i >= mailbox.messages.length / 2) {
            await syncLate(env, mailbox);
            synced = true;
        }
        var n = 1 + r.int(120);
        var burst = mailbox.messages.slice(i, i + n).map(function (m) {
            var rec = Object.assign({}, m);
            delete rec.expect;
            return rec;
        });
        await seed.putAll(env.db, burst);
        burst.forEach(function (rec, k) {
            var expect = mailbox.messages[i + k].expect;
            mailbox.expectFor.set(rec._id, expect);
            if (synced && visible(rec)) { expect.forEach(function (key) { mailbox.afterSync.add(key); }); }
        });
        i += n;
        var before = env.toasts.length;
        var res = await ask(env.handle, "assignMessages", { lastCheckedRev: rev, $activity: { activityId: 1 } });
        assert.equal(res.returnValue, true, JSON.stringify(res));
        assert.equal(res.parked, 0);
        rev = res.rev;
        bursts++;
        var toastThreads = env.toasts.slice(before).map(function (t) { return t.onclick.params.threadId; });
        assert.equal(new Set(toastThreads).size, toastThreads.length, 'two toasts for one thread in one burst');
        env.burstToasts.push(toastThreads);
    }
    return bursts;
}

describe('a mailbox of 800 messages and 300 contacts', function () {
    SEEDS.forEach(function (s) {
        it('threads, counts, reads and deletes correctly (seed ' + s + ')', async function () {
            var mailbox = volume.generate(s, { persons: 300, messages: 800 });
            var last = mailbox.messages.reduce(function (a, m) { return Math.max(a, m.localTimestamp); }, 0);
            var env = boot({ now: function () { return last + 60000; } });
            env.burstToasts = [];
            await load(env, mailbox);
            env.db.resetCalls();
            env.tempdb.resetCalls();

            var bursts = await deliver(env, mailbox);
            var shape = checkThreads(env, mailbox, 'delivered');
            assert.ok(shape.conversations > 250, 'the mailbox reaches ' + shape.conversations + ' conversations');

            // Budget: the person, thread and channel lookups are cached within a burst, the writes
            // batched, so the calls grow with the conversations a burst touches, not its messages.
            var calls = env.db.calls.find + env.db.calls.get + env.db.calls.put + env.db.calls.merge + env.tempdb.calls.find;
            var budget = 4 * mailbox.messages.length;
            assert.ok(calls <= budget, calls + ' db8 calls for ' + mailbox.messages.length + ' messages in ' + bursts + ' bursts (budget ' + budget + ')');
            assert.ok(env.db.calls.merge <= 2 * bursts + 15, env.db.calls.merge + ' merges for ' + bursts + ' bursts');

            // Toasts: never for the muted channel, and only for the newest unread message.
            var muted = env.db.all(MESSAGE).filter(function (m) { return m.flags && m.flags.noNotification && m.conversations; })
                .map(function (m) { return m.conversations[0]; });
            env.burstToasts.forEach(function (ids) {
                ids.forEach(function (id) { assert.ok(muted.indexOf(id) === -1, 'a toast for the muted channel'); });
            });

            // Read a third of what is unread, somewhere else (the transport, another client).
            var r = mailbox.prng;
            var reads = env.db.all(MESSAGE).filter(function (m) { return unread(m) && r.chance(0.33); })
                .map(function (m) { return { _id: m._id, flags: { read: true } }; });
            var rr = await ask(env.handle, "readChanges", { lastReadRev: 0 });
            await env.db.merge(reads);
            rr = await ask(env.handle, "readChanges", { lastReadRev: rr.rev });
            assert.equal(rr.returnValue, true);
            checkThreads(env, mailbox, 'after reads');

            // Delete one message in twelve, and every message of a few conversations.
            var gone = Array.from(mailbox.expectFor.keys()).filter(function (id) {
                var key = mailbox.expectFor.get(id)[0];
                return r.chance(1 / 12) || key === "person:0" || key === "channel:1";
            });
            var rd = await ask(env.handle, "messagesDeleted", { lastDeletedRev: 0 });
            await env.db.del(gone);
            rd = await ask(env.handle, "messagesDeleted", { lastDeletedRev: rd.rev });
            assert.equal(rd.returnValue, true);
            checkThreads(env, mailbox, 'after deletes');

            env.service.bus.stop();
        });
    });
});

describe('a burst of 500 messages from five chats', function () {
    // What the lookups are cached for: a transport catching up on a busy chat. The cost must
    // follow the chats in the burst, not its messages.
    it('costs a handful of db8 calls per chat', async function () {
        var env = boot({ running: true });
        var mailbox = volume.generate(4, { persons: 50, messages: 10 });
        await seed.putAll(env.db, mailbox.persons);
        var peers = [
            { service: "type_teams", addr: mailbox.persons.find(function (p) { return p.ims.some(function (im) { return im.type === "type_teams"; }); })
                .ims.find(function (im) { return im.type === "type_teams"; }).value },
            { service: "type_teams", addr: "8:orgid:stranger-1" },
            { service: "type_discord", addr: "1234567890123" },
            { service: "sms", addr: "+1 555 010 4477" },
            { service: "type_whatsapp", addr: "31687654321@s.whatsapp.net" }
        ];
        var burst = [];
        for (var i = 0; i < 500; i++) {
            var peer = peers[i % peers.length];
            burst.push(peer.service === "sms" ? seed.smsIn(peer.addr, "m" + i) : seed.imIn(peer.addr, "m" + i, { service: peer.service }));
        }
        await seed.putAll(env.db, burst);
        env.db.resetCalls();
        env.tempdb.resetCalls();
        var r = await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        assert.equal(r.threaded, 500);
        assert.equal(env.db.all(THREAD).length, 5);
        var calls = env.db.calls.find + env.db.calls.get + env.db.calls.put + env.db.calls.merge + env.tempdb.calls.find;
        assert.ok(calls <= 40, calls + ' db8 calls for one burst of 500 messages from 5 chats');
        env.service.bus.stop();
    });
});
