/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/fileCarrier.js - which messages can take a file. An IM message can; an SMS can't
 * until something below the app sends MMS, and a send must not drop staged files on the way.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var fileCarrier = bootstrap.load('util/fileCarrier.js');
var at = bootstrap.load('util/attachments.js');

var PHOTO = { path: '/media/internal/DCIM/a.jpg', name: 'a.jpg', type: 'image' };

describe('fileCarrier', function () {
    it('has no MMS sender to hand a file to', function () {
        // webos-telephonyd sends com.palm.smsmessage:1 text only; nothing sends com.palm.mmsmessage:1.
        assert.equal(fileCarrier.MMS_SEND, false);
    });

    it('a text message carries no file, whichever name the phone service goes by', function () {
        ['sms', 'mms', '', undefined].forEach(function (name) {
            assert.equal(fileCarrier.canCarry(name), false, String(name));
        });
    });

    it('an IM message carries one', function () {
        ['type_telegram', 'type_whatsapp', 'type_signal', 'type_matrix'].forEach(function (name) {
            assert.equal(fileCarrier.canCarry(name), true, name);
        });
    });

    it('stops an SMS send that would leave staged files behind', function () {
        // Picked on Telegram, then the chat was switched to SMS before sending.
        assert.equal(fileCarrier.wouldDrop([PHOTO], 'sms'), true);
    });

    it('lets a send through when nothing is staged or the service carries the files', function () {
        assert.equal(fileCarrier.wouldDrop([], 'sms'), false);
        assert.equal(fileCarrier.wouldDrop(undefined, 'sms'), false);
        assert.equal(fileCarrier.wouldDrop([PHOTO], 'type_telegram'), false);
    });

    it('never puts a file path on an SMS record', function () {
        // What the views build: the parts of a send, with canCarry deciding whether a file goes.
        var parts = at.messages('hi', [PHOTO], fileCarrier.canCarry('sms'));
        assert.deepEqual(parts, [{ text: 'hi', file: null }]);
        var im = at.messages('hi', [PHOTO], fileCarrier.canCarry('type_telegram'));
        assert.equal(im[0].file, PHOTO);
    });
});
