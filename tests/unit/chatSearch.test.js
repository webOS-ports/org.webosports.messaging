/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/chatSearch.js - Find in Chat. Messages are matched on their text as it reads in
 * the bubble, ignoring case and accents; the match shown stays put while the matches change.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var cs = bootstrap.load('util/chatSearch.js');

var MESSAGES = [
    { _id: 'm0', messageText: 'Dinner at the Caf\u00e9 on Sunday?' },
    { _id: 'm1', messageText: 'Fish &amp; chips<br>at five' },
    { _id: 'm2', messageText: 'This message was deleted.', deleted: true },
    { _id: 'm3', messageText: '<a href="https://cafe.example">link</a> &#128512;' },
    { _id: 'm4', messageText: 'Café it is, then' },
    null,
    { _id: 'm6' }
];

describe('chatSearch.fold', function () {
    it('lower case, accents off, white space as one space', function () {
        assert.equal(cs.fold('Café  CRÈME\n\tbrûlée'), 'cafe creme brulee');
        assert.equal(cs.fold(null), '');
    });
});

describe('chatSearch.plainText', function () {
    it('as the bubble reads it', function () {
        assert.equal(cs.plainText(MESSAGES[1]), 'Fish & chips at five');
        assert.equal(cs.plainText(MESSAGES[3]), 'link \u{1F600}');
    });
    it('nothing for a deleted message or one without text', function () {
        assert.equal(cs.plainText(MESSAGES[2]), '');
        assert.equal(cs.plainText(MESSAGES[6]), '');
        assert.equal(cs.plainText(null), '');
    });
});

describe('chatSearch.find', function () {
    it('the matches, oldest first, case and accents ignored', function () {
        assert.deepEqual(cs.find(MESSAGES, 'cafe'), [0, 4]);
        assert.deepEqual(cs.find(MESSAGES, 'CAFÉ IT'), [4]);
        assert.deepEqual(cs.find(MESSAGES, 'at'), [0, 1]);
        assert.deepEqual(cs.find(MESSAGES, 'chips at'), [1]);
    });
    it('not in markup, nor in a deleted message', function () {
        assert.deepEqual(cs.find(MESSAGES, 'href'), []);
        assert.deepEqual(cs.find(MESSAGES, 'example'), []);
        assert.deepEqual(cs.find(MESSAGES, 'deleted'), []);
        assert.deepEqual(cs.find(MESSAGES, 'amp'), []);
    });
    it('nothing for an empty or blank query', function () {
        assert.deepEqual(cs.find(MESSAGES, ''), []);
        assert.deepEqual(cs.find(MESSAGES, '   '), []);
        assert.deepEqual(cs.find(null, 'at'), []);
    });
});

describe('chatSearch.keep', function () {
    var hits = [0, 1, 4];
    it('the match shown before, when it still is one', function () {
        assert.equal(cs.keep(MESSAGES, hits, 'm1'), 1);
    });
    it('else the newest', function () {
        assert.equal(cs.keep(MESSAGES, hits, 'm3'), 2);
        assert.equal(cs.keep(MESSAGES, hits, null), 2);
    });
    it('-1 for no matches', function () {
        assert.equal(cs.keep(MESSAGES, [], 'm1'), -1);
    });
});

describe('chatSearch.step', function () {
    it('older and newer, stopping at the ends', function () {
        assert.equal(cs.step(2, 3, -1), 1);
        assert.equal(cs.step(0, 3, -1), 0);
        assert.equal(cs.step(1, 3, 1), 2);
        assert.equal(cs.step(2, 3, 1), 2);
        assert.equal(cs.step(0, 0, 1), -1);
    });
});
