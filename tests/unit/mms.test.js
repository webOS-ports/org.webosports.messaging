/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/mms.js - the com.palm.mmsmessage:1 record the app writes for text and files sent to
 * a phone number, as webos-telephonyd reads it (src/mmsjson.c mms_outgoing_from_record), and what
 * the views read back from a sent or received one.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var mms = bootstrap.load('util/mms.js');
var utils = bootstrap.load('util/messagingUtils.js');
var launchTargets = bootstrap.load('util/launchTargets.js');

var BASE = {
    _kind: 'com.palm.smsmessage:1',
    folder: 'outbox',
    status: 'pending',
    conversations: ['t1'],
    flags: { read: true, visible: true },
    to: [{ name: 'A', addr: '+15550100' }],
    messageText: 'typed',
    serviceName: 'sms'
};
var PHOTO = { path: '/media/internal/DCIM/a.JPG', name: 'a.JPG' };
var CLIP = { path: '/media/internal/v/clip.3gp' };
var ODD = { path: '/media/internal/x/notes.xyz', name: 'notes' };

describe('mms.record', function () {
    it('makes one MMS outbox record with the text and every file, in order', function () {
        var r = mms.record(BASE, 'hello', [PHOTO, CLIP]);
        assert.equal(r._kind, 'com.palm.mmsmessage:1');
        assert.equal(r.serviceName, 'mms');
        assert.equal(r.folder, 'outbox');
        assert.equal(r.status, 'pending');
        assert.deepEqual(r.to, BASE.to);
        assert.deepEqual(r.conversations, ['t1']);
        assert.equal(r.messageText, 'hello');
        assert.equal(r.filePath, PHOTO.path);
        assert.deepEqual(r.attachments, [
            { mimeType: 'text/plain', partText: 'hello' },
            { path: PHOTO.path, name: 'a.JPG', mimeType: 'image/jpeg' },
            { path: CLIP.path, name: 'clip.3gp', mimeType: 'video/3gpp' }
        ]);
    });

    it('leaves the record it was built from alone', function () {
        var base = JSON.parse(JSON.stringify(BASE));
        mms.record(base, 'x', [PHOTO]);
        assert.deepEqual(base, BASE);
    });

    it('has no text part when there is no text, and no type it does not know', function () {
        var r = mms.record(BASE, '', [ODD]);
        assert.equal(r.messageText, '');
        assert.deepEqual(r.attachments, [{ path: ODD.path, name: 'notes' }]);
    });

    it('is read back as the text it was sent with, by the threader and the toasts', function () {
        var r = mms.record(BASE, 'hello', [PHOTO]);
        assert.equal(utils.message.getMessageText(r), 'hello');
        assert.equal(utils.message.getNotificationText(r), 'hello');
    });
});

describe('mms reading a record back', function () {
    var RECEIVED = {
        _kind: 'com.palm.mmsmessage:1', serviceName: 'mms', folder: 'inbox',
        messageText: 'hi',
        filePath: '/media/internal/.mms-attachments/u/1-a.jpg',
        attachments: [
            { mimeType: 'text/plain', partText: 'hi' },
            { mimeType: 'image/jpeg', path: '/media/internal/.mms-attachments/u/1-a.jpg', name: 'a.jpg' },
            { mimeType: 'audio/amr', path: '/media/internal/.mms-attachments/u/2-b.amr' },
            { mimeType: 'image/png', path: 'relative.png' }
        ]
    };

    it('lists the files with an absolute path, and the ones after the first', function () {
        assert.deepEqual(mms.files(RECEIVED).map(function (f) { return f.path; }), [
            '/media/internal/.mms-attachments/u/1-a.jpg', '/media/internal/.mms-attachments/u/2-b.amr']);
        assert.deepEqual(mms.moreFiles(RECEIVED).map(function (f) { return f.path; }), [
            '/media/internal/.mms-attachments/u/2-b.amr']);
        assert.deepEqual(mms.files({}), []);
        assert.deepEqual(mms.moreFiles(null), []);
    });

    it('tells an MMS with content from the TouchPad\'s note of one on the phone', function () {
        assert.equal(mms.hasContent(RECEIVED), true);
        assert.equal(mms.hasContent({ _kind: 'com.palm.mmsmessage:1', serviceName: 'mms', filePath: '/a.jpg' }), true);
        assert.equal(mms.hasContent({ _kind: 'com.palm.mmsmessage:1', messageText: 'x' }), false);
        assert.equal(mms.hasContent({ _kind: 'com.palm.mmsmessage:1', serviceName: 'mms' }), false);
        assert.equal(mms.hasContent({ _kind: 'com.palm.smsmessage:1', serviceName: 'mms', messageText: 'x' }), false);
    });

    it('a toast says an MMS\'s text, or the kind of its file', function () {
        assert.equal(utils.message.getNotificationText(RECEIVED), 'hi');
        var photo = { _kind: 'com.palm.mmsmessage:1', serviceName: 'mms', filePath: '/m/a.jpg', attachments: [] };
        assert.equal(utils.message.getNotificationText(photo), 'Photo');
    });

    it('knows SMS and MMS text as plain text, IM text not', function () {
        assert.equal(mms.isPlainTextKind({ _kind: 'com.palm.smsmessage:1' }), true);
        assert.equal(mms.isPlainTextKind(RECEIVED), true);
        assert.equal(mms.isPlainTextKind({ _kind: 'com.palm.immessage.libpurple:1' }), false);
        assert.equal(mms.isPlainTextKind(null), false);
    });

    it('draws a received SMS with markup in it as its letters (what ConversationItem does)', function () {
        var sms = { _kind: 'com.palm.smsmessage:1', folder: 'inbox', messageText: '<img src=x onerror=alert(1)>\nok' };
        assert.equal(mms.isPlainTextKind(sms), true);
        assert.equal(launchTargets.outgoingHtml(sms.messageText, utils.message.escapeHtml),
            '&lt;img src=x onerror=alert(1)&gt;<br>ok');
    });
});

describe('mms.availableFrom', function () {
    it('is true only for a reply that says available: true', function () {
        assert.equal(mms.availableFrom({ returnValue: true, available: true, subscribed: true }), true);
        assert.equal(mms.availableFrom({ available: true }), true);
        assert.equal(mms.availableFrom({ returnValue: true, available: false }), false);
        assert.equal(mms.availableFrom({ returnValue: false, available: true }), false);
        assert.equal(mms.availableFrom({ returnValue: true, available: 'yes' }), false);
        assert.equal(mms.availableFrom({ returnValue: true }), false);
        assert.equal(mms.availableFrom(null), false);
    });
});

describe('mms.mimeTypeOf', function () {
    it('names the type by the extension, any case, and nothing for an unknown one', function () {
        assert.equal(mms.mimeTypeOf('/a/b.JPEG'), 'image/jpeg');
        assert.equal(mms.mimeTypeOf('/a/b.amr'), 'audio/amr');
        assert.equal(mms.mimeTypeOf('/a/b.vcf'), 'text/x-vcard');
        assert.equal(mms.mimeTypeOf('/a/b'), '');
        assert.equal(mms.mimeTypeOf('/a/b.zzz'), '');
        assert.equal(mms.mimeTypeOf(undefined), '');
    });
});
