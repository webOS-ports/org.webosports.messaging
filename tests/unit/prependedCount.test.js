/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/prependedCount.js - older messages backfilled in front of the shown ones.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var prependedCount = bootstrap.load('util/prependedCount.js');

describe('prependedCount', function () {
    it('counts the older messages in front of the shown ones', function () {
        assert.equal(prependedCount(['c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e']), 2);
    });
    it('still counts them when a new message also arrived at the end', function () {
        assert.equal(prependedCount(['c', 'd'], ['a', 'b', 'c', 'd', 'e']), 2);
    });
    it('is 0 for the first page, when nothing is shown yet', function () {
        assert.equal(prependedCount([], ['a', 'b']), 0);
    });
    it('is 0 when nothing came in front', function () {
        assert.equal(prependedCount(['a', 'b'], ['a', 'b', 'c']), 0);
    });
    it('is 0 when the first shown message is gone from the results', function () {
        assert.equal(prependedCount(['x', 'b'], ['a', 'b', 'c']), 0);
    });
    it('is 0 when a shown message moved in front of the first one', function () {
        assert.equal(prependedCount(['b', 'c', 'a'], ['a', 'b', 'c']), 0);
    });
});
