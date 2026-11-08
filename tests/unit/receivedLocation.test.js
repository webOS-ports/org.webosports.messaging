/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/receivedLocation.js - the places in a received message.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var rl = bootstrap.load('util/receivedLocation.js');

describe('receivedLocation', function () {
    it('a WhatsApp geo: link', function () {
        var t = 'Dam Square\nDam 1, Amsterdam\ngeo:52.3731,4.8925';
        assert.deepEqual(rl.find(t), [{ lat: '52.3731', lng: '4.8925' }]);
        assert.equal(rl.strip(t), 'Dam Square\nDam 1, Amsterdam\n');
    });
    it('a Telegram location line, as the database has it', function () {
        assert.deepEqual(rl.find('Location: 52.370216, 4.895168'), [{ lat: '52.370216', lng: '4.895168' }]);
        assert.equal(rl.strip('Location: 52.370216, 4.895168'), '');
        assert.deepEqual(rl.find('Location: -33.856800, 151.215300'), [{ lat: '-33.856800', lng: '151.215300' }]);
    });
    it('live ones, and a caption above or below', function () {
        assert.deepEqual(rl.find('Live location: 50.4501, 30.5234'), [{ lat: '50.4501', lng: '30.5234' }]);
        assert.deepEqual(rl.find('Live location until 14:05: 50.4501, 30.5234'), [{ lat: '50.4501', lng: '30.5234' }]);
        var html = 'Meet here<br>Location: 50.4501, 30.5234<br>by the fountain';
        assert.deepEqual(rl.find(html), [{ lat: '50.4501', lng: '30.5234' }]);
        assert.equal(rl.strip(html), 'Meet here<br>by the fountain');
        assert.equal(rl.strip('Meet here\nLocation: 50.4501, 30.5234'), 'Meet here');
    });
    it('not a sentence that mentions a location, nor no place', function () {
        assert.deepEqual(rl.find('the location: 1, 2 is wrong'), []);
        assert.deepEqual(rl.find('Location: 1, 2 or so'), []);
        assert.deepEqual(rl.find('Location: 95.0, 4.0'), []);
        assert.equal(rl.strip('Location: 95.0, 4.0'), 'Location: 95.0, 4.0');
        assert.deepEqual(rl.find('Location: here'), []);
        assert.deepEqual(rl.find(''), []);
        assert.deepEqual(rl.find(null), []);
    });
    it('finds each time it is asked, not from where the last search stopped', function () {
        var t = 'Location: 1.5, 2.5';
        assert.equal(rl.find(t).length, 1);
        assert.equal(rl.find(t).length, 1);
    });
});
