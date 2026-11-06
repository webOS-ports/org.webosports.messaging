/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/showInFiles.js - a file no app opens is shown in Explorer, in its folder.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var showInFiles = bootstrap.load('util/showInFiles.js');

describe('showInFiles', function () {
    it('opens Explorer at the folder of a received zip, on that file', function () {
        // As the WhatsApp plug-in stores a document: in a folder named after its content hash.
        assert.deepEqual(showInFiles.showInFiles(
            'file:///media/internal/.im-attachments/whatsapp/3ba91c1f/clash.zip'), {
            id: 'com.palm.stark.files',
            params: { path: '/media/internal/.im-attachments/whatsapp/3ba91c1f', show: 'clash.zip' }
        });
    });

    it('hands Explorer the name as it is on disk, not URL-encoded', function () {
        var r = showInFiles.showInFiles('file:///media/internal/My%20Files/a%23b.zip');
        assert.equal(r.params.path, '/media/internal/My Files');
        assert.equal(r.params.show, 'a#b.zip');
    });

    it('leaves a query or fragment off the name', function () {
        assert.equal(showInFiles.showInFiles('file:///media/internal/x.zip?v=1').params.show, 'x.zip');
        assert.equal(showInFiles.showInFiles('file:///media/internal/x.zip#p').params.show, 'x.zip');
    });

    it('keeps a file in the root folder in the root folder', function () {
        assert.deepEqual(showInFiles.showInFiles('file:///x.zip').params, { path: '/', show: 'x.zip' });
    });

    it('keeps a name that does not decode as it is', function () {
        assert.equal(showInFiles.showInFiles('file:///media/internal/100%.zip').params.show, '100%.zip');
    });

    it('does nothing for what is not a file on this device', function () {
        assert.equal(showInFiles.showInFiles('https://example.com/a.zip'), null);
        assert.equal(showInFiles.showInFiles('file://host/a.zip'), null);
        assert.equal(showInFiles.showInFiles('file:///media/internal/'), null);
        assert.equal(showInFiles.showInFiles(''), null);
        assert.equal(showInFiles.showInFiles(undefined), null);
    });
});
