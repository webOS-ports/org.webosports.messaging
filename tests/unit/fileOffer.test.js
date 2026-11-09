/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/fileOffer.js - a file the transport offers rather than downloads: its card line.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var fo = bootstrap.load('util/fileOffer.js');
var L = function (s) { return s; };

describe('fileOffer.find', function () {
    it('reads the line the plugin writes, as stored or as HTML', function () {
        var line = 'luneos-file:?name=Holiday%20film.mp4&size=125829120&type=video&state=ask';
        assert.deepEqual(fo.find(line + '\nWhat a day'),
            { name: 'Holiday film.mp4', size: 125829120, type: 'video', state: 'ask', got: 0 });
        assert.deepEqual(fo.find(line.replace(/&/g, '&amp;') + '<br />What a day'),
            { name: 'Holiday film.mp4', size: 125829120, type: 'video', state: 'ask', got: 0 });
        assert.deepEqual(fo.find('luneos-file:?name=a.zip&size=2000000&type=document&state=downloading&got=500000'),
            { name: 'a.zip', size: 2000000, type: 'document', state: 'downloading', got: 500000 });
    });

    it('takes nothing else for one, and makes the odd field safe', function () {
        [undefined, null, '', 'hello', 'file:///media/internal/a.zip', 'luneos-file:'].forEach(function (t) {
            assert.equal(fo.find(t), null, String(t));
        });
        assert.deepEqual(fo.find('luneos-file:?name=%E0%A4%A&size=-5&type=exe&state=done&got=x'),
            { name: '', size: 0, type: 'document', state: 'ask', got: 0 });
        assert.equal(fo.find('luneos-file:?name=a%0Ab%01.zip').name, 'ab.zip', 'no control characters');
        assert.equal(fo.find('luneos-file:?name=%3Cb%3Ex%3C%2Fb%3E.zip').name, '<b>x</b>.zip', 'escaped when drawn, not here');
    });
});

describe('fileOffer.strip', function () {
    it('leaves the caption', function () {
        assert.equal(fo.strip('luneos-file:?name=a.mp4&size=1&type=video&state=ask\nNice'), 'Nice');
        assert.equal(fo.strip('luneos-file:?name=a.mp4&amp;size=1<br />Nice'), 'Nice');
        assert.equal(fo.strip('luneos-file:?name=a.mp4&size=1'), '');
        assert.equal(fo.strip('plain text'), 'plain text');
    });
});

describe('fileOffer.status', function () {
    it('says its size and what a tap does', function () {
        var offer = fo.find('luneos-file:?name=a.zip&size=5242880&type=document&state=ask');
        assert.equal(fo.status(offer, false, L), '5.0 MB · Tap to download');
        assert.equal(fo.status(offer, true, L), '5.0 MB · Downloading…', 'asked, before the plugin answers');
        offer.state = 'downloading'; offer.got = 2621440;
        assert.equal(fo.status(offer, false, L), '5.0 MB · Downloading… 50%');
        offer.got = 5242880;
        assert.equal(fo.status(offer, false, L), '5.0 MB · Downloading… 99%', 'never 100% before it is there');
        offer.state = 'failed';
        assert.equal(fo.status(offer, true, L), "5.0 MB · Couldn't download. Tap to try again.");
        assert.equal(fo.status({ state: 'ask', size: 0 }, false, L), 'Tap to download');
    });

    it('gives sizes as people read them', function () {
        assert.equal(fo.sizeText(100), '1 KB');
        assert.equal(fo.sizeText(1048575), '1024 KB');
        assert.equal(fo.sizeText(1048576), '1.0 MB');
        assert.equal(fo.sizeText(13107200), '13 MB');
        assert.equal(fo.sizeText(1610612736), '1.5 GB');
    });
});

describe('fileOffer.canStart', function () {
    it('starts once, and again after a failure', function () {
        var ask = fo.find('luneos-file:?state=ask'), going = fo.find('luneos-file:?state=downloading'),
            failed = fo.find('luneos-file:?state=failed');
        assert.equal(fo.canStart(ask, false), true);
        assert.equal(fo.canStart(ask, true), false);
        assert.equal(fo.canStart(going, false), false);
        assert.equal(fo.canStart(failed, true), true);
        assert.equal(fo.canStart(null, false), false);
    });
});
