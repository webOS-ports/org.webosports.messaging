/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/openThread.js - when the conversation on screen has lost its thread. A thread
 * deleted while open (the chat threader's migration removed one) was kept on screen, and sending
 * from it brought the deleted thread back and sent to its reply address - our own account.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var openThread = bootstrap.load('util/openThread.js');

describe('openThread.droppedOut', function () {
    var open = { _id: 't1' };

    it('is true when the open thread is no longer in the list', function () {
        assert.equal(openThread.droppedOut(open, [{ _id: 't2' }], ""), true);
        assert.equal(openThread.droppedOut(open, [], ""), true);
    });

    it('is false while it is still there, with nothing open, or while a search filters the list', function () {
        assert.equal(openThread.droppedOut(open, [{ _id: 't2' }, { _id: 't1' }], ""), false);
        assert.equal(openThread.droppedOut(null, [], ""), false);
        assert.equal(openThread.droppedOut(open, [], "ali"), false);
    });
});

describe('openThread.gone', function () {
    it('is true for no record or a deleted one', function () {
        assert.equal(openThread.gone({ returnValue: true, results: [] }), true);
        assert.equal(openThread.gone({ returnValue: true, results: [{ _id: 't1', _del: true }] }), true);
        assert.equal(openThread.gone(undefined), true);
    });

    it('is false for a thread that is only hidden', function () {
        assert.equal(openThread.gone({ returnValue: true, results: [{ _id: 't1', flags: { visible: false } }] }), false);
    });
});
