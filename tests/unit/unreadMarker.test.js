/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/unreadMarker.js - where the "N unread messages" line goes in a chat opened with
 * unread messages, and how many came in below while the reader was further up.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var um = bootstrap.load('util/unreadMarker.js');

function chat(spec) {
    // "i" incoming, "o" outgoing, oldest first; ids m1, m2, ...
    return spec.split("").map(function (c, i) { return { _id: 'm' + (i + 1), folder: c === 'i' ? 'inbox' : 'outbox' }; });
}

describe('unreadMarker.lineFor', function () {
    it('stands above the oldest of the newest unread incoming messages', function () {
        assert.deepEqual(um.lineFor(chat('iioiioi'), 3), { id: 'm4', exact: true });
        assert.deepEqual(um.lineFor(chat('iioiioi'), 1), { id: 'm7', exact: true });
    });
    it('passes over what we sent in between', function () {
        assert.deepEqual(um.lineFor(chat('ioooi'), 2), { id: 'm1', exact: true });
    });
    it('says when fewer are loaded than are unread', function () {
        assert.deepEqual(um.lineFor(chat('oioi'), 5), { id: 'm2', exact: false });
    });
    it('is none for no unread, or nothing incoming', function () {
        assert.equal(um.lineFor(chat('iii'), 0), null);
        assert.equal(um.lineFor(chat('iii'), -2), null);
        assert.equal(um.lineFor(chat('ooo'), 2), null);
        assert.equal(um.lineFor(null, 2), null);
        assert.equal(um.lineFor([{ folder: 'inbox' }], 1), null);
    });
});

describe('unreadMarker.caption', function () {
    it('counts one, and more', function () {
        assert.equal(um.caption(1), '1 unread message');
        assert.equal(um.caption(4), '4 unread messages');
    });
});

describe('unreadMarker.newSince and newestIncoming', function () {
    it('counts the incoming messages after the one seen', function () {
        var c = chat('iioiioi');
        assert.equal(um.newestIncoming(c), 'm7');
        assert.equal(um.newSince(c, 'm2'), 3);
        assert.equal(um.newSince(c, 'm7'), 0);
        assert.equal(um.newSince(c, 'm3'), 3);
    });
    it('counts nothing it cannot tell', function () {
        assert.equal(um.newSince(chat('iii'), 'gone'), 0);
        assert.equal(um.newSince(chat('iii'), null), 0);
        assert.equal(um.newestIncoming(chat('oo')), null);
        assert.equal(um.newestIncoming(null), null);
    });
});
