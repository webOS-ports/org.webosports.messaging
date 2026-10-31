/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/service.js on a stand-in bus, with db8, tempdb, activitymanager, the notification
 * service and the application manager behind it: each method end to end, the watches re-armed
 * on the revision they reached, and the toast rules.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var { ask } = require('./service/palmbus');
var { boot, SERVICE } = require('./service/boot');
var seed = require('./service/seed');

var { activitySpec } = require(path.join(SERVICE, 'lib', 'activity.js'));

var MESSAGE = "com.palm.message:1";
var THREAD = "com.palm.chatthread:1";

describe('the messaging service on the bus', function () {
    it('registers its methods under its name', function () {
        var env = boot();
        assert.equal(env.handle.name, "org.webosports.service.messaging");
        assert.deepEqual(env.handle.methods.sort(), ["/assignMessages", "/deleteChatthread", "/info", "/messagesDeleted",
            "/putMessage", "/quit", "/readChanges", "/updateThreadValues"]);
        env.service.bus.stop();
    });

    it('assignMessages threads, then completes its activity with the trigger moved on', async function () {
        var env = boot();
        var msgs = await seed.putAll(env.db, [seed.imIn("a", "x"), seed.imIn("b", "y")]);
        var r = await ask(env.handle, "assignMessages", { lastCheckedRev: 0, $activity: { activityId: 7 } });
        assert.equal(r.returnValue, true);
        assert.equal(r.threaded, 2);
        var complete = env.am.find(function (c) { return c.method === "complete"; });
        assert.ok(complete, 'no complete on luna://com.palm.activitymanager (see activity.js for why that name)');
        assert.equal(complete.args.activityId, 7);
        assert.equal(complete.args.restart, true);
        assert.equal(complete.args.callback.params.lastCheckedRev, r.rev);
        var revCond = complete.args.trigger.params.query.where.find(function (w) { return w.prop === "_rev"; });
        assert.equal(revCond.val, r.rev);
        assert.ok(r.rev >= msgs[1]._rev);
        env.service.bus.stop();
    });

    it('creates the activity again, from where it got to, when it may not complete it', async function () {
        var env = boot({ completeFails: true });
        await seed.putAll(env.db, [seed.imIn("a", "x")]);
        var r = await ask(env.handle, "assignMessages", { lastCheckedRev: 0, $activity: { activityId: 7 } });
        var create = env.am.find(function (c) { return c.method === "create"; });
        assert.ok(create, 'no create after a refused complete');
        assert.deepEqual(create.args, activitySpec("assignMessages", r.rev));
        assert.ok(r.rev > 0);
        env.service.bus.stop();
    });

    it('starts a watch from the revision it reached before, not from the 0 a boot gives it', async function () {
        var env = boot();
        var msgs = await seed.putAll(env.db, [seed.imIn("a", "x")]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        await env.db.merge([{ _id: msgs[0]._id, flags: { read: true } }]);
        var first = await ask(env.handle, "readChanges", { lastReadRev: 0 });
        assert.equal(first.threads, 1);
        assert.ok(first.rev > 0);
        var second = await ask(env.handle, "readChanges", { lastReadRev: 0 });
        assert.equal(second.rev, first.rev);
        assert.equal(second.threads, 0, 'the same reads were recounted again');
        env.service.bus.stop();
    });

    it('readChanges recounts a thread when its messages are read elsewhere', async function () {
        var env = boot();
        var msgs = await seed.putAll(env.db, [seed.imIn("a", "1"), seed.imIn("a", "2")]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var t = env.db.all(THREAD)[0];
        assert.equal(t.unreadCount, 2);
        var r0 = await ask(env.handle, "readChanges", { lastReadRev: 0 });
        await env.db.merge([{ _id: msgs[0]._id, flags: { read: true } }]);
        await ask(env.handle, "readChanges", { lastReadRev: r0.rev });
        assert.equal(env.db.all(THREAD)[0].unreadCount, 1);
        env.service.bus.stop();
    });

    it('messagesDeleted takes the summary from what is left, and hides an emptied thread', async function () {
        var env = boot();
        var msgs = await seed.putAll(env.db, [seed.imIn("a", "older"), seed.imIn("a", "newest")]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var d0 = await ask(env.handle, "messagesDeleted", { lastDeletedRev: 0 });
        await env.db.del([msgs[1]._id]);
        var d1 = await ask(env.handle, "messagesDeleted", { lastDeletedRev: d0.rev });
        var t = env.db.all(THREAD)[0];
        assert.equal(t.summary, "older");
        assert.equal(t.unreadCount, 1);
        await env.db.del([msgs[0]._id]);
        await ask(env.handle, "messagesDeleted", { lastDeletedRev: d1.rev });
        assert.equal(env.db.all(THREAD)[0].flags.visible, false);
        env.service.bus.stop();
    });

    it('putMessage threads and stores a message, and keeps a thread the app already knows', async function () {
        var env = boot();
        var r = await ask(env.handle, "putMessage", { message: seed.imOut("a", "hello") });
        assert.equal(r.returnValue, true);
        assert.equal(r.threadids.length, 1);
        var stored = env.db.all(MESSAGE)[0];
        assert.deepEqual(stored.conversations, r.threadids);
        // A reply from a thread the app opened itself: it stays there, wherever the threader
        // would have put it.
        var opened = await seed.putAll(env.db, [{ _kind: THREAD, displayName: "A", normalizedAddress: "a-other",
            replyAddress: "a", replyService: "type_teams", unreadCount: 0, summary: "", timestamp: 0, flags: { visible: true } }]);
        var again = seed.imOut("a", "again");
        again.conversations = [opened[0]._id];
        var r2 = await ask(env.handle, "putMessage", { message: again });
        assert.deepEqual(r2.threadids, [opened[0]._id]);
        assert.equal(env.db.all(THREAD).length, 2);
        assert.equal(env.db.all(THREAD).find(function (t) { return t._id === opened[0]._id; }).summary, "again");
        assert.equal((await ask(env.handle, "putMessage", {})).errorCode, "MISSING_ARGS");
        assert.equal((await ask(env.handle, "putMessage", { message: { to: [{ addr: "x" }] } })).errorCode, "BAD_ARGS");
        env.service.bus.stop();
    });

    it('deleteChatthread deletes its messages, keeps ones also in another thread, and unlinks its channel', async function () {
        var env = boot();
        var only = seed.imIn("a", "only here");
        var shared = seed.smsOut(["5551234567", "5559876543"], "to both");
        await seed.putAll(env.db, [only, shared]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var tA = env.db.all(MESSAGE).find(function (m) { return m._id === only._id; }).conversations[0];
        var sharedIds = env.db.all(MESSAGE).find(function (m) { return m._id === shared._id; }).conversations;
        var chan = { _kind: "com.palm.imchannel:1", serviceName: "type_discord", remoteId: "c", chatThreadId: sharedIds[0] };
        await seed.putAll(env.db, [chan]);
        var r = await ask(env.handle, "deleteChatthread", { threadId: tA });
        assert.equal(r.deleted, 1);
        r = await ask(env.handle, "deleteChatthread", { threadId: sharedIds[0] });
        assert.equal(r.kept, 1);
        var left = env.db.all(MESSAGE);
        assert.equal(left.length, 1);
        assert.deepEqual(left[0].conversations, [sharedIds[1]]);
        assert.equal(env.db.all("com.palm.imchannel:1")[0].chatThreadId, null);
        assert.deepEqual(env.db.all(THREAD).map(function (t) { return t._id; }), [sharedIds[1]]);
        env.service.bus.stop();
    });

    it('updateThreadValues recounts the thread from its messages', async function () {
        var env = boot();
        await seed.putAll(env.db, [seed.imIn("a", "1"), seed.imIn("a", "2")]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var t = env.db.all(THREAD)[0];
        await env.db.merge([{ _id: t._id, unreadCount: 9, summary: "stale" }]);
        var r = await ask(env.handle, "updateThreadValues", { threadId: t._id });
        assert.equal(r.updated, 1);
        assert.equal(env.db.all(THREAD)[0].unreadCount, 2);
        assert.equal(env.db.all(THREAD)[0].summary, "2");
        env.service.bus.stop();
    });
});

describe('toasts for new messages', function () {
    async function deliverOne(opts, msgOpts, prefs) {
        var env = boot(opts);
        if (prefs) { await env.db.put([Object.assign({ _kind: "com.palm.app.messagingprefs:1" }, prefs)]); }
        await seed.putAll(env.db, [seed.imIn("a", "ping", Object.assign({ name: "Alice 🦊", at: Date.now() - 1000 }, msgOpts || {}))]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        env.service.bus.stop();
        return env.toasts;
    }

    it('raises one, under the app, while the app is not running', async function () {
        var toasts = await deliverOne({});
        assert.equal(toasts.length, 1);
        assert.equal(toasts[0].sourceId, "org.webosports.app.messaging");
        assert.equal(toasts[0].title, "Alice");
        assert.equal(toasts[0].message, "ping");
        assert.equal(toasts[0].onclick.appId, "org.webosports.app.messaging");
        assert.ok(toasts[0].onclick.params.threadId);
    });

    it('leaves it to the app while the app runs', async function () {
        assert.equal((await deliverOne({ running: true })).length, 0);
    });

    it('stays quiet for a muted chat, back-filled history, and when notifications are off', async function () {
        assert.equal((await deliverOne({}, { flags: { noNotification: true } })).length, 0);
        assert.equal((await deliverOne({}, { at: Date.now() - 2 * 3600000 })).length, 0);
        assert.equal((await deliverOne({}, { at: Date.now() - 2 * 3600000 }, { notifyMaxAgeMinutes: -1 })).length, 1);
        assert.equal((await deliverOne({}, {}, { enableNotification: false })).length, 0);
    });
});

describe('the activity files', function () {
    it('create each watch exactly as the service re-arms it', function () {
        var dir = path.join(SERVICE, 'configuration', 'activities', 'org.webosports.service.messaging');
        var files = fs.readdirSync(dir).sort();
        assert.deepEqual(files, ["org.webosports.service.messaging.assignMessages.json",
            "org.webosports.service.messaging.messagesDeleted.json", "org.webosports.service.messaging.readChanges.json"]);
        files.forEach(function (f) {
            var method = f.split('.').slice(-2)[0];
            assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), activitySpec(method, 0), f);
        });
    });
});
