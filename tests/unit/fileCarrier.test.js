/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/fileCarrier.js - which messages can take a file. An IM message can; an SMS can only
 * as an MMS, and only while telephonyd says one can be sent; a send must never drop staged files.
 */

var { describe, it, afterEach } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var fileCarrier = bootstrap.load('util/fileCarrier.js');
var at = bootstrap.load('util/attachments.js');

var PHOTO = { path: '/media/internal/DCIM/a.jpg', name: 'a.jpg', type: 'image' };
var PHONE = ['sms', 'mms', '', undefined];
var IM = ['type_telegram', 'type_whatsapp', 'type_signal', 'type_matrix'];

describe('fileCarrier', function () {
    afterEach(function () {
        fileCarrier.setMmsAvailable(false);
    });

    it('writes MMS records', function () {
        assert.equal(fileCarrier.MMS_SEND, true);
    });

    it('a text message carries no file until telephonyd says MMS can be sent', function () {
        PHONE.forEach(function (name) {
            assert.equal(fileCarrier.canCarry(name), false, String(name));
        });
        assert.equal(fileCarrier.isMmsAvailable(), false);
    });

    it('a text message carries files while MMS is available, and not after it went', function () {
        fileCarrier.setMmsAvailable(true);
        PHONE.forEach(function (name) {
            assert.equal(fileCarrier.canCarry(name), true, String(name));
        });
        fileCarrier.setMmsAvailable(false);
        assert.equal(fileCarrier.canCarry('sms'), false);
    });

    it('takes only true as available', function () {
        [1, 'true', {}, null, undefined].forEach(function (v) {
            fileCarrier.setMmsAvailable(v);
            assert.equal(fileCarrier.isMmsAvailable(), false, String(v));
        });
    });

    it('an IM message carries one, MMS or not', function () {
        IM.forEach(function (name) {
            assert.equal(fileCarrier.canCarry(name), true, name);
        });
    });

    it('stops an SMS send that would leave staged files behind', function () {
        // Picked on Telegram, then the chat was switched to SMS, with no MMS service.
        assert.equal(fileCarrier.wouldDrop([PHOTO], 'sms'), true);
        assert.equal(fileCarrier.sendsAsMms([PHOTO], 'sms'), false);
    });

    it('sends staged files for SMS as an MMS once it is available', function () {
        fileCarrier.setMmsAvailable(true);
        assert.equal(fileCarrier.wouldDrop([PHOTO], 'sms'), false);
        assert.equal(fileCarrier.sendsAsMms([PHOTO], 'sms'), true);
    });

    it('sends nothing as MMS without files or on an IM service', function () {
        fileCarrier.setMmsAvailable(true);
        assert.equal(fileCarrier.sendsAsMms([], 'sms'), false);
        assert.equal(fileCarrier.sendsAsMms(undefined, 'sms'), false);
        assert.equal(fileCarrier.sendsAsMms([PHOTO], 'type_telegram'), false);
    });

    it('lets a send through when nothing is staged or the service carries the files', function () {
        assert.equal(fileCarrier.wouldDrop([], 'sms'), false);
        assert.equal(fileCarrier.wouldDrop(undefined, 'sms'), false);
        assert.equal(fileCarrier.wouldDrop([PHOTO], 'type_telegram'), false);
    });

    it('never puts a file path on an SMS record without MMS', function () {
        // What the views build: the parts of a send, with canCarry deciding whether a file goes.
        var parts = at.messages('hi', [PHOTO], fileCarrier.canCarry('sms'));
        assert.deepEqual(parts, [{ text: 'hi', file: null }]);
        var im = at.messages('hi', [PHOTO], fileCarrier.canCarry('type_telegram'));
        assert.equal(im[0].file, PHOTO);
    });
});
