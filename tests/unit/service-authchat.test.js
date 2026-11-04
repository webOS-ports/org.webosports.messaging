/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/lib/authchat.js and loginsChanged - the chat a connector asks for its login code and
 * password in is deleted once the account has signed in, as it holds that password.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');

var { ask } = require('./service/palmbus');
var { boot, SERVICE, TEMPLATES } = require('./service/boot');
var seed = require('./service/seed');

var authchat = require(path.join(SERVICE, 'lib', 'authchat.js'));

var MESSAGE = "com.palm.message:1";
var THREAD = "com.palm.chatthread:1";
var LOGIN = "com.palm.imloginstate.libpurple:1";
var ME = "+31600000000";
var quiet = { log: function () {}, error: function () {} };

function telegram(peer, text) { return seed.imIn(peer, text, { service: "type_telegram", account: ME }); }
function telegramOut(peer, text) { return seed.imOut(peer, text, { service: "type_telegram", account: ME }); }

function login(serviceName, state, username) {
    return { _kind: LOGIN, accountId: "acct-" + serviceName + "-" + (username || ME), serviceName: serviceName,
        username: username || ME, state: state, availability: 0 };
}

// Telegram's login chat as the device had it, next to a chat with a friend.
async function telegramLogin(env) {
    await seed.putAll(env.db, [
        telegram("telegram", "Enter authentication code"),
        telegramOut("telegram", "67295"),
        telegram("telegram", "Enter password for two-factor authentication"),
        telegramOut("telegram", "s3cret"),
        telegram("friend", "hi")
    ]);
    await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
    assert.equal(env.db.all(THREAD).length, 2);
}

function addresses(env) {
    return env.db.all(THREAD).map(function (t) { return t.normalizedAddress; }).sort();
}

describe('the login chat', function () {
    it('is deleted with its messages once Telegram has signed in', async function () {
        var env = boot();
        await telegramLogin(env);
        var states = await seed.putAll(env.db, [login("type_telegram", "retrieving-buddies")]);
        var r = await ask(env.handle, "loginsChanged", { lastLoginRev: 0, $activity: { activityId: 9 } });
        assert.equal(r.returnValue, true);
        assert.equal(r.threads, 1);
        assert.equal(r.deleted, 4);
        assert.deepEqual(addresses(env), ["friend"]);
        assert.deepEqual(env.db.all(MESSAGE).map(function (m) { return m.messageText; }), ["hi"]);
        // Purged: no _del record keeps the password, in a message or in the thread's summary.
        var left = JSON.stringify(env.db.all(MESSAGE, { deleted: true }).concat(env.db.all(THREAD, { deleted: true })));
        assert.doesNotMatch(left, /s3cret|67295/);
        var complete = env.am.find(function (c) { return c.method === "complete"; });
        assert.equal(complete.args.activityId, 9);
        assert.equal(complete.args.callback.params.lastLoginRev, states[0]._rev);
        assert.equal(complete.args.trigger.params.query.from, "com.palm.imloginstate:1");
        env.service.bus.stop();
    });

    it('stays while the account is still signing in', async function () {
        var env = boot();
        await telegramLogin(env);
        for (var state of ["offline", "logging-on"]) {
            await seed.putAll(env.db, [login("type_telegram", state)]);
            var r = await ask(env.handle, "loginsChanged", { lastLoginRev: 0 });
            assert.equal(r.threads, 0, state);
        }
        assert.deepEqual(addresses(env), ["friend", "telegram"]);
        env.service.bus.stop();
    });

    it('stays while a second account of the service is still signing in', async function () {
        var env = boot();
        await telegramLogin(env);
        await seed.putAll(env.db, [login("type_telegram", "online"), login("type_telegram", "logging-on", "+31611111111")]);
        assert.equal((await ask(env.handle, "loginsChanged", { lastLoginRev: 0 })).threads, 0);
        assert.deepEqual(addresses(env), ["friend", "telegram"]);
        env.service.bus.stop();
    });

    it('is only the address the template names, on its own service', async function () {
        var env = boot();
        // Teams names no auth contact, so a Teams buddy called "telegram" is just a buddy.
        await seed.putAll(env.db, [seed.imIn("telegram", "a buddy of that name", { service: "type_teams" })]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        await seed.putAll(env.db, [login("type_teams", "online"), login("type_telegram", "online")]);
        assert.equal((await ask(env.handle, "loginsChanged", { lastLoginRev: 0 })).threads, 0);
        assert.equal(env.db.all(THREAD).length, 1);
        env.service.bus.stop();
    });

    it('is left alone when no template can be read', async function () {
        var env = boot({ templateDirs: [path.join(TEMPLATES, 'missing')] });
        await telegramLogin(env);
        await seed.putAll(env.db, [login("type_telegram", "online")]);
        assert.equal((await ask(env.handle, "loginsChanged", { lastLoginRev: 0 })).threads, 0);
        assert.equal(env.db.all(THREAD).length, 2);
        env.service.bus.stop();
    });
});

describe('deleteChatthread', function () {
    it('still leaves _del records, for the delete watch', async function () {
        var env = boot();
        await seed.putAll(env.db, [telegram("friend", "hi")]);
        await ask(env.handle, "assignMessages", { lastCheckedRev: 0 });
        await ask(env.handle, "deleteChatthread", { threadId: env.db.all(THREAD)[0]._id });
        assert.equal(env.db.all(MESSAGE).length, 0);
        assert.equal(env.db.all(MESSAGE, { deleted: true }).length, 1);
        env.service.bus.stop();
    });
});

describe('readAuthContacts', function () {
    it('reads the auth contacts each template names, past a file that does not parse', function () {
        var errors = [];
        var found = authchat.readAuthContacts([TEMPLATES, path.join(TEMPLATES, 'missing')],
            { log: quiet.log, error: function (e) { errors.push(e); } });
        assert.deepEqual(Array.from(found), [["type_telegram", ["Telegram"]]]);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /com\.palm\.broken\.json/);
    });
});

describe('signedInServices', function () {
    it('counts retrieving-buddies as signed in, as imlibpurple writes it on LOGIN_SUCCESS', function () {
        assert.deepEqual(authchat.signedInServices([login("type_telegram", "retrieving-buddies")]), ["type_telegram"]);
    });

    it('leaves out a service with any account not signed in, and deleted records', function () {
        assert.deepEqual(authchat.signedInServices([
            login("type_telegram", "online"), login("type_telegram", "logging-off", "+2"),
            Object.assign(login("type_signal", "offline"), { _del: true }), login("type_discord", "online")
        ]), ["type_discord"]);
    });
});
