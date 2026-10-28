/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/lib/migrate.js through the service: a database as the Foundations threader left it,
 * then the first assignMessages after the update.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');

var { ask } = require('./service/palmbus');
var { boot } = require('./service/boot');
var seed = require('./service/seed');

var MESSAGE = "com.palm.message:1";
var THREAD = "com.palm.chatthread:1";
var ACCOUNT = "luneostest@herrie.org";

function thread(fields) {
    return Object.assign({ _kind: THREAD, unreadCount: 0, summary: "", timestamp: 0, flags: { visible: true } }, fields);
}

// A message already in thread(s), as the old threader stored it.
function inThread(msg, threads) {
    msg.conversations = [].concat(threads).map(function (t) { return t._id; });
    return msg;
}

function live(env, kind) { return env.db.all(kind).filter(function (r) { return !r._del; }); }

async function withLogin(env) {
    await seed.putAll(env.db, [{ _kind: "com.palm.imloginstate.libpurple:1", serviceName: "type_teams", username: ACCOUNT, accountId: "acc" }]);
}

describe('the migration from the old threader', function () {
    it('joins a WhatsApp thread keyed without the + into the E.164 one, messages and counts', async function () {
        var env = boot();
        var old = (await seed.putAll(env.db, [thread({ normalizedAddress: "31612345678", replyService: "type_whatsapp", displayName: "Old", timestamp: 1 })]))[0];
        var now = (await seed.putAll(env.db, [thread({ normalizedAddress: "+31612345678", replyService: "type_whatsapp", displayName: "New", timestamp: 2 })]))[0];
        await seed.putAll(env.db, [
            inThread(seed.imIn("31612345678@s.whatsapp.net", "one", { service: "type_whatsapp" }), old),
            inThread(seed.imIn("31612345678@s.whatsapp.net", "two", { service: "type_whatsapp" }), old),
            inThread(seed.imOut("+31612345678", "three", { service: "type_whatsapp" }), now)
        ]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var threads = live(env, THREAD);
        assert.equal(threads.length, 1);
        assert.equal(threads[0].normalizedAddress, "+31612345678");
        assert.ok(live(env, MESSAGE).every(function (m) { return m.conversations.length === 1 && m.conversations[0] === threads[0]._id; }));
        assert.equal(threads[0].unreadCount, 2);
        assert.equal(threads[0].summary, "three");
        // And the next message from that chat finds it.
        await seed.putAll(env.db, [seed.imIn("31612345678@s.whatsapp.net", "four", { service: "type_whatsapp" })]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        assert.equal(live(env, THREAD).length, 1);
        assert.equal(live(env, THREAD)[0].summary, "four");
        env.service.bus.stop();
    });

    it('re-keys a lone thread kept under the JID, and keeps the contact\'s thread when joining', async function () {
        var env = boot();
        var jid = (await seed.putAll(env.db, [thread({ normalizedAddress: "31611111111@s.whatsapp.net", replyService: "type_whatsapp", timestamp: 9 })]))[0];
        var bare = (await seed.putAll(env.db, [thread({ normalizedAddress: "31622222222", replyService: "type_whatsapp", timestamp: 9 })]))[0];
        var withContact = (await seed.putAll(env.db, [thread({ normalizedAddress: "31622222222@s.whatsapp.net", replyService: "type_whatsapp", personId: "p1", timestamp: 1 })]))[0];
        await seed.putAll(env.db, [inThread(seed.imIn("31611111111@s.whatsapp.net", "a", { service: "type_whatsapp" }), jid),
            inThread(seed.imIn("31622222222@s.whatsapp.net", "b", { service: "type_whatsapp" }), bare)]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var threads = live(env, THREAD);
        assert.deepEqual(threads.map(function (t) { return t.normalizedAddress; }).sort(), ["+31611111111", "+31622222222"]);
        var kept = threads.find(function (t) { return t.normalizedAddress === "+31622222222"; });
        assert.equal(kept._id, withContact._id, 'the address-only thread must go into the contact\'s, not the other way');
        env.service.bus.stop();
    });

    it('never joins the threads of two different contacts, and leaves channels alone', async function () {
        var env = boot();
        await seed.putAll(env.db, [
            thread({ normalizedAddress: "31633333333", replyService: "type_whatsapp", personId: "p1", timestamp: 2 }),
            thread({ normalizedAddress: "+31633333333", replyService: "type_whatsapp", personId: "p2", timestamp: 1 }),
            thread({ normalizedAddress: "120363012345678@g.us", replyService: "type_whatsapp", channelId: "ch1", timestamp: 1 }),
            thread({ normalizedAddress: "120363012345678@g.us", replyService: "type_whatsapp", channelId: "ch2", timestamp: 1 })
        ]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var threads = live(env, THREAD);
        assert.equal(threads.length, 4);
        assert.deepEqual(threads.filter(function (t) { return t.personId; }).map(function (t) { return t.normalizedAddress; }), ["+31633333333", "+31633333333"]);
        assert.equal(threads.filter(function (t) { return t.channelId; }).length, 2);
        env.service.bus.stop();
    });

    it('threads the messages of a thread named after our own account under their senders', async function () {
        var env = boot();
        await withLogin(env);
        var own = (await seed.putAll(env.db, [thread({ normalizedAddress: ACCOUNT, replyService: "type_teams", displayName: ACCOUNT, unreadCount: 3 })]))[0];
        var alice = (await seed.putAll(env.db, [thread({ normalizedAddress: "alice@x", replyService: "type_teams", displayName: "alice@x" })]))[0];
        await seed.putAll(env.db, [
            inThread(seed.imOut("alice@x", "hi alice"), alice),
            inThread(seed.imIn("alice@x", "reply from alice"), own),
            inThread(seed.imIn("bob@x", "reply from bob"), own),
            inThread(seed.imIn("bob@x", "bob again"), own)
        ]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var threads = live(env, THREAD);
        assert.ok(!threads.some(function (t) { return t._id === own._id; }), 'the own-account thread is still there');
        assert.deepEqual(threads.map(function (t) { return t.normalizedAddress; }).sort(), ["alice@x", "bob@x"]);
        var a = threads.find(function (t) { return t._id === alice._id; });
        assert.equal(a.summary, "reply from alice");
        assert.equal(a.unreadCount, 1);
        var b = threads.find(function (t) { return t.normalizedAddress === "bob@x"; });
        assert.equal(b.unreadCount, 2);
        assert.ok(live(env, MESSAGE).every(function (m) { return m.conversations.length === 1 && m.conversations[0] !== own._id; }));
        env.service.bus.stop();
    });

    it('runs from the read watch too, which is the one that fires at boot', async function () {
        var env = boot();
        await seed.putAll(env.db, [thread({ normalizedAddress: "31666666666", replyService: "type_whatsapp" })]);
        await ask(env.handle, "readChanges", { lastReadRev: 0 });
        assert.equal(live(env, THREAD)[0].normalizedAddress, "+31666666666");
        env.service.bus.stop();
    });

    it('runs once, and again after a migration that failed', async function () {
        var env = boot();
        await withLogin(env);
        env.db.failNext("find", 1);
        await seed.putAll(env.db, [thread({ normalizedAddress: "31644444444", replyService: "type_whatsapp" })]);
        var r = await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        assert.equal(r.returnValue, true, 'a failed migration must not fail the activation');
        assert.equal(live(env, THREAD)[0].normalizedAddress, "31644444444");
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        assert.equal(live(env, THREAD)[0].normalizedAddress, "+31644444444");
        // Done now: a thread like it that turns up later is left as it is.
        await seed.putAll(env.db, [thread({ normalizedAddress: "31655555555", replyService: "type_whatsapp" })]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        assert.ok(live(env, THREAD).some(function (t) { return t.normalizedAddress === "31655555555"; }));
        env.service.bus.stop();
    });
});
