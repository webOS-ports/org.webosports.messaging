/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/swipeArm.js - one delete prompt at a time, and an unanswered one goes away when
 * another row is touched or the list scrolls, so it can never be left stuck on a row.
 */

var { describe, it, beforeEach } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var arm = bootstrap.load('util/swipeArm.js');

function row(name) {
    var r = {
        name: name, cancels: 0,
        cancelPending: function () { r.cancels++; arm.closed(r); }
    };
    return r;
}

describe('swipeArm', function () {
    beforeEach(function () { arm.cancel(); });

    it('opening a second prompt closes the first', function () {
        var a = row('a'), b = row('b');
        arm.shown(a);
        arm.shown(b);
        assert.equal(a.cancels, 1);
        assert.equal(b.cancels, 0);
        assert.equal(arm.current(), b);
    });

    it('a finger on another row closes the prompt; on its own row it does not', function () {
        var a = row('a'), b = row('b');
        arm.shown(a);
        arm.down(a);
        assert.equal(a.cancels, 0);
        assert.equal(arm.current(), a);
        arm.down(b);
        assert.equal(a.cancels, 1);
        assert.equal(arm.current(), null);
    });

    it('cancel (the list scrolled) closes it, once', function () {
        var a = row('a');
        arm.shown(a);
        arm.cancel();
        arm.cancel();
        assert.equal(a.cancels, 1);
        assert.equal(arm.current(), null);
    });

    it('cancel forgets the row even when its cancelPending does not say it closed', function () {
        var quiet = { cancels: 0, cancelPending: function () { quiet.cancels++; } };
        arm.shown(quiet);
        arm.cancel();
        arm.cancel();
        assert.equal(quiet.cancels, 1);
    });

    it('an answered prompt is forgotten', function () {
        var a = row('a'), b = row('b');
        arm.shown(a);
        arm.closed(a);
        arm.down(b);
        arm.cancel();
        assert.equal(a.cancels, 0);
    });

    it('closed for a row that is not pending leaves the pending one', function () {
        var a = row('a'), b = row('b');
        arm.shown(a);
        arm.closed(b);
        assert.equal(arm.current(), a);
    });

    it('nothing pending: down and cancel do nothing', function () {
        arm.down(row('x'));
        arm.cancel();
        assert.equal(arm.current(), null);
    });
});
