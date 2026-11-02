/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/isNearBottom.js - new messages keep a conversation at its end, not someone reading.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var isNearBottom = bootstrap.load('util/isNearBottom.js');

describe('isNearBottom', function () {
    it('is true at the end', function () {
        assert.equal(isNearBottom({ top: 900, maxTop: 900 }), true);
    });
    it('is true when nothing scrolls yet', function () {
        assert.equal(isNearBottom({ top: 0, maxTop: 0 }), true);
    });
    it('is true just short of the end', function () {
        assert.equal(isNearBottom({ top: 852, maxTop: 900 }), true);
    });
    it('is false one pixel past the slack', function () {
        assert.equal(isNearBottom({ top: 851, maxTop: 900 }), false);
    });
    it('is false when scrolled up to read', function () {
        assert.equal(isNearBottom({ top: 100, maxTop: 900 }), false);
    });
    it('is false with no bounds', function () {
        assert.equal(isNearBottom(undefined), false);
    });
});
