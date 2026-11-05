/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/data/mockDb.js - the in-browser db8 stand-in the app (and the README screenshots) run on.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var bootstrap = require('./bootstrap');

var APP = path.resolve(__dirname, '..', '..', 'app');

global.window = global.window || {};
global.window.location = { href: 'http://127.0.0.1:8731/index.html?debug#x' };
var mockDb = bootstrap.load('data/mockDb.js');

describe('mockDb', function () {
    it('matches a field inside an array the way db8 does ("ims.value")', function () {
        var r = mockDb.find({
            from: 'com.palm.person:1',
            where: [{ prop: 'ims.value', op: '=', val: ['+46701234567', 'yuki.t'] }]
        });
        assert.deepEqual(r.results.map(function (p) { return p._id; }).sort(),
            ['person-marta', 'person-yuki']);
    });

    it('still matches plain dotted paths', function () {
        var r = mockDb.find({
            from: 'com.palm.chatthread:1',
            where: [{ prop: 'flags.visible', op: '=', val: true }, { prop: 'personId', op: '=', val: 'person-anna' }]
        });
        assert.deepEqual(r.results.map(function (t) { return t._id; }), ['thread-anna']);
    });

    it('points message pictures at absolute URLs next to index.html', function () {
        var r = mockDb.find({
            from: 'com.palm.message:1',
            where: [{ prop: 'conversations', op: '=', val: 'thread-marta' }]
        });
        var bodies = r.results.map(function (m) { return m.messageText; }).join(' ');
        assert.match(bodies, /http:\/\/127\.0\.0\.1:8731\/mock\/photos\/lake\.jpg/);
    });

    it('only refers to pictures that exist in app/', function () {
        var missing = [];
        var people = mockDb.find({ from: 'com.palm.person:1' }).results;
        people.forEach(function (p) {
            var file = p.photos && p.photos.squarePhotoPath;
            if (file && !fs.existsSync(path.join(APP, file))) { missing.push(file); }
        });
        mockDb.find({ from: 'com.palm.message:1' }).results.forEach(function (m) {
            (String(m.messageText).match(/mock\/[^\s"']+/g) || []).forEach(function (file) {
                if (!fs.existsSync(path.join(APP, file))) { missing.push(file); }
            });
        });
        assert.deepEqual(missing, []);
    });
});
