/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/firstUse.js - the first-run screen is only for someone with no IM account.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var firstUse = bootstrap.load('util/firstUse.js');

describe('firstUse', function () {
    it('shows the first-run screen when there is no IM account', function () {
        assert.equal(firstUse({ firstUseMode: true }, true, 0), "show");
    });
    it('clears the flag when an IM account already exists', function () {
        assert.equal(firstUse({ firstUseMode: true }, true, 1), "clear");
    });
    it('does nothing once first use is over, account or not', function () {
        assert.equal(firstUse({ firstUseMode: false }, true, 0), "none");
        assert.equal(firstUse({ firstUseMode: false }, true, 2), "none");
    });
    it('waits for the account list before deciding', function () {
        assert.equal(firstUse({ firstUseMode: true }, false, 0), "wait");
    });
    it('waits for the prefs before deciding', function () {
        assert.equal(firstUse(null, true, 0), "wait");
    });
});
