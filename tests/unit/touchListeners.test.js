/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/touchListeners.js - Enyo's bare document touch listeners are added non-passive.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var tl = bootstrap.load('util/touchListeners.js');

/** A window whose EventTarget records what reaches the real addEventListener. */
function fakeWindow(readsPassive) {
    var added = [];
    function EventTarget() {}
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (readsPassive && options && typeof options === 'object') { void options.passive; }
        added.push({ target: this, type: type, options: options });
    };
    EventTarget.prototype.removeEventListener = function () {};
    var win = Object.create(EventTarget.prototype);
    win.EventTarget = EventTarget;
    win.document = Object.create(EventTarget.prototype);
    win.document.documentElement = Object.create(EventTarget.prototype);
    win.document.body = Object.create(EventTarget.prototype);
    win.added = added;
    return win;
}

describe('touchListeners', function () {
    it('adds a bare touchstart or touchmove on the document level as non-passive', function () {
        var win = fakeWindow(true);
        [win, win.document, win.document.documentElement, win.document.body].forEach(function (t) {
            assert.deepEqual(tl.optionsFor(win, t, 'touchmove', false), { capture: false, passive: false });
            assert.deepEqual(tl.optionsFor(win, t, 'touchstart', undefined), { capture: false, passive: false });
            assert.deepEqual(tl.optionsFor(win, t, 'touchstart', true), { capture: true, passive: false });
        });
    });

    it('leaves other events, other targets and explicit options alone', function () {
        var win = fakeWindow(true);
        var own = { passive: true };
        assert.equal(tl.optionsFor(win, win.document, 'touchmove', own), own);
        assert.equal(tl.optionsFor(win, win.document, 'touchend', false), false);
        assert.equal(tl.optionsFor(win, win.document, 'wheel', false), false);
        assert.equal(tl.optionsFor(win, Object.create(win.EventTarget.prototype), 'touchmove', false), false,
            'an element below the root is not passive by default in the first place');
    });

    it('wraps addEventListener once, and only where the engine reads `passive`', function () {
        var win = fakeWindow(true);
        assert.equal(tl.install(win), true);
        assert.equal(tl.install(win), false);
        win.added.length = 0;
        var fn = function () {};
        win.document.addEventListener('touchmove', fn, false);
        win.document.addEventListener('click', fn, true);
        assert.deepEqual(win.added.map(function (a) { return [a.type, a.options]; }),
            [['touchmove', { capture: false, passive: false }], ['click', true]]);

        var old = fakeWindow(false);
        assert.equal(tl.install(old), false, 'an engine without listener options keeps its own');
        assert.equal(tl.install(null), false);
    });
});
