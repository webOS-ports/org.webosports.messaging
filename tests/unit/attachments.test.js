/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/attachments.js - several files staged for one send. A message carries one
 * filePath, so they go as one message each, in the order picked, with the text on the first.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var at = bootstrap.load('util/attachments.js');

function file(n) { return { path: '/media/internal/DCIM/' + n + '.jpg', name: n + '.jpg', type: 'image' }; }

describe('attachments.fromPicked', function () {
    it('what the picker hands back, named by the file when it gives no name', function () {
        assert.deepEqual(at.fromPicked([
            { fullPath: '/media/internal/a.jpg', attachmentType: 'image' },
            { fullPath: '/media/internal/docs/b.pdf', name: 'Tickets', attachmentType: 'document' }
        ]), [
            { path: '/media/internal/a.jpg', name: 'a.jpg', type: 'image' },
            { path: '/media/internal/docs/b.pdf', name: 'Tickets', type: 'document' }
        ]);
    });
    it('skips entries without a path', function () {
        assert.deepEqual(at.fromPicked([{}, null, { fullPath: '' }, { fullPath: 7 }]), []);
        assert.deepEqual(at.fromPicked(undefined), []);
    });
});

describe('attachments.add', function () {
    it('adds after what is staged, a file picked again only once', function () {
        var r = at.add([file('a')], [file('b'), file('a'), file('b'), null, { name: 'x' }]);
        assert.deepEqual(r.list.map(function (f) { return f.name; }), ['a.jpg', 'b.jpg']);
        assert.equal(r.dropped, 0);
    });
    it('no more than MAX, saying how many did not fit', function () {
        var many = [];
        for (var i = 0; i < at.MAX + 3; i++) { many.push(file('f' + i)); }
        var r = at.add([], many);
        assert.equal(r.list.length, at.MAX);
        assert.equal(r.dropped, 3);
        assert.equal(r.list[at.MAX - 1].name, 'f' + (at.MAX - 1) + '.jpg');
        assert.equal(at.add(r.list, [r.list[0]]).dropped, 0);
    });
    it('leaves the staged list as it was', function () {
        var staged = [file('a')];
        at.add(staged, [file('b')]);
        assert.equal(staged.length, 1);
        assert.deepEqual(at.add(null, null), { list: [], dropped: 0 });
    });
    it('a path named like an Object property is still a file', function () {
        assert.equal(at.add([], [{ path: 'constructor' }]).list.length, 1);
    });
});

describe('attachments.remove', function () {
    it('takes off the one tapped', function () {
        var staged = [file('a'), file('b'), file('c')];
        assert.deepEqual(at.remove(staged, 1).map(function (f) { return f.name; }), ['a.jpg', 'c.jpg']);
        assert.equal(staged.length, 3);
        assert.equal(at.remove(staged, 3).length, 3);
        assert.equal(at.remove(staged, -1).length, 3);
    });
});

describe('attachments.messages', function () {
    it('one per file, the text on the first', function () {
        assert.deepEqual(at.messages('Look', [file('a'), file('b')], true), [
            { text: 'Look', file: file('a') },
            { text: '', file: file('b') }
        ]);
        assert.deepEqual(at.messages('', [file('a')], true), [{ text: '', file: file('a') }]);
    });
    it('just the text without files, or where they cannot go (SMS)', function () {
        assert.deepEqual(at.messages('Hi', [], true), [{ text: 'Hi', file: null }]);
        assert.deepEqual(at.messages('Hi', [file('a')], false), [{ text: 'Hi', file: null }]);
        assert.deepEqual(at.messages('Hi', null, true), [{ text: 'Hi', file: null }]);
    });
    it('nothing for nothing to send', function () {
        assert.deepEqual(at.messages('', [], true), []);
        assert.deepEqual(at.messages('', [file('a')], false), []);
    });
});
