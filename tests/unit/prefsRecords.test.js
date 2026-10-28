/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/prefsRecords.js - which prefs record the app uses when db8 holds more than one.
 * Two records, one changed by Done and one not, is how the first-run screen kept coming back.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var pickPrefsRecord = bootstrap.load('util/prefsRecords.js');

describe('pickPrefsRecord', function () {
    it('has nothing to keep when there are no records', function () {
        assert.deepEqual(pickPrefsRecord([]), { keep: null, extraIds: [] });
        assert.deepEqual(pickPrefsRecord(undefined), { keep: null, extraIds: [] });
    });

    it('keeps a single record and deletes nothing', function () {
        var only = { _id: 'a', _rev: 3, firstUseMode: true };
        assert.deepEqual(pickPrefsRecord([only]), { keep: only, extraIds: [] });
    });

    it('keeps the record written last, wherever the query put it', function () {
        // The pair found on a device: Done had changed the second record, the app read the first.
        var stale = { _id: 'OTpNLbYIy8w', _rev: 10198, firstUseMode: true };
        var done = { _id: 'OTpNLbQGBYs', _rev: 10811, firstUseMode: false };
        assert.deepEqual(pickPrefsRecord([stale, done]), { keep: done, extraIds: ['OTpNLbYIy8w'] });
        assert.deepEqual(pickPrefsRecord([done, stale]), { keep: done, extraIds: ['OTpNLbYIy8w'] });
    });

    it('returns every other record for deletion', function () {
        var result = pickPrefsRecord([{ _id: 'a', _rev: 1 }, { _id: 'b', _rev: 9 }, { _id: 'c', _rev: 4 }]);
        assert.equal(result.keep._id, 'b');
        assert.deepEqual(result.extraIds, ['a', 'c']);
    });

    it('ignores entries that are not records', function () {
        var only = { _id: 'a', _rev: 2 };
        assert.deepEqual(pickPrefsRecord([null, {}, only]), { keep: only, extraIds: [] });
    });
});
