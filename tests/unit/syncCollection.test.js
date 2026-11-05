/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/syncCollection.js - a list follows its query, including down to nothing.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var syncCollection = bootstrap.load('util/syncCollection.js');

// Just enough of enyo/Collection, with its add() purge rule: models missing from the new records
// are only removed when at least one record was kept (Collection.js: `purge && (keep && keep.length)`).
function collectionOf(records) {
    var c = {
        list: [],
        get length() { return this.list.length; },
        get models() { var self = this; return { copy: function () { return self.list.slice(); } }; },
        at: function (i) { return this.list[i]; },
        add: function (recs, opts) {
            var self = this, keep = [];
            recs.forEach(function (r) {
                var m = self.list.find(function (x) { return x.attributes._id === r._id; });
                if (m) { m.attributes = r; keep.push(m); } else { self.list.push({ attributes: r }); }
            });
            if (opts.purge && keep.length) {
                self.list = self.list.filter(function (m) {
                    return keep.indexOf(m) >= 0 || recs.some(function (r) { return r === m.attributes; });
                });
            }
        },
        remove: function (models) {
            this.list = this.list.filter(function (m) { return models.indexOf(m) < 0; });
        },
        sort: function (fn) { this.list.sort(fn); }
    };
    c.add(records, { merge: true, purge: true });
    return c;
}

function ids(c) { return c.list.map(function (m) { return m.attributes._id; }); }

describe('syncCollection', function () {
    it('empties the list when the query returns nothing', function () {
        var c = collectionOf([{ _id: 'tg1' }, { _id: 'tg2' }]);
        syncCollection(c, []);
        assert.deepEqual(ids(c), []);
    });

    it('treats a missing result as empty', function () {
        var c = collectionOf([{ _id: 'tg1' }]);
        syncCollection(c, undefined);
        assert.deepEqual(ids(c), []);
    });

    it('drops models that went away and keeps the query order', function () {
        var c = collectionOf([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]);
        syncCollection(c, [{ _id: 'c' }, { _id: 'd' }, { _id: 'a' }]);
        assert.deepEqual(ids(c), ['c', 'd', 'a']);
    });

    it('keeps the same model objects for records still present', function () {
        var c = collectionOf([{ _id: 'a' }, { _id: 'b' }]);
        var a = c.at(0);
        syncCollection(c, [{ _id: 'a', name: 'x' }]);
        assert.equal(c.at(0), a);
        assert.equal(a.attributes.name, 'x');
    });

    it('does nothing without a collection', function () {
        syncCollection(null, [{ _id: 'a' }]);
    });
});
