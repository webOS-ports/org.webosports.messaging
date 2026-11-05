/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/ircChannels.js - joining and leaving IRC channels from the Servers tab. The keys
 * and names are held to what imlibpurpleservice makes of them (src/IrcSupport.cpp): the payload
 * the app sends must name the channel the way the service's own imchannel rows do, or the joined
 * channel would show up as a second row.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var irc = bootstrap.load('util/ircChannels.js');

// An imserver row the way imlibpurpleservice writes it for an IRC account.
var LIBERA = { _id: 's1', serviceName: 'type_irc', remoteId: 'irc.libera.chat', name: 'irc.libera.chat' };

describe('ircChannels.canJoin / canLeave', function () {
    it('only IRC servers and channels', function () {
        assert.equal(irc.canJoin(LIBERA), true);
        assert.equal(irc.canJoin({ serviceName: 'type_discord', remoteId: 'guild' }), false);
        assert.equal(irc.canJoin({ serviceName: 'type_irc' }), false);
        assert.equal(irc.canJoin(null), false);
        assert.equal(irc.canLeave({ serviceName: 'type_irc', remoteId: '#webos@irc.libera.chat' }), true);
        assert.equal(irc.canLeave({ serviceName: 'type_teams', remoteId: '19:abc@thread.v2' }), false);
        assert.equal(irc.canLeave({ serviceName: 'type_irc', remoteId: '' }), false);
        assert.equal(irc.canLeave(undefined), false);
    });
});

describe('ircChannels.channelFromInput', function () {
    it('adds the # and trims, keeping the case', function () {
        assert.equal(irc.channelFromInput('linux'), '#linux');
        assert.equal(irc.channelFromInput('  #Linux '), '#Linux');
        assert.equal(irc.channelFromInput('&local'), '&local');
        assert.equal(irc.channelFromInput('+modeless'), '+modeless');
        assert.equal(irc.channelFromInput('!12345safe'), '!12345safe');
    });

    it('refuses what IRC does not allow in a channel name', function () {
        ['', '   ', '#', 'two words', 'a,b', '#a:b', '#bell\x07', '#c\rr', '#l\nf', '#nul\x00', null, undefined]
            .forEach(function (t) { assert.equal(irc.channelFromInput(t), '', JSON.stringify(t)); });
    });

    it('allows 200 bytes, counted as UTF-8', function () {
        assert.equal(irc.channelFromInput('#' + 'x'.repeat(199)), '#' + 'x'.repeat(199));
        assert.equal(irc.channelFromInput('#' + 'x'.repeat(200)), '');
        assert.equal(irc.channelFromInput('#' + 'é'.repeat(99)), '#' + 'é'.repeat(99));   // 199 bytes
        assert.equal(irc.channelFromInput('#' + 'é'.repeat(100)), '');                     // 201
        assert.equal(irc.channelFromInput('#bad\ud800'), '');
        assert.equal(irc.channelFromInput('#bad\udc00x'), '');
        assert.equal(irc.channelFromInput('#' + '😀'.repeat(49) + 'xyz'), '#' + '😀'.repeat(49) + 'xyz');   // 200
        assert.equal(irc.channelFromInput('#' + '😀'.repeat(50)), '');                                     // 201
    });
});

describe('ircChannels.joinRequest', function () {
    it('is the openChannel payload with the channel key', function () {
        assert.deepEqual(irc.joinRequest(LIBERA, ' #LuneOS '),
            { serviceName: 'type_irc', channel: '#luneos@irc.libera.chat' });
        assert.deepEqual(irc.joinRequest(LIBERA, 'webos'),
            { serviceName: 'type_irc', channel: '#webos@irc.libera.chat' });
    });

    it('lower-cases beyond ASCII, as the service does, and the network too', function () {
        assert.deepEqual(irc.joinRequest({ serviceName: 'type_irc', remoteId: 'IRC.OFTC.net' }, '#Ärger'),
            { serviceName: 'type_irc', channel: '#ärger@irc.oftc.net' });
    });

    it('is null for nothing valid, or a server that is not IRC', function () {
        assert.equal(irc.joinRequest(LIBERA, ''), null);
        assert.equal(irc.joinRequest(LIBERA, 'two words'), null);
        assert.equal(irc.joinRequest({ serviceName: 'type_discord', remoteId: 'g' }, '#x'), null);
    });
});

describe('ircChannels.leaveRequest', function () {
    it('is the leaveChannel payload: the row\'s own key', function () {
        assert.deepEqual(irc.leaveRequest({ _id: 'c1', serviceName: 'type_irc', remoteId: '#webos@irc.libera.chat',
            displayName: '#WebOS' }), { serviceName: 'type_irc', channel: '#webos@irc.libera.chat' });
    });

    it('is null for a channel of another network type', function () {
        assert.equal(irc.leaveRequest({ serviceName: 'type_discord', remoteId: '123' }), null);
    });
});
