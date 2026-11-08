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
    it('a place shared to Discord from Android: degrees, minutes and seconds on their own line', function () {
        // The shape the database has, purple's "<br />\n" breaks included.
        var t = 'https://maps.app.goo.gl/AbCdEf<br />\n52°22\'12.3"N 4°53\'45.6"E<br />\nSun Nov 8 07:59:00 2026<br />\nhttps://maps.app.goo.gl/AbCdEf';
        assert.deepEqual(rl.find(t), [{ lat: '52.370083', lng: '4.896' }]);
        assert.equal(rl.strip(t), 'https://maps.app.goo.gl/AbCdEf<br />\nSun Nov 8 07:59:00 2026<br />\nhttps://maps.app.goo.gl/AbCdEf');
        assert.deepEqual(rl.find('33°51\'24.5"S 151°12\'55.1"W'), [{ lat: '-33.856806', lng: '-151.215306' }]);
        assert.deepEqual(rl.find('52°61\'12.3"N 4°53\'45.6"E'), [], 'no minute 61');
        assert.equal(rl.strip('52°61\'12.3"N 4°53\'45.6"E'), '52°61\'12.3"N 4°53\'45.6"E');
        assert.deepEqual(rl.find('meet at 52°22\'12.3"N 4°53\'45.6"E ok'), [], 'only a whole line');
    });
    it('a Google Maps link with q=, as this app sends a place, once even with a line for it too', function () {
        assert.deepEqual(rl.find('My location<br />\nhttps://maps.google.com/?q=52.3731,4.8925'), [{ lat: '52.3731', lng: '4.8925' }]);
        assert.deepEqual(rl.find('https://maps.google.de/maps?hl=de&amp;q=-33.8568,151.2153'), [{ lat: '-33.8568', lng: '151.2153' }]);
        assert.deepEqual(rl.find('geo:52.3731,4.8925 https://maps.google.com/?q=52.37310,4.89250'), [{ lat: '52.3731', lng: '4.8925' }]);
        assert.equal(rl.strip('https://maps.google.com/?q=52.3731,4.8925'), 'https://maps.google.com/?q=52.3731,4.8925', 'the link stays');
        assert.deepEqual(rl.find('https://maps.google.com/?q=Dam+Square'), []);
    });
    it('finds each time it is asked, not from where the last search stopped', function () {
        var t = 'Location: 1.5, 2.5';
        assert.equal(rl.find(t).length, 1);
        assert.equal(rl.find(t).length, 1);
    });
});
