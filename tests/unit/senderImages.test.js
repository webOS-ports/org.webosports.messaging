/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/senderImages.js - each group/channel sender's own avatar.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var senderImages = bootstrap.load('util/senderImages.js');

var DEFAULT = 'assets/list-avatar-default.svg';
var CODEPOET = '/var/luna/data/im-avatars/c720.png';

function channelMessage(addr, folder) {
    return {
        _id: addr + (folder || 'inbox'), folder: folder || 'inbox', serviceName: 'type_discord',
        chatType: 'groupchat', channelName: '1356921788038119559', from: { addr: addr, name: addr }
    };
}

function person(value, type, path) {
    return { _id: 'p-' + value, ims: [{ value: value, type: type }], photos: { squarePhotoPath: path } };
}

describe('senderImages', function () {
    it('asks once for each incoming channel sender', function () {
        var wanted = senderImages.addressesToLookUp([
            channelMessage('codepoet80'), channelMessage('codepoet80'), channelMessage('exanimo.')
        ], {});
        assert.deepEqual(wanted, { type_discord: ['codepoet80', 'exanimo.'] });
    });

    it('does not ask for 1:1 messages, own messages or senders already asked about', function () {
        var cache = {};
        senderImages.markAsked(cache, { type_discord: ['codepoet80'] });
        var dm = { folder: 'inbox', serviceName: 'type_discord', from: { addr: 'mazzinia' } };
        var wanted = senderImages.addressesToLookUp([
            dm, channelMessage('herrie.1982', 'outbox'), channelMessage('codepoet80')
        ], cache);
        assert.deepEqual(wanted, {});
    });

    it('gives a channel sender with a contact their photo', function () {
        var cache = {};
        senderImages.markAsked(cache, { type_discord: ['codepoet80', 'exanimo.'] });
        assert.equal(senderImages.remember(cache, [person('codepoet80', 'type_discord', CODEPOET)]), true);
        assert.equal(senderImages.imageFor(channelMessage('codepoet80'), cache, DEFAULT, DEFAULT), CODEPOET);
    });

    it('leaves a sender with no contact on the default image', function () {
        var cache = {};
        senderImages.markAsked(cache, { type_discord: ['exanimo.'] });
        assert.equal(senderImages.remember(cache, []), false);
        assert.equal(senderImages.imageFor(channelMessage('exanimo.'), cache, DEFAULT, DEFAULT), DEFAULT);
    });

    it('does not borrow a photo from the same handle on another service', function () {
        var cache = {};
        senderImages.markAsked(cache, { type_discord: ['codepoet80'] });
        senderImages.remember(cache, [person('codepoet80', 'type_teams', '/teams.png')]);
        assert.equal(senderImages.imageFor(channelMessage('codepoet80'), cache, DEFAULT, DEFAULT), DEFAULT);
    });

    it('keeps the thread avatar for 1:1 and outgoing bubbles', function () {
        var dm = { folder: 'inbox', serviceName: 'type_discord', from: { addr: 'codepoet80' } };
        assert.equal(senderImages.imageFor(dm, {}, CODEPOET, DEFAULT), CODEPOET);
        assert.equal(senderImages.imageFor(channelMessage('herrie.1982', 'outbox'), {}, DEFAULT, DEFAULT),
            DEFAULT);
    });
});
