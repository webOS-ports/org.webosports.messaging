/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/cameraCapture.js - Take Photo: the Camera app takes it, the media index gives it back.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var cameraCapture = bootstrap.load('util/cameraCapture.js');

// 2026-11-08 10:00:00 UTC, in ms.
var NOW = 1794132000000, SINCE = 1794132000;

function image(path, modifiedTime) {
    return { _kind: 'com.palm.media.image.file:1', path: path, modifiedTime: modifiedTime };
}

describe('cameraCapture', function () {
    it('opens the Camera app', function () {
        assert.deepEqual(cameraCapture.launch(), { id: 'org.webosports.app.camera', params: {} });
    });

    it('remembers the chat and the second Take Photo was tapped', function () {
        assert.deepEqual(cameraCapture.request('thread-1', NOW + 999), { threadId: 'thread-1', since: SINCE });
    });

    it('asks the media index for the images written since, oldest first', function () {
        assert.deepEqual(cameraCapture.query({ threadId: 't', since: SINCE }), {
            from: 'com.palm.media.image.file:1',
            where: [{ prop: 'modifiedTime', op: '>=', val: SINCE }],
            orderBy: 'modifiedTime',
            limit: 50
        });
    });

    it('gives back the photos in the Camera app\'s folder, oldest first, as staged images', function () {
        var req = cameraCapture.request('t', NOW);
        assert.deepEqual(cameraCapture.photos([
            image('/media/internal/DCIM/2026-11-08-10-00-09.jpg', SINCE + 9),
            image('/media/internal/DCIM/2026-11-08-10-00-03.jpg', SINCE + 3)
        ], req), [
            { path: '/media/internal/DCIM/2026-11-08-10-00-03.jpg', name: '2026-11-08-10-00-03.jpg', type: 'image' },
            { path: '/media/internal/DCIM/2026-11-08-10-00-09.jpg', name: '2026-11-08-10-00-09.jpg', type: 'image' }
        ]);
    });

    it('counts a photo written in the second Take Photo was tapped', function () {
        var req = cameraCapture.request('t', NOW);
        assert.equal(cameraCapture.photos([image('/media/internal/DCIM/a.jpg', SINCE)], req).length, 1);
    });

    it('leaves out a screenshot or a synced album filed meanwhile, and anything older', function () {
        var req = cameraCapture.request('t', NOW);
        assert.deepEqual(cameraCapture.photos([
            image('/media/internal/screencaptures/shot.png', SINCE + 5),
            image('/media/internal/.photosApp/com.palm.pigallery2/x/Album/p.jpg', SINCE + 5),
            image('/media/internal/DCIMother/p.jpg', SINCE + 5),
            image('/media/internal/DCIM/', SINCE + 5),
            image('/media/internal/DCIM/old.jpg', SINCE - 1),
            { path: '/media/internal/DCIM/notime.jpg' },
            null
        ], req), []);
    });

    it('stages a photo filed twice once', function () {
        var req = cameraCapture.request('t', NOW);
        assert.equal(cameraCapture.photos([
            image('/media/internal/DCIM/a.jpg', SINCE + 1), image('/media/internal/DCIM/a.jpg', SINCE + 2)
        ], req).length, 1);
    });

    it('takes no answer as no photos', function () {
        var req = cameraCapture.request('t', NOW);
        assert.deepEqual(cameraCapture.photos(undefined, req), []);
        assert.deepEqual(cameraCapture.photos([], req), []);
    });

    it('gives up on a request after a quarter of an hour', function () {
        var req = cameraCapture.request('t', NOW);
        assert.equal(cameraCapture.expired(req, NOW + 15 * 60 * 1000), false);
        assert.equal(cameraCapture.expired(req, NOW + 15 * 60 * 1000 + 1000), true);
        assert.equal(cameraCapture.expired(null, NOW), true);
    });
});
