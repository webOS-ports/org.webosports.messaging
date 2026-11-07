/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/quoteJump.js - a tap on a reply's quote card brings up the quoted message, by the
 * network id the card carries (data-quoted-id = the original's serviceMessageId), loading older
 * messages until it is there or there is nothing older to load.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var qj = bootstrap.load('util/quoteJump.js');

function el(className, attrs, parent) {
    return {
        className: className, parentNode: parent || null,
        getAttribute: function (n) { return attrs && Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null; }
    };
}

describe('quoteJump.quotedIdAt', function () {
    var root = el('conversation');
    var bubble = el('chat-balloon-received', {}, root);
    var card = el('reply-quote', { 'data-quoted-id': 'wa-123' }, bubble);
    var from = el('reply-quote-from', {}, card);
    var text = el('reply-quote-text', {}, card);

    it('the card, or the name and text inside it', function () {
        assert.equal(qj.quotedIdAt(card, root), 'wa-123');
        assert.equal(qj.quotedIdAt(from, root), 'wa-123');
        assert.equal(qj.quotedIdAt({ className: { baseVal: '' }, parentNode: text }, root), 'wa-123');
    });

    it('not the rest of the bubble, nor a class that only starts like it', function () {
        assert.equal(qj.quotedIdAt(bubble, root), null);
        assert.equal(qj.quotedIdAt(el('reply-quote-text', {}, bubble), root), null);
        assert.equal(qj.quotedIdAt(el('x reply-quotes', { 'data-quoted-id': 'n' }, bubble), root), null);
        assert.equal(qj.quotedIdAt(null, root), null);
    });

    it('a card with no id, as one quoting a message the network gave none, does nothing', function () {
        assert.equal(qj.quotedIdAt(el('reply-quote', {}, bubble), root), null);
        assert.equal(qj.quotedIdAt(el('reply-quote', { 'data-quoted-id': '' }, bubble), root), null);
    });

    it('stops at the list', function () {
        var outer = el('reply-quote', { 'data-quoted-id': 'outside' });
        var list = el('conversation', {}, outer);
        assert.equal(qj.quotedIdAt(el('chat-balloon', {}, list), list), null);
    });
});

var MESSAGES = [
    { _id: 'a', serviceMessageId: 'm1' },
    { _id: 'b' },
    { _id: 'c', serviceMessageId: 'm2' },
    null,
    { _id: 'd', serviceMessageId: 'm2' }
];

describe('quoteJump.indexOfQuoted', function () {
    it('by serviceMessageId, the newest copy', function () {
        assert.equal(qj.indexOfQuoted(MESSAGES, 'm1'), 0);
        assert.equal(qj.indexOfQuoted(MESSAGES, 'm2'), 4);
    });
    it('-1 for none', function () {
        assert.equal(qj.indexOfQuoted(MESSAGES, 'm9'), -1);
        assert.equal(qj.indexOfQuoted(MESSAGES, ''), -1);
        assert.equal(qj.indexOfQuoted(null, 'm1'), -1);
        assert.equal(qj.indexOfQuoted([{ _id: 'b' }], undefined), -1);
    });
});

describe('quoteJump.next', function () {
    it('shows it once loaded', function () {
        assert.deepEqual(qj.next(MESSAGES, 'm1', 20, 20, 200), { action: 'show', index: 0 });
        assert.deepEqual(qj.next(MESSAGES, 'm1', 3, 20, 200), { action: 'show', index: 0 });
    });
    it('waits while a full page came back and more may be kept', function () {
        assert.deepEqual(qj.next(MESSAGES, 'm9', 20, 20, 200), { action: 'wait' });
        assert.deepEqual(qj.next(MESSAGES, 'm9', 170, 170, 200), { action: 'wait' });
    });
    it('gives up when the chat has nothing older, or as many as are kept are loaded', function () {
        assert.deepEqual(qj.next(MESSAGES, 'm9', 19, 20, 200), { action: 'give up' });
        assert.deepEqual(qj.next(MESSAGES, 'm9', 200, 200, 200), { action: 'give up' });
    });
});
