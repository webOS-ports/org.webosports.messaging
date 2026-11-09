/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/imageViewer.js (its geometry) and app/src/util/threadPictures.js.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var iv = bootstrap.load('util/imageViewer.js');
var tp = bootstrap.load('util/threadPictures.js');

describe('imageViewer geometry', function () {
    it('fits a picture to the screen without cropping', function () {
        assert.deepEqual(iv.fit(1000, 500, 400, 800), { w: 400, h: 200 });
        assert.deepEqual(iv.fit(500, 1000, 400, 400), { w: 200, h: 400 });
        assert.deepEqual(iv.fit(0, 0, 400, 800), { w: 400, h: 800 }, 'no size yet: the screen');
    });

    it('pans no further than the edges, and not at all along a side that fits', function () {
        assert.deepEqual(iv.clampPan({ x: 500, y: 500 }, 2, 400, 200, 400, 800), { x: 200, y: 0 });
        assert.deepEqual(iv.clampPan({ x: -500, y: 30 }, 1, 400, 200, 400, 800), { x: 0, y: 0 });
        assert.deepEqual(iv.clampPan({ x: -10, y: -10 }, 3, 400, 400, 400, 800), { x: -10, y: -10 });
    });

    it('keeps the point zoomed at under the finger', function () {
        var p = { x: 100, y: -40 }, t = { x: 10, y: 0 }, s = 1, s2 = 2.5;
        var t2 = iv.zoomAt(p, t, s, s2);
        // The content point under p: (p - t) / s, drawn after at t2 + s2 * that.
        assert.deepEqual({ x: t2.x + s2 * (p.x - t.x) / s, y: t2.y + s2 * (p.y - t.y) / s }, p);
    });

    it('closes on a long drag or a flick, not a nudge', function () {
        assert.equal(iv.closesOnRelease(150, 0), true);
        assert.equal(iv.closesOnRelease(-150, 0), true);
        assert.equal(iv.closesOnRelease(40, 1.2), true);
        assert.equal(iv.closesOnRelease(40, 0.1), false);
        assert.equal(iv.closesOnRelease(10, 2), false);
    });

    it('turns the page past a quarter of the screen or on a flick', function () {
        assert.equal(iv.turnsOnRelease(-120, 0, 400), true);
        assert.equal(iv.turnsOnRelease(60, 0, 400), false);
        assert.equal(iv.turnsOnRelease(60, 1, 400), true);
    });

    it('turns the page on the arrow keys and leaves Escape to back, one step at a time', function () {
        assert.equal(iv.keyStep({ key: 'ArrowLeft' }), -1);
        assert.equal(iv.keyStep({ key: 'ArrowRight' }), 1);
        // The back swipe is Escape down and up; the key-up is the back gesture, which closes the
        // viewer. Closing on the key-down too took the chat away with it.
        assert.equal(iv.keyStep({ key: 'Escape', keyCode: 27 }), 0);
        assert.equal(iv.keyStep({ keyCode: 27 }), 0);
        assert.equal(iv.keyStep({ key: 'Enter' }), 0);
    });
});

describe('threadPictures', function () {
    var msgs = [
        { _id: 'b', localTimestamp: 2, messageText: 'see https://x.org/a.jpg and https://x.org/doc.pdf' },
        { _id: 'a', localTimestamp: 1, messageText: 'file:///media/internal/p%20q.png' },
        { _id: 'c', localTimestamp: 3, messageText: '', filePath: '/media/internal/sent.webp' },
        { _id: 'd', localTimestamp: 4, messageText: 'https://x.org/a.jpg again' },
        { _id: 'e', localTimestamp: 5, messageText: 'https://x.org/gone.jpg', deleted: true },
        { _id: 'f', localTimestamp: 6, messageText: 'https://x.org/q.png?size=2&amp;v=1' }
    ];

    it('lists the pictures oldest first, each once, none of a deleted message', function () {
        assert.deepEqual(tp.list(msgs).map(function (p) { return p.url; }), [
            'file:///media/internal/p%20q.png', 'https://x.org/a.jpg', 'file:///media/internal/sent.webp',
            'https://x.org/q.png?size=2&v=1'
        ]);
        assert.equal(tp.list(msgs)[1].messageId, 'b');
    });

    it('finds the tapped one as the bubble gives it', function () {
        var pics = tp.list(msgs);
        assert.equal(tp.indexOf(pics, 'https://x.org/a.jpg'), 1);
        assert.equal(tp.indexOf(pics, 'https://x.org/nope.jpg'), -1);
        assert.equal(tp.indexOf([{ url: 'file:///a"b.jpg' }], 'file:///a%22b.jpg'), 0);
    });
});
