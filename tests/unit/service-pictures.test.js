/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/lib/pictures.js - a picture from a chat, saved where Photos finds it.
 */

var { describe, it, before, after } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');

var { createPictures } = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'pictures.js'));

describe('savePicture', function () {
    var root, media, saveDir, pictures, outside;

    before(function () {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'messaging-pictures-'));
        media = path.join(root, 'media');
        saveDir = path.join(media, 'Messaging');
        outside = path.join(root, 'elsewhere');
        fs.mkdirSync(path.join(media, '.im-attachments', 'whatsapp'), { recursive: true });
        fs.mkdirSync(outside);
        fs.writeFileSync(path.join(media, '.im-attachments', 'whatsapp', 'a1.jpg'), 'one');
        fs.writeFileSync(path.join(media, '.im-attachments', 'whatsapp', 'my photo.png'), 'spaced');
        fs.writeFileSync(path.join(media, '.im-attachments', 'notes.txt'), 'text');
        fs.writeFileSync(path.join(outside, 'secret.jpg'), 'outside');
        fs.symlinkSync(path.join(outside, 'secret.jpg'), path.join(media, 'link.jpg'));
        pictures = createPictures({ media: media, saveDir: saveDir });
    });

    after(function () {
        fs.rmSync(root, { recursive: true, force: true });
    });

    function src(name) { return path.join(media, '.im-attachments', 'whatsapp', name); }

    it('copies a picture into the folder Photos sees, from a path or a file:// URL', async function () {
        var r = await pictures.savePicture({ path: src('a1.jpg') });
        assert.deepEqual(r, { path: path.join(saveDir, 'a1.jpg'), saved: true });
        assert.equal(fs.readFileSync(r.path, 'utf8'), 'one');
        var u = await pictures.savePicture({ path: 'file://' + encodeURI(src('my photo.png')) });
        assert.deepEqual(u, { path: path.join(saveDir, 'my photo.png'), saved: true });
    });

    it('does not copy the same picture twice, and gives another one of the name a name of its own', async function () {
        var again = await pictures.savePicture({ path: src('a1.jpg') });
        assert.deepEqual(again, { path: path.join(saveDir, 'a1.jpg'), saved: false });
        fs.mkdirSync(path.join(media, '.im-attachments', 'signal'), { recursive: true });
        fs.writeFileSync(path.join(media, '.im-attachments', 'signal', 'a1.jpg'), 'two');
        var other = await pictures.savePicture({ path: path.join(media, '.im-attachments', 'signal', 'a1.jpg') });
        assert.deepEqual(other, { path: path.join(saveDir, 'a1 (2).jpg'), saved: true });
        assert.equal(fs.readFileSync(path.join(saveDir, 'a1.jpg'), 'utf8'), 'one', 'the first is not overwritten');
        // One already in the folder is left where it is.
        assert.deepEqual(await pictures.savePicture({ path: path.join(saveDir, 'a1.jpg') }),
            { path: path.join(saveDir, 'a1.jpg'), saved: false });
    });

    it('saves nothing but a picture of the device\'s media', async function () {
        var refused = async function (p) {
            await assert.rejects(pictures.savePicture({ path: p }), function (e) {
                return e.errorCode === 'BAD_ARGS' || e.errorCode === 'MISSING_ARGS';
            }, String(p));
        };
        await refused(path.join(outside, 'secret.jpg'));                 // outside it
        await refused(path.join(media, 'link.jpg'));                      // a link that leads outside
        await refused(path.join(media, '.im-attachments', 'whatsapp', '..', '..', '..', 'elsewhere', 'secret.jpg'));
        await refused(path.join(media, '.im-attachments', 'notes.txt'));  // not a picture
        await refused(path.join(media, 'gone.jpg'));                      // no such file
        await refused('relative/a1.jpg');
        await refused('file://%E0%A4%A.jpg');                             // not a file name
        await refused('');
        await refused(undefined);
        assert.deepEqual(fs.readdirSync(saveDir).sort(), ['a1 (2).jpg', 'a1.jpg', 'my photo.png']);
    });

    it('saves no file larger than the limit', async function () {
        var small = createPictures({ media: media, saveDir: saveDir,
            fsp: Object.assign({}, fs.promises, {
                stat: async function (p) { var s = await fs.promises.stat(p); return { isFile: function () { return s.isFile(); }, size: 65 * 1024 * 1024 }; }
            }) });
        await assert.rejects(small.savePicture({ path: src('a1.jpg') }), /too large/);
    });
});
