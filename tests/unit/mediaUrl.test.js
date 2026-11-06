/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/mediaUrl.js - which URLs in a message are drawn as media.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var bootstrap = require('./bootstrap');

var mediaUrl = bootstrap.load('util/mediaUrl.js');

// The extensions ConversationItem passes, read from it so this test cannot drift from the app.
var VIEW = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'views', 'ConversationItem.js'), 'utf8');
var EXTS = ['_imageExt', '_audioExt', '_videoExt', '_docExt'].map(function (name) {
    return new RegExp(name + ': "([^"]+)"').exec(VIEW)[1];
}).join('|');

function found(text) {
    return text.match(mediaUrl.mediaUrlRe(EXTS)) || [];
}

describe('mediaUrlRe', function () {
    it('takes a received zip, which used to stay text a tap could not open', function () {
        var url = 'file:///media/internal/.im-attachments/whatsapp/60f17822/clash.zip';
        assert.deepEqual(found(url), [url]);
    });

    it('takes any local file, with or without an extension', function () {
        assert.deepEqual(found('file:///media/internal/a.apk'), ['file:///media/internal/a.apk']);
        assert.deepEqual(found('file:///media/internal/README'), ['file:///media/internal/README']);
    });

    it('still takes the media it took before', function () {
        ['file:///media/internal/.im-attachments/whatsapp/abc.data',
         'file:///media/internal/a.pdf', 'file:///media/internal/p.jpg',
         'https://example.com/p.jpg', 'https://example.com/v.mp4?x=1'].forEach(function (url) {
            assert.deepEqual(found(url), [url], url);
        });
    });

    it('leaves a web link that is not media as a link', function () {
        assert.deepEqual(found('see https://example.com/page.html and https://example.com/a.zip'), []);
    });

    it('stops at the end of the URL, so a caption after it stays text', function () {
        assert.deepEqual(found('file:///media/internal/a.zip\nthe report'), ['file:///media/internal/a.zip']);
        assert.deepEqual(found('file:///media/internal/a.zip<br>x'), ['file:///media/internal/a.zip']);
    });

    it('finds each of several', function () {
        assert.equal(found('file:///a/x.zip file:///b/y.zip https://e.com/z.png').length, 3);
    });
});
