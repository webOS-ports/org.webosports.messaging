/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/poll.js - the "poll:" token a transport writes, with the votes counted on it.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var poll = bootstrap.load('util/poll.js');
var ms = bootstrap.load('util/messageState.js');

function token(obj) {
    return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

describe('poll.decode', function () {
    it('reads the poll, names in any script', function () {
        var p = poll.decode(token({ name: 'Lunch? 🍕', options: ['Pizza', 'Суп'], max: 1 }));
        assert.equal(p.name, 'Lunch? 🍕');
        assert.deepEqual(p.options, ['Pizza', 'Суп']);
        assert.equal(p.max, 1);
    });
    it('null for no poll', function () {
        assert.equal(poll.decode('!!!'), null);
        assert.equal(poll.decode(token({ name: 'x', options: [] })), null);
        assert.equal(poll.decode(token({ name: 'x', options: 'Pizza' })), null);
        assert.equal(poll.decode(token(null)), null);
    });
});

describe('poll.votesFor', function () {
    var p = { options: ['a', 'b', 'c'], votes: [2, 0, 1] };
    it('the count for each option', function () {
        assert.equal(poll.votesFor(p, 0), 2);
        assert.equal(poll.votesFor(p, 1), 0);
        assert.equal(poll.votesFor(p, 2), 1);
    });
    it('null where nothing is counted', function () {
        assert.equal(poll.votesFor({ options: ['a'] }, 0), null);
        assert.equal(poll.votesFor(p, 3), null);
        assert.equal(poll.votesFor(p, -1), null);
        assert.equal(poll.votesFor({ votes: ['x'] }, 0), null);
        assert.equal(poll.votesFor({ votes: [-1] }, 0), null);
    });
});

describe('a poll rewritten with its votes', function () {
    var t = 'poll:' + token({ name: 'Lunch?', options: ['a', 'b'], max: 1, votes: [1, 0] });
    it('is not said to be edited', function () {
        assert.equal(poll.isPollOnly(t), true);
        assert.equal(ms.isEdited({ edited: true, messageText: t }), false);
        assert.equal(ms.timeLine({ edited: true, messageText: t }, '10:54 AM'), '10:54 AM');
    });
    it('but text that was edited still is', function () {
        assert.equal(poll.isPollOnly('see ' + t), false);
        assert.equal(ms.isEdited({ edited: true, messageText: 'see ' + t }), true);
        assert.equal(ms.isEdited({ edited: true, messageText: 'hi' }), true);
    });
});
