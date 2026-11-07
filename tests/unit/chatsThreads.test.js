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
