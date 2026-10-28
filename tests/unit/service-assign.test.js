/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/lib/assign.js - one activation's batch. A message that fails must not take the rest of
 * the batch with it (one exception used to skip every later message, for good, because the
 * revision moved past them), must be tried again, and must stop being tried once it has failed a
 * few times, or the watch fires for ever.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');

var { createFakeDb } = require('./service/fakedb');
var seed = require('./service/seed');
var { createAssigner } = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'assign.js'));

var quiet = { log: function () {}, error: function () {} };
var MESSAGE = "com.palm.message:1";

// A db whose thread put fails for one address, as a record db8 refuses would.
function poisoned(db, addr) {
    var put = db.put;
    db.put = function (objects) {
        if (objects.some(function (o) { return o.replyAddress === addr; })) {
            return Promise.reject(Object.assign(new Error("db: bad record"), { errorCode: -3962 }));
        }
        return put(objects);
    };
    return db;
}

describe('a batch of messages', function () {
    it('threads the others when one fails, and comes back for the failed one', async function () {
        var db = poisoned(createFakeDb(), "poison");
        var msgs = await seed.putAll(db, [seed.imIn("a", "1"), seed.imIn("poison", "2"), seed.imIn("b", "3")]);
        var assigner = createAssigner({ db: db, log: quiet });
        var r = await assigner.assign(0);
        assert.equal(r.threaded, 2);
        var stored = db.all(MESSAGE);
        assert.ok(stored.find(function (m) { return m._id === msgs[2]._id; }).conversations.length);
        assert.equal(stored.find(function (m) { return m._id === msgs[1]._id; }).conversations, undefined);
        assert.ok(r.rev < msgs[1]._rev, 'the revision must stop short of the failed message');
        var again = await assigner.assign(r.rev);
        assert.equal(again.threaded, 0);
        assert.equal(assigner.failures.get(msgs[1]._id), 2);
    });

    it('parks a message that keeps failing, so the watch stops firing for it', async function () {
        var db = poisoned(createFakeDb(), "poison");
        var msgs = await seed.putAll(db, [seed.imIn("poison", "x")]);
        var assigner = createAssigner({ db: db, log: quiet, parkAfter: 3 });
        var rev = 0, r;
        for (var i = 0; i < 3; i++) { r = await assigner.assign(rev); rev = r.rev; }
        assert.equal(r.parked, 1);
        var m = db.all(MESSAGE)[0];
        assert.equal(m.flags.threadingError, true);
        assert.ok(r.rev >= msgs[0]._rev);
        var after = await assigner.assign(r.rev);
        assert.equal(after.threaded + after.parked, 0);
    });

    it('works through more than one page in an activation', async function () {
        var db = createFakeDb();
        var list = [];
        for (var i = 0; i < 25; i++) { list.push(seed.imIn("p" + (i % 5), "m" + i)); }
        await seed.putAll(db, list);
        var r = await createAssigner({ db: db, log: quiet, pageSize: 10 }).assign(0);
        assert.equal(r.threaded, 25);
        assert.ok(db.all(MESSAGE).every(function (m) { return m.conversations && m.conversations.length === 1; }));
        assert.equal(db.all("com.palm.chatthread:1").length, 5);
    });

    it('leaves already threaded and invisible messages alone', async function () {
        var db = createFakeDb();
        var done = seed.imIn("a", "done");
        done.conversations = ["elsewhere"];
        var hidden = seed.imIn("a", "hidden", { flags: { visible: false } });
        await seed.putAll(db, [done, hidden]);
        var r = await createAssigner({ db: db, log: quiet }).assign(0);
        assert.equal(r.threaded, 0);
        assert.equal(db.all("com.palm.chatthread:1").length, 0);
    });

    it('notifies through the notifier with the newest unread message of each thread', async function () {
        var db = createFakeDb();
        var seen = null;
        var notifier = { notify: function (newest) { seen = newest; return Promise.resolve(newest.size); } };
        await seed.putAll(db, [seed.imIn("a", "first"), seed.imIn("a", "second"), seed.imIn("b", "muted", { flags: { noNotification: true } }),
            seed.imOut("c", "mine")]);
        var r = await createAssigner({ db: db, log: quiet, notifier: notifier }).assign(0);
        assert.equal(r.notified, 1);
        assert.deepEqual(Array.from(seen.values()).map(function (m) { return m.messageText; }), ["second"]);
    });
});
