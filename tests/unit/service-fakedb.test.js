/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * tests/unit/service/fakedb.js refuses what db8 refuses the service. These are the answers db8
 * gave the service on the qemux86-64 VM, so the stand-in cannot drift into allowing what the
 * device does not.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');

var { createFakeDb, permitted } = require('./service/fakedb');

var SERVICE = "org.webosports.service.messaging";

describe('the stand-in db8, as the messaging service', function () {
    it('may do anything with the kinds it owns', function () {
        ["read", "create", "update", "delete"].forEach(function (op) {
            assert.equal(permitted(SERVICE, "com.palm.message:1", op), true, op);
            assert.equal(permitted(SERVICE, "com.palm.chatthread:1", op), true, op);
        });
    });

    it('does not inherit the base kind\'s rights on a subkind', function () {
        assert.equal(permitted(SERVICE, "com.palm.immessage:1", "delete"), false);
        assert.equal(permitted(SERVICE, "com.palm.immessage:1", "read"), true);
    });

    it('may update an imchannel but not delete one (measured after the imlibpurpleservice grant)', function () {
        assert.equal(permitted(SERVICE, "com.palm.imchannel:1", "update"), true);
        assert.equal(permitted(SERVICE, "com.palm.imchannel:1", "delete"), false);
        assert.equal(permitted(SERVICE, "com.palm.imchannel:1", "create"), false);
    });

    it('may only read contacts and login states', function () {
        assert.equal(permitted(SERVICE, "com.palm.person:1", "read"), true);
        assert.equal(permitted(SERVICE, "com.palm.person:1", "update"), false);
        assert.equal(permitted(SERVICE, "com.palm.imloginstate:1", "update"), false);
    });

    it('matches a "<prefix>.*" grant only to callers under that prefix', function () {
        assert.equal(permitted("org.webosports.app.contacts", "com.palm.person:1", "read"), true);
        assert.equal(permitted("com.example.other", "com.palm.person:1", "read"), false);
    });

    it('answers a refused luna call with -3963, as db8 does, and leaves direct calls alone', async function () {
        var db = createFakeDb({ caller: SERVICE });
        var ids = await db.put([{ _kind: "com.palm.imchannel:1", serviceName: "type_discord", remoteId: "c" }]);
        var r = await db.handle("del", { ids: [ids[0].id] });
        assert.equal(r.returnValue, false);
        assert.equal(r.errorCode, -3963);
        assert.equal(db.all("com.palm.imchannel:1").length, 1);
        r = await db.handle("merge", { objects: [{ _id: ids[0].id, chatThreadId: "t" }] });
        assert.equal(r.returnValue, true);
    });
});
