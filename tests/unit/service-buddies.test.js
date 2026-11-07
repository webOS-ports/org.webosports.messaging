/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * The buddy jobs (service/lib/buddies.js) end to end on the stand-in bus: buddies seeded as the
 * transport writes them, which is all a phone had (seen on a Pixel 3a, 2026-11-07: 500 buddies,
 * 95 of them available, and an empty buddy list), then read back with the app's own query.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');

var { ask } = require('./service/palmbus');
var { boot, SERVICE } = require('./service/boot');
var seed = require('./service/seed');

var { activitySpec } = require(path.join(SERVICE, 'lib', 'activity.js'));
var { availabilityMerges } = require(path.join(SERVICE, 'lib', 'buddies.js'));

var BUDDY = "com.palm.imbuddystatus:1";
var THREAD = "com.palm.chatthread:1";

// BuddyList.runQuery with no filter string, as the app sends it to tempdb.
function appQuery(showOffline) {
    return { from: BUDDY, where: [
        { prop: "primary", op: "=", val: true },
        { prop: "offline", op: "=", val: showOffline ? [true, false] : false },
        { prop: "groupAvailability", op: "%", val: "", collate: "secondary" }
    ] };
}

async function listed(env, showOffline) {
    var r = await env.tempdb.handle("find", { query: appQuery(showOffline) });
    assert.equal(r.returnValue, true, r.errorText);
    return r.results;
}

function byName(env, username) {
    return env.tempdb.all(BUDDY).find(function (b) { return b.username === username; });
}

describe('changedAvailability', function () {
    it('puts the online buddies the transport wrote into the buddy list, and only those', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [
            seed.buddy("ann#1", "type_discord", 0, { group: "Discord" }),
            seed.buddy("bob#2", "type_discord", 2, { group: "Discord" }),
            seed.buddy("31612345678@s.whatsapp.net", "type_whatsapp", 2),
            seed.buddy("cat#3", "type_discord", 4, { group: "Discord" })
        ]);
        assert.equal((await listed(env, true)).length, 0, 'the transport alone already fills the list');

        var r = await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        assert.equal(r.returnValue, true, r.errorText);
        assert.equal(r.buddies, 4);

        assert.deepEqual((await listed(env, false)).map(function (b) { return b.username; }).sort(),
            ["31612345678@s.whatsapp.net", "ann#1", "bob#2"]);
        assert.equal((await listed(env, true)).length, 4);
        env.service.bus.stop();
    });

    it('sorts by group and availability, an empty group under Buddies, every offline buddy as one', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [
            seed.buddy("ann#1", "type_discord", 0, { group: "Discord" }),
            seed.buddy("31612345678@s.whatsapp.net", "type_whatsapp", 2),
            seed.buddy("cat#3", "type_discord", 4, { group: "Discord" })
        ]);
        await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        assert.equal(byName(env, "ann#1").groupAvailability, "discord0");
        assert.equal(byName(env, "31612345678@s.whatsapp.net").groupAvailability, "buddies2");
        assert.equal(byName(env, "cat#3").groupAvailability, "4");
        assert.equal(byName(env, "cat#3").offline, true);
        assert.equal(byName(env, "ann#1").personAvailability, 0);
        env.service.bus.stop();
    });

    it('shows a person by the most available of its buddies, once in each group', async function () {
        var env = boot();
        var [p] = await seed.putAll(env.db, [seed.person({ name: { givenName: "Ann" } })]);
        await seed.putAll(env.tempdb, [
            Object.assign(seed.buddy("ann#1", "type_discord", 0, { group: "Discord" }), { personId: p._id, displayName: "Ann" }),
            Object.assign(seed.buddy("ann@x", "type_teams", 4, { group: "Discord" }), { personId: p._id, displayName: "Ann" }),
            Object.assign(seed.buddy("+31611111111", "type_signal", 4, { group: "Signal" }), { personId: p._id, displayName: "Ann" })
        ]);
        await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        var all = env.tempdb.all(BUDDY);
        all.forEach(function (b) {
            assert.equal(b.personAvailability, 0, b.username);
            assert.equal(b.offline, false, b.username);
        });
        var shown = await listed(env, false);
        assert.deepEqual(shown.map(function (b) { return b.groupAvailability; }).sort(), ["discord0", "signal0"],
            'once under Discord, where two of its buddies are, and once under Signal');
        env.service.bus.stop();
    });

    it('moves a person to offline when its last online buddy goes', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [seed.buddy("ann#1", "type_discord", 0, { group: "Discord" })]);
        var first = await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        await env.tempdb.merge([{ _id: byName(env, "ann#1")._id, availability: 4 }]);
        var second = await ask(env.handle, "changedAvailability", { lastAvailabilityRev: first.rev });
        assert.equal(second.buddies, 1);
        assert.ok(second.rev > first.rev);
        assert.equal((await listed(env, false)).length, 0);
        assert.equal(byName(env, "ann#1").groupAvailability, "4");
        env.service.bus.stop();
    });

    it('does not fire its own watch: what it writes leaves availabilityRevSet alone', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [seed.buddy("ann#1", "type_discord", 0), seed.buddy("bob#2", "type_discord", 4)]);
        var r = await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        assert.ok(r.updated > 0);
        var again = await env.tempdb.find({ from: BUDDY, where: [{ prop: "availabilityRevSet", op: ">", val: r.rev }] });
        assert.equal(again.length, 0);
        var rerun = await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        assert.equal(rerun.updated, 0, 'a second run over the same buddies wrote again');
        env.service.bus.stop();
    });

    it('completes its activity on a tempdb watch moved on to the revision reached', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [seed.buddy("ann#1", "type_discord", 0)]);
        var r = await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0, $activity: { activityId: 9 } });
        var complete = env.am.find(function (c) { return c.method === "complete"; });
        assert.ok(complete);
        assert.equal(complete.args.activityId, 9);
        assert.equal(complete.args.trigger.method, "luna://com.palm.tempdb/watch");
        assert.equal(complete.args.trigger.params.query.where[0].val, r.rev);
        assert.equal(complete.args.callback.params.lastAvailabilityRev, r.rev);
        env.service.bus.stop();
    });

    it('keeps no revision across calls: tempdb counts from the start again after a reboot', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [seed.buddy("ann#1", "type_discord", 0)]);
        await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        // The boot activity calls with 0 again; a stored revision would skip every buddy.
        var r = await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        assert.equal(r.buddies, 1);
        env.service.bus.stop();
    });
});

describe('newBuddies', function () {
    it('links a buddy to the person with its im, and names it after the person', async function () {
        var env = boot();
        var [ben] = await seed.putAll(env.db, [seed.person({ name: { givenName: "Ben" }, ims: [{ value: "+31612345678", type: "type_whatsapp" }] })]);
        await seed.putAll(env.tempdb, [seed.buddy("31612345678@s.whatsapp.net", "type_whatsapp", 0)]);
        var r = await ask(env.handle, "newBuddies", {});
        assert.equal(r.returnValue, true, r.errorText);
        assert.equal(r.linked, 1);
        var b = byName(env, "31612345678@s.whatsapp.net");
        assert.equal(b.personId, ben._id);
        assert.equal(b.displayName, "Ben");
        assert.equal((await listed(env, false)).length, 1, 'linked, but not put in the list');
        env.service.bus.stop();
    });

    it('finds the person of a Signal or WhatsApp buddy by its number when no im matches', async function () {
        var env = boot();
        var [ann] = await seed.putAll(env.db, [seed.person({ name: { givenName: "Ann" }, phones: ["06 1234 5678"] })]);
        await seed.putAll(env.tempdb, [seed.buddy("+31612345678", "type_signal", 0)]);
        await ask(env.handle, "newBuddies", {});
        assert.equal(byName(env, "+31612345678").personId, ann._id);
        env.service.bus.stop();
    });

    it('takes the person with a contact on the buddy\'s own account when several have the im', async function () {
        var env = boot();
        await seed.putAll(env.db, [{ _kind: "com.palm.contact:1", _id: "c-home", accountId: "acct-home" },
            { _kind: "com.palm.contact:1", _id: "c-work", accountId: "acct-work" }]);
        await seed.putAll(env.db, [
            seed.person({ name: { givenName: "Work Alex" }, ims: [{ value: "alex", type: "type_teams" }], contactIds: ["c-work"] }),
            seed.person({ name: { givenName: "Home Alex" }, ims: [{ value: "alex", type: "type_teams" }], contactIds: ["c-home"] })
        ]);
        await seed.putAll(env.tempdb, [seed.buddy("alex", "type_teams", 0, { accountId: "acct-home" })]);
        await ask(env.handle, "newBuddies", {});
        assert.equal(byName(env, "alex").displayName, "Home Alex");
        env.service.bus.stop();
    });

    it('names a buddy with no person after its address, so the watch does not fire for it again', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [seed.buddy("31687654321@s.whatsapp.net", "type_whatsapp", 2), seed.buddy("zed#9", "type_discord", 0)]);
        var r = await ask(env.handle, "newBuddies", {});
        assert.equal(r.buddies, 2);
        assert.equal(r.linked, 0);
        assert.equal(byName(env, "zed#9").displayName, "zed#9");
        assert.ok(/^\+31 ?6/.test(byName(env, "31687654321@s.whatsapp.net").displayName), byName(env, "31687654321@s.whatsapp.net").displayName);
        var still = await env.tempdb.find({ from: BUDDY, where: [{ prop: "displayName", op: "=", val: "" }] });
        assert.equal(still.length, 0);
        assert.equal((await ask(env.handle, "newBuddies", {})).buddies, 0);
        env.service.bus.stop();
    });

    it('joins a newly linked buddy to its person\'s others: the person is as available as the best', async function () {
        var env = boot();
        var [p] = await seed.putAll(env.db, [seed.person({ name: { givenName: "Ann" }, ims: [{ value: "ann#1", type: "type_discord" }] })]);
        await seed.putAll(env.tempdb, [
            Object.assign(seed.buddy("ann@x", "type_teams", 4, { group: "Teams" }), { personId: p._id, displayName: "Ann" }),
            seed.buddy("ann#1", "type_discord", 0, { group: "Discord" })
        ]);
        await ask(env.handle, "changedAvailability", { lastAvailabilityRev: 0 });
        await ask(env.handle, "newBuddies", {});
        assert.equal(byName(env, "ann@x").personAvailability, 0);
        assert.equal(byName(env, "ann@x").offline, false);
        assert.equal((await listed(env, false)).length, 2, 'under Teams and under Discord');
        env.service.bus.stop();
    });

    it('completes its activity on the same tempdb watch, which carries no revision', async function () {
        var env = boot();
        await seed.putAll(env.tempdb, [seed.buddy("zed#9", "type_discord", 0)]);
        await ask(env.handle, "newBuddies", { $activity: { activityId: 4 } });
        var complete = env.am.find(function (c) { return c.method === "complete"; });
        assert.ok(complete);
        assert.deepEqual(complete.args.trigger, activitySpec("newBuddies").activity.trigger);
        assert.deepEqual(complete.args.callback, activitySpec("newBuddies").activity.callback);
        env.service.bus.stop();
    });
});

describe('the buddy activities', function () {
    it('watch tempdb and are not persisted, so a boot starts them from 0', function () {
        ["newBuddies", "changedAvailability"].forEach(function (m) {
            var a = activitySpec(m).activity;
            assert.equal(a.trigger.method, "luna://com.palm.tempdb/watch", m);
            assert.equal(a.type.persist, false, m);
        });
        assert.equal(activitySpec("assignMessages").activity.type.persist, true);
    });
});

describe('availabilityMerges', function () {
    it('writes nothing for a buddy already right', function () {
        var b = { _id: "b1", username: "a", serviceName: "s", availability: 0, group: "G",
            primary: true, groupAvailability: "g0", offline: false, personAvailability: 0 };
        assert.deepEqual(availabilityMerges([b]), []);
    });

    it('takes a buddy with no availability as offline', function () {
        var m = availabilityMerges([{ _id: "b1", username: "a", serviceName: "s" }]);
        assert.deepEqual(m, [{ _id: "b1", primary: true, groupAvailability: "4", offline: true, personAvailability: 4 }]);
    });
});

describe('restoreFinished', function () {
    it('unlinks every thread from its person, for the threader to adopt again', async function () {
        var env = boot();
        await seed.putAll(env.db, [
            { _kind: THREAD, displayName: "Ann", personId: "old-person-1", normalizedAddress: "ann", replyService: "type_teams" },
            { _kind: THREAD, displayName: "Bob", normalizedAddress: "bob", replyService: "type_teams" }
        ]);
        var r = await ask(env.handle, "restoreFinished", {});
        assert.equal(r.returnValue, true, r.errorText);
        assert.equal(r.unlinked, 1);
        env.db.all(THREAD).forEach(function (t) { assert.ok(!t.personId, t.displayName); });
        env.service.bus.stop();
    });

    it('lets the next message from a restored contact land in its old thread', async function () {
        var env = boot();
        var [ann] = await seed.putAll(env.db, [seed.person({ name: { givenName: "Ann" }, ims: [{ value: "ann@x", type: "type_teams" }] })]);
        var [old] = await seed.putAll(env.db, [{ _kind: THREAD, displayName: "Ann", personId: "old-person-1",
            normalizedAddress: "ann@x", replyAddress: "ann@x", replyService: "type_teams" }]);
        await ask(env.handle, "restoreFinished", {});
        await seed.putAll(env.db, [seed.imIn("ann@x", "hi")]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        var threads = env.db.all(THREAD);
        assert.equal(threads.length, 1, 'a second thread was started for the restored contact');
        assert.equal(threads[0]._id, old._id);
        assert.equal(threads[0].personId, ann._id);
        env.service.bus.stop();
    });
});
