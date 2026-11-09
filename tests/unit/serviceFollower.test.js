/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/serviceFollower.js - a subscription made again each time its service comes back.
 * The hub's registerServerStatus replies say when the service is up and when it has gone; the
 * follower subscribes on every "up", ends the subscription before it first, and says when the
 * service went.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var ServiceFollower = bootstrap.load('util/serviceFollower.js').ServiceFollower;

function follower() {
    var log = { started: 0, stopped: 0, cancelled: [] };
    var f = new ServiceFollower(function () {
        log.started++;
        return { n: log.started };
    }, function () {
        log.stopped++;
    }, function (request) {
        log.cancelled.push(request.n);
    });
    return { f: f, log: log };
}

describe('serviceFollower', function () {
    it('subscribes when the first reply says the service is up', function () {
        var t = follower();
        t.f.status({ serviceName: 'com.palm.imlibpurple', connected: true });
        assert.equal(t.log.started, 1);
        assert.deepEqual(t.log.cancelled, []);
        assert.equal(t.f.up, true);
    });

    it('does nothing until it is told the service is up', function () {
        var t = follower();
        t.f.status({ returnValue: true });
        t.f.status(null);
        assert.equal(t.log.started, 0);
        assert.equal(t.log.stopped, 0);
    });

    it('subscribes again after a restart, ending the dead subscription first', function () {
        var t = follower();
        t.f.status({ connected: true });
        t.f.status({ connected: false });
        assert.deepEqual(t.log.cancelled, [1]);
        assert.equal(t.log.stopped, 1);
        assert.equal(t.f.up, false);
        t.f.status({ connected: true });
        assert.equal(t.log.started, 2);
        assert.equal(t.f.request.n, 2);
    });

    it('never leaves two subscriptions, even when "up" comes twice', function () {
        var t = follower();
        t.f.status({ connected: true });
        t.f.status({ connected: true });
        assert.equal(t.log.started, 2);
        assert.deepEqual(t.log.cancelled, [1]);
    });

    it('does not cancel what it does not hold', function () {
        var t = follower();
        t.f.status({ connected: false });
        assert.deepEqual(t.log.cancelled, []);
        assert.equal(t.log.stopped, 1);
    });
});
