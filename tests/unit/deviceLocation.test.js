/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/deviceLocation.js - where the device is, once: the cached fix, else the first live
 * update, whose subscription is ended at once; an answer of each kind and a timeout end it.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var dl = bootstrap.load('util/deviceLocation.js');

/** A stand-in location service: records the calls, and lets a test answer them. */
function service() {
    var s = { calls: [], cancelled: 0 };
    s.call = function (method, params, onReply, onError) {
        var c = { method: method, params: params, reply: onReply, error: onError };
        s.calls.push(c);
        return { cancel: function () { s.cancelled++; } };
    };
    return s;
}

function clock() {
    var t = { pending: null, cleared: 0 };
    t.set = function (fn, ms) { t.pending = { fn: fn, ms: ms }; return 7; };
    t.clear = function (id) { if (id === 7) { t.cleared++; } };
    return t;
}

describe('deviceLocation.locate', function () {
    it('the cached fix, and nothing else asked', function () {
        var s = service(), t = clock(), got = [];
        dl.locate(s.call, t, function (e, fix) { got.push([e, fix]); });
        assert.equal(s.calls[0].method, 'getCachedPosition');
        s.calls[0].reply({ returnValue: true, latitude: 52.37, longitude: 4.89, horizAccuracy: 20 });
        assert.deepEqual(got, [[null, { latitude: 52.37, longitude: 4.89, accuracy: 20 }]]);
        assert.equal(s.calls.length, 1);
        assert.equal(t.cleared, 1, 'the timeout is stopped');
    });
    it('no cached fix: the first live update, then the subscription is ended', function () {
        var s = service(), t = clock(), got = [];
        dl.locate(s.call, t, function (e, fix) { got.push([e, fix]); });
        s.calls[0].error({ returnValue: false, errorCode: 4 });
        assert.equal(s.calls[1].method, 'getLocationUpdates');
        assert.equal(s.calls[1].params.subscribe, true);
        s.calls[1].reply({ returnValue: true, subscribed: true });
        assert.equal(got.length, 0, 'the acknowledgement has no position');
        s.calls[1].reply({ returnValue: true, latitude: -33.8, longitude: 151.2 });
        s.calls[1].reply({ returnValue: true, latitude: 1, longitude: 1 });
        assert.deepEqual(got, [[null, { latitude: -33.8, longitude: 151.2 }]], 'once');
        assert.equal(s.cancelled, 1);
    });
    it('a cached answer without a position goes on to the updates too', function () {
        var s = service(), t = clock();
        dl.locate(s.call, t, function () {});
        s.calls[0].reply({ returnValue: true });
        assert.equal(s.calls[1].method, 'getLocationUpdates');
    });
    it('a live update that fails says why', function () {
        var s = service(), t = clock(), got = [];
        dl.locate(s.call, t, function (e, fix) { got.push([e, fix]); });
        s.calls[0].error({});
        s.calls[1].reply({ returnValue: false, errorText: 'Location is off' });
        assert.deepEqual(got, [['Location is off', undefined]]);
        var s2 = service(), got2 = [];
        dl.locate(s2.call, clock(), function (e) { got2.push(e); });
        s2.calls[0].error({});
        s2.calls[1].error({ errorCode: 3 });
        assert.deepEqual(got2, ['Location error 3']);
    });
    it('no fix in time: a timeout, and a late answer is not taken', function () {
        var s = service(), t = clock(), got = [];
        dl.locate(s.call, t, function (e, fix) { got.push([e, fix]); }, 5000);
        assert.equal(t.pending.ms, 5000);
        s.calls[0].error({});
        t.pending.fn();
        assert.deepEqual(got, [['No location within 5 seconds.', undefined]]);
        assert.equal(s.cancelled, 1, 'the subscription is ended');
        s.calls[1].reply({ latitude: 1, longitude: 1 });
        assert.equal(got.length, 1);
    });
    it('cancelled: no answer, the subscription ended, a late cached fix ignored', function () {
        var s = service(), t = clock(), got = [];
        var cancel = dl.locate(s.call, t, function (e, fix) { got.push([e, fix]); });
        cancel();
        s.calls[0].reply({ latitude: 1, longitude: 1 });
        s.calls[0].error({});
        assert.equal(got.length, 0);
        s.calls[0].reply({ returnValue: true });
        assert.equal(s.calls.length, 1, 'nothing more asked, not even for a cached answer with no position');
        assert.equal(t.cleared, 1);
    });
});
