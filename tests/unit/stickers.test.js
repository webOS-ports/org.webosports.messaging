/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/stickers.js - the .webp files one can send as a sticker: from the media index and
 * from the chat's messages, newest first, each once.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var st = bootstrap.load('util/stickers.js');

var HASH = 'a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233445566778';

describe('stickers.isStickerPath', function () {
    it('an absolute path to a .webp, in any case', function () {
        assert.equal(st.isStickerPath('/media/internal/s/cat.webp'), true);
        assert.equal(st.isStickerPath('/media/internal/s/CAT.WEBP'), true);
    });
    it('not another picture, a relative path, a URL or nothing', function () {
        assert.equal(st.isStickerPath('/media/internal/s/cat.png'), false);
        assert.equal(st.isStickerPath('/media/internal/s/cat.webp.jpg'), false);
        assert.equal(st.isStickerPath('s/cat.webp'), false);
        assert.equal(st.isStickerPath('file:///media/internal/cat.webp'), false);
        assert.equal(st.isStickerPath(undefined), false);
        assert.equal(st.isStickerPath(7), false);
    });
});

describe('stickers.indexQuery', function () {
    it('the newest pictures of the media index, a page of them', function () {
        assert.deepEqual(st.indexQuery(), {
            from: 'com.palm.media.image.file:1', orderBy: 'modifiedTime', desc: true,
            select: ['path', 'mimeType', 'modifiedTime', 'type'], limit: 500
        });
    });
});

describe('stickers.fromIndex', function () {
    it('the local .webp files, their mtime (seconds) in ms', function () {
        assert.deepEqual(st.fromIndex([
            { path: '/media/internal/s/a.webp', mimeType: 'image/webp', modifiedTime: 1700000000, type: 'local' },
            { path: '/media/internal/DCIM/b.jpg', mimeType: 'image/jpeg', modifiedTime: 1700000001, type: 'local' },
            { path: '/media/internal/s/c.webp', modifiedTime: 1600000000 }
        ]), [
            { path: '/media/internal/s/a.webp', time: 1700000000000 },
            { path: '/media/internal/s/c.webp', time: 1600000000000 }
        ]);
    });
    it('a WebP by its type though its name says otherwise', function () {
        assert.deepEqual(st.fromIndex([{ path: '/media/internal/s/sticker', mimeType: 'image/webp', modifiedTime: 5, type: 'local' }]),
            [{ path: '/media/internal/s/sticker', time: 5000 }]);
    });
    it('not a synced cloud picture, which is no file of ours', function () {
        assert.deepEqual(st.fromIndex([
            { path: '/media/internal/.photosApp/x/p.webp', type: 'com.palm.pigallery2', createdTime: 1 }
        ]), []);
    });
    it('nothing from nothing', function () {
        assert.deepEqual(st.fromIndex(undefined), []);
        assert.deepEqual(st.fromIndex([null, {}, { path: 3, mimeType: 'image/webp' }]), []);
    });
});

describe('stickers.fromMessages', function () {
    it('a sent one by its filePath, a received one by its file:// URL', function () {
        assert.deepEqual(st.fromMessages([
            { folder: 'outbox', filePath: '/media/internal/s/sent.webp', localTimestamp: 1700000002000 },
            { folder: 'inbox', messageText: 'file:///media/internal/.im-attachments/signal/' + HASH + '.webp', localTimestamp: 1700000003000 },
            { folder: 'inbox', messageText: 'look file:///media/internal/My%20Stickers/fun.webp ok', timestamp: 1700000004000 }
        ]), [
            { path: '/media/internal/s/sent.webp', time: 1700000002000 },
            { path: '/media/internal/.im-attachments/signal/' + HASH + '.webp', time: 1700000003000 },
            { path: '/media/internal/My Stickers/fun.webp', time: 1700000004000 }
        ]);
    });
    it('a time in seconds read as seconds', function () {
        assert.deepEqual(st.fromMessages([{ filePath: '/s/a.webp', timestamp: 1700000000 }]),
            [{ path: '/s/a.webp', time: 1700000000000 }]);
    });
    it('not a picture of another kind, a web link, nor a deleted message', function () {
        assert.deepEqual(st.fromMessages([
            { filePath: '/media/internal/DCIM/a.jpg' },
            { messageText: 'file:///media/internal/.im-attachments/whatsapp/' + HASH + '.png' },
            { messageText: 'https://example.com/s.webp' },
            { deleted: true, filePath: '/media/internal/s/gone.webp' },
            { messageText: 'file:///bad%E0%A4%A.webp' },
            null
        ]), []);
    });
});

describe('stickers.merge', function () {
    it('newest first across the lists', function () {
        var r = st.merge([[{ path: '/a.webp', time: 1 }, { path: '/c.webp', time: 3 }], [{ path: '/b.webp', time: 2 }]]);
        assert.deepEqual(r.map(function (s) { return s.path; }), ['/c.webp', '/b.webp', '/a.webp']);
    });
    it('a path once, at its newest', function () {
        var r = st.merge([[{ path: '/a.webp', time: 1 }, { path: '/a.webp', time: 9 }], [{ path: '/a.webp', time: 4 }]]);
        assert.deepEqual(r, [{ path: '/a.webp', time: 9 }]);
    });
    it('a file named by its content hash once, wherever it is', function () {
        var r = st.merge([
            [{ path: '/media/internal/.im-attachments/signal/' + HASH + '.webp', time: 5 }],
            [{ path: '/media/internal/stickers/' + HASH.toUpperCase() + '.webp', time: 7 }]
        ]);
        assert.deepEqual(r, [{ path: '/media/internal/stickers/' + HASH.toUpperCase() + '.webp', time: 7 }]);
    });
    it('two files of the same ordinary name are two stickers', function () {
        var r = st.merge([[{ path: '/x/cat.webp', time: 1 }, { path: '/y/cat.webp', time: 2 }]]);
        assert.equal(r.length, 2);
    });
    it('no more than max (MAX when not given)', function () {
        var many = [];
        for (var i = 0; i < st.MAX + 5; i++) { many.push({ path: '/s/' + i + '.webp', time: i }); }
        assert.equal(st.merge([many]).length, st.MAX);
        assert.deepEqual(st.merge([many], 2).map(function (s) { return s.path; }),
            ['/s/' + (st.MAX + 4) + '.webp', '/s/' + (st.MAX + 3) + '.webp']);
    });
    it('nothing from nothing', function () {
        assert.deepEqual(st.merge([]), []);
        assert.deepEqual(st.merge([null, undefined]), []);
    });
});

describe('stickers.src and asAttachment', function () {
    it('a file URL, spaces escaped', function () {
        assert.equal(st.src('/media/internal/My Stickers/a.webp'), 'file:///media/internal/My%20Stickers/a.webp');
    });
    it('staged as a picked picture is', function () {
        assert.deepEqual(st.asAttachment('/media/internal/s/cat.webp'),
            { path: '/media/internal/s/cat.webp', name: 'cat.webp', type: 'image' });
    });
});
