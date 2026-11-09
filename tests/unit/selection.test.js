/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/selection.js - selecting several messages in a chat. The selection is a set of
 * _ids; what it acts on comes in chat order, and a message deleted for everyone is not picked.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var sel = bootstrap.load('util/selection.js');

var a = { _id: 'a', messageText: 'one' }, b = { _id: 'b', messageText: 'two' },
    c = { _id: 'c', messageText: 'three' }, gone = { _id: 'd', deleted: true, messageText: 'x' };

describe('selection.start and selectable', function () {
    it('starts with the message held', function () {
        assert.deepEqual(sel.start(a), { a: true });
        assert.equal(sel.selectable(a), true);
    });
    it('a deleted message, one with no _id or none cannot be selected', function () {
        assert.deepEqual(sel.start(gone), {});
        assert.deepEqual(sel.start({ messageText: 'no id' }), {});
        assert.deepEqual(sel.start(null), {});
        assert.equal(sel.selectable(gone), false);
        assert.equal(sel.selectable({}), false);
        assert.equal(sel.selectable(undefined), false);
    });
});

describe('selection.toggle', function () {
    it('adds a message, and takes it off on a second tap', function () {
        var one = sel.toggle(sel.start(a), b);
        assert.deepEqual(one, { a: true, b: true });
        assert.deepEqual(sel.toggle(one, a), { b: true });
    });
    it('does not change the selection it was given', function () {
        var ids = sel.start(a);
        sel.toggle(ids, b);
        sel.toggle(ids, a);
        assert.deepEqual(ids, { a: true });
    });
    it('a deleted message does not go in', function () {
        assert.deepEqual(sel.toggle({ a: true }, gone), { a: true });
        assert.deepEqual(sel.toggle({ a: true }, null), { a: true });
    });
    it('keys from the prototype are not taken for selected ones', function () {
        assert.deepEqual(sel.toggle({}, { _id: 'toString' }), { toString: true });
        assert.equal(sel.has({}, { _id: 'constructor' }), false);
    });
});

describe('selection.picked', function () {
    it('in chat order, whatever order they were tapped in', function () {
        var ids = sel.toggle(sel.toggle(sel.start(c), a), b);
        assert.deepEqual(sel.picked([a, b, c], ids), [a, b, c]);
        assert.deepEqual(sel.picked([a, b, c], { c: true, a: true }), [a, c]);
    });
    it('a selected message that is gone from the chat drops out', function () {
        assert.deepEqual(sel.picked([a, c], { a: true, b: true }), [a]);
        assert.deepEqual(sel.picked(null, { a: true }), []);
        assert.deepEqual(sel.picked([a], null), []);
    });
});
