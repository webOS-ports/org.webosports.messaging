/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/channelOptions.js - muting Discord servers and channels and choosing which deliver
 * while closed. The payloads are held to what imlibpurpleservice's setChannelOptions takes: a
 * server by its imserver remoteId, a channel by its imchannel remoteId, and only the option that
 * changes, so the other one is left as it is.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var options = bootstrap.load('util/channelOptions.js');

// imserver and imchannel rows the way imlibpurpleservice writes them for a Discord account.
var GUILD = { _id: 's1', serviceName: 'type_discord', remoteId: 'LuneOS', name: 'LuneOS', muted: false, background: false };
var GENERAL = { _id: 'c1', serviceName: 'type_discord', remoteId: '1100000000000000001', serverId: 's1', name: 'general', muted: false, background: false };

function withFlags(record, flags) {
    return Object.assign({}, record, flags);
}

function labels(list) {
    return list.map(function (a) { return a.label; });
}

describe('channelOptions.supports', function () {
    it('Discord rows with a remote id only', function () {
        assert.equal(options.supports(GUILD), true);
        assert.equal(options.supports(GENERAL), true);
        assert.equal(options.supports({ serviceName: 'type_irc', remoteId: '#webos@irc.libera.chat' }), false);
        assert.equal(options.supports({ serviceName: 'type_discord', remoteId: '' }), false);
        assert.equal(options.supports({ serviceName: 'type_discord' }), false);
        assert.equal(options.supports(null), false);
        assert.equal(options.supports({ serviceName: 'hasOwnProperty', remoteId: 'x' }), false);
    });
});

describe('channelOptions.request', function () {
    it('names a server by its name and a channel by its id', function () {
        assert.deepEqual(options.request(GUILD, true, { muted: true }),
            { serviceName: 'type_discord', server: 'LuneOS', muted: true });
        assert.deepEqual(options.request(GENERAL, false, { background: true }),
            { serviceName: 'type_discord', channel: '1100000000000000001', background: true });
    });

    it('sends only the options that change, false included', function () {
        assert.deepEqual(options.request(GENERAL, false, { muted: false }),
            { serviceName: 'type_discord', channel: '1100000000000000001', muted: false });
        assert.deepEqual(options.request(GUILD, true, { muted: false, background: true }),
            { serviceName: 'type_discord', server: 'LuneOS', muted: false, background: true });
        assert.equal('background' in options.request(GUILD, true, { muted: true }), false);
    });

    it('nothing for no change, a non-boolean, or a row that cannot take it', function () {
        assert.equal(options.request(GUILD, true, {}), null);
        assert.equal(options.request(GUILD, true, null), null);
        assert.equal(options.request(GUILD, true, { muted: 'yes' }), null);
        assert.equal(options.request({ serviceName: 'type_irc', remoteId: '#a@b' }, false, { muted: true }), null);
    });
});

describe('channelOptions.actions', function () {
    it('offers the opposite of what a server is', function () {
        assert.deepEqual(labels(options.actions(GUILD, true)), ['Mute server', "Get all channels' messages"]);
        var both = options.actions(withFlags(GUILD, { muted: true, background: true }), true);
        assert.deepEqual(labels(both), ['Unmute server', 'Only when open']);
        assert.deepEqual(both[0].change, { muted: false });
        assert.deepEqual(both[1].change, { background: false });
    });

    it('offers the opposite of what a channel is', function () {
        var plain = options.actions(GENERAL, false, GUILD);
        assert.deepEqual(labels(plain), ['Mute channel', 'Get messages while closed']);
        assert.deepEqual(plain[0].change, { muted: true });
        assert.deepEqual(plain[1].change, { background: true });
        assert.deepEqual(labels(options.actions(withFlags(GENERAL, { muted: true }), false, GUILD)),
            ['Unmute channel', 'Get messages while closed']);
    });

    it('no unmute for a channel muted with its server: it would change nothing', function () {
        var mutedGuild = withFlags(GUILD, { muted: true });
        assert.deepEqual(labels(options.actions(withFlags(GENERAL, { muted: true }), false, mutedGuild)),
            ['Get messages while closed']);
    });

    it('nothing on rows of other services', function () {
        assert.deepEqual(options.actions({ serviceName: 'type_irc', remoteId: '#a@b' }, false), []);
    });
});

describe('channelOptions.summary', function () {
    it('says what is set, and nothing when nothing is', function () {
        assert.equal(options.summary(GUILD, true), '');
        assert.equal(options.summary(withFlags(GUILD, { muted: true, background: true }), true),
            'Muted · All channels arrive');
        assert.equal(options.summary(withFlags(GENERAL, { background: true }), false, GUILD), 'Arrives while closed');
        assert.equal(options.summary(withFlags(GENERAL, { muted: true }), false, GUILD), 'Muted');
        assert.equal(options.summary(withFlags(GENERAL, { muted: true }), false, withFlags(GUILD, { muted: true })),
            'Muted with the server');
        assert.equal(options.summary({ serviceName: 'type_irc', remoteId: '#a@b', muted: true }, false), '');
    });
});
