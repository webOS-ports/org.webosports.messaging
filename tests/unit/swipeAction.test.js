/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/swipeAction.js - a short right swipe on a message replies, a long one or a left
 * one deletes, a stray drag does nothing.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var swipeAction = bootstrap.load('util/swipeAction.js');

// A message row on a Pixel 3a card: 393 CSS px wide, so the delete distance is 216 px.
var W = 393;

describe('swipeAction on a message row', function () {
    it('replies on a short right swipe', function () {
        assert.equal(swipeAction(80, W, true), 'reply');
    });
    it('replies from the threshold on', function () {
        assert.equal(swipeAction(swipeAction.MIN_PX, W, true), 'reply');
    });
    it('does nothing just short of the threshold', function () {
        assert.equal(swipeAction(swipeAction.MIN_PX - 1, W, true), 'cancel');
    });
    it('still replies one pixel short of the delete distance', function () {
        assert.equal(swipeAction(215, W, true), 'reply');
    });
    it('asks to delete on a long right swipe', function () {
        assert.equal(swipeAction(216, W, true), 'confirm');
    });
    it('asks to delete on a short left swipe', function () {
        assert.equal(swipeAction(-swipeAction.MIN_PX, W, true), 'confirm');
    });
    it('does nothing on a tiny left drag', function () {
        assert.equal(swipeAction(-10, W, true), 'cancel');
    });
    it('treats a missing distance as no drag', function () {
        assert.equal(swipeAction(undefined, W, true), 'cancel');
    });
});

describe('swipeAction on a row without replies (a chat in the list)', function () {
    it('asks to delete on a short right swipe', function () {
        assert.equal(swipeAction(80, W, false), 'confirm');
    });
    it('does nothing on a stray drag', function () {
        assert.equal(swipeAction(20, W, false), 'cancel');
    });
});
