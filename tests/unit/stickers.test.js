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

describe('the default stickers', function () {
    var fs = require('fs'), path = require('path');
    var dir = path.join(__dirname, '..', '..', 'app', 'assets', 'stickers');

    it('are the files the app brings, each a 512x512 WebP WhatsApp takes as a sticker', function () {
        var files = fs.readdirSync(dir).filter(function (f) { return /\.webp$/.test(f); }).sort();
        assert.deepEqual(st.DEFAULTS.slice().sort(), files);
        assert.equal(files.length, 24);
        files.forEach(function (f) {
            var b = fs.readFileSync(path.join(dir, f));
            assert.equal(b.toString('latin1', 0, 4) + b.toString('latin1', 8, 12), 'RIFFWEBP', f);
            assert.ok(b.length <= 100 * 1024, f + ' is ' + b.length + ' bytes');
            // VP8X: the canvas size, less one, in 24 bits at 24 and 27.
            assert.equal(b.toString('latin1', 12, 16), 'VP8X', f + ': an extended WebP, for its alpha');
            assert.equal(b.readUIntLE(24, 3) + 1, 512, f);
            assert.equal(b.readUIntLE(27, 3) + 1, 512, f);
        });
        assert.ok(fs.existsSync(path.join(dir, 'NOTICE')), 'with the notice their licence asks for');
    });

    it('are found beside the app\'s page, as files the plugin can send', function () {
        var d = st.defaults('file:///usr/palm/applications/org.webosports.app.messaging/index.html?x=1#y');
        assert.equal(d.length, 24);
        assert.deepEqual(d[0], { path: '/usr/palm/applications/org.webosports.app.messaging/assets/stickers/01-emoji-u1f602.webp', time: 0 });
        assert.ok(d.every(function (s) { return st.isStickerPath(s.path); }));
        assert.equal(st.defaults('file:///home/me/my%20pack/index.html')[0].path,
            '/home/me/my pack/assets/stickers/01-emoji-u1f602.webp');
        ['http://localhost:8080/index.html', '', null, 'file://', 'file:///a%E0%A4%A/index.html'].forEach(function (u) {
            assert.deepEqual(st.defaults(u), [], String(u));
        });
    });

    it('come after one\'s own, each once', function () {
        var own = [{ path: '/media/internal/s/cat.webp', time: 5 },
            { path: '/usr/palm/applications/m/assets/stickers/02-emoji-u1f923.webp', time: 4 }];
        var all = st.withDefaults(own, st.defaults('file:///usr/palm/applications/m/index.html'));
        assert.equal(all.length, 25);
        assert.deepEqual(all.slice(0, 3).map(function (s) { return s.path.replace(/.*\//, ''); }),
            ['cat.webp', '02-emoji-u1f923.webp', '01-emoji-u1f602.webp']);
        assert.deepEqual(st.withDefaults(own, []), own);
        assert.deepEqual(st.withDefaults(null, null), []);
    });
});
