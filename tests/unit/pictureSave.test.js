/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/pictureSave.js - the picture viewer's Save, into the folder Photos sees.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var pictureSave = bootstrap.load('util/pictureSave.js');

describe('pictureSave', function () {
    it('copies a picture on the device and downloads one on the web', function () {
        assert.equal(pictureSave.how('file:///media/internal/.im-attachments/whatsapp/ab.jpg'), 'copy');
        assert.equal(pictureSave.how('https://cdn.discordapp.com/attachments/1/2/cat.png?ex=1&amp;is=2'), 'download');
        assert.equal(pictureSave.how('http://example.org/a.gif'), 'download');
        ['', null, undefined, 'file://', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'ftp://x/y.jpg',
            'https://a b/c.jpg'].forEach(function (u) {
            assert.equal(pictureSave.how(u), null, String(u));
        });
    });

    it('asks the service to copy the file as the chat has it', function () {
        assert.deepEqual(pictureSave.copyRequest('file:///media/internal/.im-attachments/signal/x.jpg'),
            { path: 'file:///media/internal/.im-attachments/signal/x.jpg' });
    });

    it('downloads into the Messaging folder, under the name the address ends in', function () {
        assert.deepEqual(pictureSave.downloadRequest('https://cdn.discordapp.com/attachments/1/2/cat.png?ex=1&amp;is=2'), {
            target: 'https://cdn.discordapp.com/attachments/1/2/cat.png?ex=1&is=2',
            targetDir: '/media/internal/Messaging', targetFilename: 'cat.png', subscribe: true
        });
    });

    it('makes a safe file name that Photos takes for a picture', function () {
        assert.equal(pictureSave.fileName('https://x.org/p/My%20Holiday.JPG'), 'My Holiday.JPG');
        assert.equal(pictureSave.fileName('https://x.org/render?id=5'), 'render.jpg');
        assert.equal(pictureSave.fileName('https://x.org/'), 'picture.jpg');
        assert.equal(pictureSave.fileName('https://x.org/..%2F..%2Fetc%2Fpasswd'), 'etc_passwd.jpg');
        assert.equal(pictureSave.fileName('https://x.org/.hidden.png'), 'hidden.png');
        assert.ok(pictureSave.fileName('https://x.org/' + 'a'.repeat(300) + '.png').length <= 84);
    });

    it('reads the download\'s replies as a card\'s', function () {
        assert.deepEqual(pictureSave.outcome({ completed: true, completionStatusCode: 200, httpStatus: 200,
            target: '/media/internal/Messaging/cat.png' }), { state: 'done', path: '/media/internal/Messaging/cat.png' });
        assert.deepEqual(pictureSave.outcome({ completed: true, completionStatusCode: -5, httpStatus: 404, target: '' }),
            { state: 'failed' });
        assert.deepEqual(pictureSave.outcome({ amountReceived: 5, amountTotal: 10 }), { state: 'pending' });
    });
});
