/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/chatsThreads.js - the Chats list leaves server channels to the Servers tab, but
 * shows those whose messages the user asked to get while closed, so new ones are seen.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var ct = bootstrap.load('util/chatsThreads.js');

var SERVERS = [
    { _id: 's-lune', name: 'LuneOS' },
    { _id: 's-shown', name: 'raw', displayName: 'Shown name' },
    { name: 'No id' },
    null
];

var CHANNELS = [
    { _id: 'c-followed', background: true, serverId: 's-lune', name: 'general' },
    { _id: 'c-quiet', background: false, serverId: 's-lune', name: 'random' },
    { _id: 'c-old' },
    null,
    { _id: 'c-irc', background: true, name: '#webos' },
    { _id: 'c-other', background: true, serverId: 's-shown', displayName: 'news', name: '123' },
    { _id: 'c-lost', background: true, serverId: 'toString', remoteId: '99' }
];

var THREADS = [
    { _id: 't1', displayName: 'Anna' },
    { _id: 't2', channelId: 'c-quiet' },
    { _id: 't3', channelId: 'c-followed', displayName: 'general', unreadCount: 2 },
    { _id: 't4', displayName: 'Group' },
    { _id: 't5', channelId: 'c-unknown' }
];

function ids(list) { return list.map(function (t) { return t._id; }); }

describe('chatsThreads.channelLabel', function () {
    it('as the Servers tab: a "#" unless the name has one', function () {
        assert.equal(ct.channelLabel({ name: 'general' }), '# general');
        assert.equal(ct.channelLabel({ displayName: 'news', name: '123', remoteId: '9' }), '# news');
        assert.equal(ct.channelLabel({ remoteId: '9' }), '# 9');
        assert.equal(ct.channelLabel({ name: '#webos' }), '#webos');
        assert.equal(ct.channelLabel(null), '# channel');
    });
});

describe('chatsThreads.deliveredChannels', function () {
    it('only channels with background exactly true, named with their server', function () {
        assert.deepEqual(ct.deliveredChannels(CHANNELS, SERVERS), {
            'c-followed': '# general · LuneOS',
            'c-irc': '#webos',
            'c-other': '# news · Shown name',
            'c-lost': '# 99'
        });
        assert.deepEqual(ct.deliveredChannels([{ _id: 'x', background: 'true' }]), {});
        assert.deepEqual(ct.deliveredChannels([{ background: true }]), {});
        assert.deepEqual(ct.deliveredChannels(null, SERVERS), {});
    });

    it('without the servers yet, the channel alone', function () {
        assert.deepEqual(ct.deliveredChannels([CHANNELS[0]], null), { 'c-followed': '# general' });
    });
});

describe('chatsThreads.chatsThreads', function () {
    var delivered = ct.deliveredChannels(CHANNELS, SERVERS);

    it('chats, plus the channels that deliver, in their order', function () {
        assert.deepEqual(ids(ct.chatsThreads(THREADS, delivered)), ['t1', 't3', 't4']);
    });

    it('a delivered channel comes as a copy with its Chats name; the rest as they are', function () {
        var out = ct.chatsThreads(THREADS, delivered);
        assert.equal(out[0], THREADS[0]);
        assert.equal(out[0].channelLabel, undefined);
        assert.notEqual(out[1], THREADS[2]);
        assert.deepEqual(out[1], { _id: 't3', channelId: 'c-followed', displayName: 'general', unreadCount: 2,
            channelLabel: '# general · LuneOS' });
        assert.equal('channelLabel' in THREADS[2], false);
    });

    it('no channel threads before the channels are known', function () {
        assert.deepEqual(ids(ct.chatsThreads(THREADS, {})), ['t1', 't4']);
        assert.deepEqual(ids(ct.chatsThreads(THREADS, null)), ['t1', 't4']);
    });

    it('a channel id named like an Object property is not taken as delivered', function () {
        assert.deepEqual(ids(ct.chatsThreads([{ _id: 'p', channelId: 'toString' }], {})), []);
    });

    it('nothing in, nothing out', function () {
        assert.deepEqual(ct.chatsThreads(null, {}), []);
        assert.deepEqual(ct.chatsThreads([], { a: '# a' }), []);
    });
});

describe('chatsThreads: Discord group DMs', function () {
    var servers = [
        { _id: 's-dm', name: 'Discord', serviceName: 'type_discord' },
        { _id: 's-guild', name: 'Discord', serviceName: 'type_irc' },
        { _id: 's-other', name: 'LuneOS', serviceName: 'type_discord' }
    ];
    var channels = [
        { _id: 'c-dm', serverId: 's-dm', name: 'Weekend', background: false },
        { _id: 'c-dm2', serverId: 's-dm', displayName: 'Shown', name: 'raw' },
        { _id: 'c-dm3', serverId: 's-dm' },
        { _id: 'c-irc', serverId: 's-guild', name: 'Discord-ish', background: false },
        { _id: 'c-guild', serverId: 's-other', name: 'general', background: false }
    ];

    it('every group DM is a chat, named as itself; no other quiet channel is', function () {
        assert.deepEqual(ct.deliveredChannels(channels, servers), {
            'c-dm': 'Weekend', 'c-dm2': 'Shown', 'c-dm3': 'Group'
        });
    });

    it('so a new group DM shows among the chats', function () {
        var delivered = ct.deliveredChannels(channels, servers);
        var out = ct.chatsThreads([{ _id: 't-dm', channelId: 'c-dm' }, { _id: 't-g', channelId: 'c-guild' }], delivered);
        assert.deepEqual(out.map(function (t) { return [t._id, t.channelLabel]; }), [['t-dm', 'Weekend']]);
    });
});

describe('chatsThreads: Telegram groups and channels', function () {
    var servers = [
        { _id: 's-tg', name: 'Telegram (tdlib)', serviceName: 'type_telegram' },
        { _id: 's-dc', name: 'LuneOS', serviceName: 'type_discord' }
    ];
    var channels = [
        { _id: 'c-tg', serverId: 's-tg', name: 'chat-1234567890', displayName: 'Family', background: false },
        { _id: 'c-tg2', serverId: 's-tg', name: 'chat-42' },
        { _id: 'c-dc', serverId: 's-dc', name: 'general', background: false }
    ];

    it('every Telegram chat is among the chats, named as itself, whatever its server is called', function () {
        assert.deepEqual(ct.deliveredChannels(channels, servers), { 'c-tg': 'Family', 'c-tg2': 'chat-42' });
    });
});

describe('chatsThreads: a renamed group', function () {
    var servers = [
        { _id: 's-tg', name: 'Telegram (tdlib)', serviceName: 'type_telegram' },
        { _id: 's-dc', name: 'LuneOS', serviceName: 'type_discord' }
    ];
    var channels = [
        { _id: 'c-tg', serverId: 's-tg', name: 'chat-1', displayName: 'Old name' },
        { _id: 'c-tg2', serverId: 's-tg', name: 'chat-2', displayName: 'Only the channel' },
        { _id: 'c-dc', serverId: 's-dc', name: 'general', background: true }
    ];
    var delivered = ct.deliveredChannels(channels, servers);
    var chats = ct.chatChannels(channels, servers);

    it('knows which channels are chats', function () {
        assert.deepEqual(chats, { 'c-tg': true, 'c-tg2': true });
    });

    it('names a group as its thread is named, which follows a rename; a server channel keeps its label', function () {
        var out = ct.chatsThreads([
            { _id: 't1', channelId: 'c-tg', displayName: 'New name' },
            { _id: 't2', channelId: 'c-tg2' },
            { _id: 't3', channelId: 'c-dc', displayName: 'general' }
        ], delivered, chats);
        assert.deepEqual(out.map(function (t) { return t.channelLabel; }), ['New name', 'Only the channel', '# general · LuneOS']);
    });
});
