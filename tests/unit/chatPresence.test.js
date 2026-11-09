/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/chatPresence.js - typing and reading between a chat and the IM transport. Who is
 * typing to us comes from watchTyping and lapses on its own; our own typing is sent at once, again
 * while it goes on, "paused" when the keys stop and "none" when the text goes; a read chat is
 * reported with markRead. None of it for SMS, and no typing for group chats.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var cp = bootstrap.load('util/chatPresence.js');

var anna = { _id: 't1', replyService: 'type_telegram', replyAddress: 'id1001' };
var me = { username: '+31600000000' };

describe('chatPresence: which chats', function () {
    it('an IM chat with an address; not SMS, not without an address', function () {
        assert.equal(cp.isImChat(anna), true);
        assert.equal(cp.isImChat({ replyService: 'sms', replyAddress: '+31611111111' }), false);
        assert.equal(cp.isImChat({ replyService: 'type_telegram' }), false);
        assert.equal(cp.isImChat(null), false);
    });
    it('a group or a server channel is a group chat', function () {
        assert.equal(cp.isGroupChat(anna), false);
        assert.equal(cp.isGroupChat({ replyService: 'type_discord', replyAddress: '1', channelId: 'c1' }), true);
        assert.equal(cp.isGroupChat({ replyService: 'type_whatsapp', replyAddress: 'g@g.us', groupChatId: 'g' }), true);
    });
});

describe('chatPresence.Typers', function () {
    it('a typer from an event, as the thread knows them', function () {
        var t = new cp.Typers();
        assert.equal(t.apply({ serviceName: 'type_telegram', username: me.username, from: 'id1001', state: 'typing' }, 1000), true);
        assert.equal(t.stateFor(anna, me, 1000), 'typing');
        assert.equal(t.stateFor(anna, { username: 'someone else' }, 1000), null, 'another account of ours');
        assert.equal(t.stateFor(Object.assign({}, anna, { replyService: 'type_whatsapp' }), me, 1000), null,
            'the same name on another service');
    });
    it('paused, then none; the same again is no change', function () {
        var t = new cp.Typers();
        var ev = function (state) { return { serviceName: 'type_telegram', username: me.username, from: 'id1001', state: state }; };
        t.apply(ev('typing'), 0);
        assert.equal(t.apply(ev('typing'), 10), false);
        assert.equal(t.apply(ev('paused'), 20), true);
        assert.equal(t.stateFor(anna, me, 20), 'paused');
        assert.equal(t.apply(ev('none'), 30), true);
        assert.equal(t.stateFor(anna, me, 30), null);
        assert.equal(t.apply(ev('none'), 40), false);
    });
    it('lapses when nothing says it stopped', function () {
        var t = new cp.Typers();
        t.apply({ serviceName: 'type_telegram', username: me.username, from: 'id1001', state: 'typing' }, 1000);
        assert.equal(t.nextLapse(), 1000 + cp.TYPING_LAPSE_MS);
        assert.equal(t.stateFor(anna, me, 1000 + cp.TYPING_LAPSE_MS), 'typing');
        assert.equal(t.stateFor(anna, me, 1001 + cp.TYPING_LAPSE_MS), null);
        assert.equal(t.nextLapse(), null);
    });
    it('a snapshot replaces what was kept', function () {
        var t = new cp.Typers();
        t.apply({ serviceName: 'type_telegram', username: me.username, from: 'id1001', state: 'typing' }, 0);
        assert.equal(t.apply({ typing: [{ serviceName: 'type_telegram', username: me.username, from: 'id2002', state: 'paused' }] }, 5), true);
        assert.equal(t.stateFor(anna, me, 5), null);
        assert.equal(t.stateFor(Object.assign({}, anna, { replyAddress: 'id2002' }), me, 5), 'paused');
    });
    it('ignores what is incomplete, and group chats', function () {
        var t = new cp.Typers();
        assert.equal(t.apply({ serviceName: 'type_telegram', from: 'id1001', state: 'typing' }, 0), false);
        assert.equal(t.apply(null, 0), false);
        t.apply({ serviceName: 'type_discord', username: me.username, from: 'c1', state: 'typing' }, 0);
        assert.equal(t.stateFor({ replyService: 'type_discord', replyAddress: 'c1', channelId: 'c1' }, me, 0), null);
        assert.equal(t.stateFor(anna, null, 0), null);
    });
});

describe('chatPresence.Composer', function () {
    it('typing at once, again only every few seconds while it goes on', function () {
        var c = new cp.Composer();
        assert.equal(c.input('h', 0), 'typing');
        assert.equal(c.input('he', 100), null);
        assert.equal(c.input('hel', cp.TYPING_REPEAT_MS - 1), null);
        assert.equal(c.input('hell', cp.TYPING_REPEAT_MS), 'typing');
    });
    it('paused when the keys stop, typing again when they start', function () {
        var c = new cp.Composer();
        c.input('h', 0);
        assert.equal(c.tick(cp.TYPING_PAUSE_MS - 1), null);
        assert.equal(c.tick(cp.TYPING_PAUSE_MS), 'paused');
        assert.equal(c.tick(cp.TYPING_PAUSE_MS + 10), null, 'paused once');
        assert.equal(c.input('hi', cp.TYPING_PAUSE_MS + 20), 'typing');
    });
    it('none when the text goes or is sent, and only after something was sent', function () {
        var c = new cp.Composer();
        assert.equal(c.stop(), null);
        assert.equal(c.input('', 0), null);
        c.input('h', 0);
        assert.equal(c.input('', 10), 'none');
        assert.equal(c.stop(), null);
        c.input('x', 20);
        c.tick(20 + cp.TYPING_PAUSE_MS);
        assert.equal(c.stop(), 'none', 'after paused too');
    });
});

describe('chatPresence payloads', function () {
    it('sendTyping: our account, the buddy and the state', function () {
        assert.deepEqual(cp.sendTypingPayload(anna, me, 'typing'),
            { serviceName: 'type_telegram', username: me.username, usernameTo: 'id1001', state: 'typing' });
    });
    it('no typing for SMS, a group, no account or no state', function () {
        assert.equal(cp.sendTypingPayload({ replyService: 'sms', replyAddress: '+316' }, me, 'typing'), null);
        assert.equal(cp.sendTypingPayload(Object.assign({ groupChatId: 'g' }, anna), me, 'typing'), null);
        assert.equal(cp.sendTypingPayload(anna, null, 'typing'), null);
        assert.equal(cp.sendTypingPayload(anna, me, ''), null);
    });
    it('markRead: groups too, never SMS', function () {
        assert.deepEqual(cp.markReadPayload(anna, me),
            { serviceName: 'type_telegram', username: me.username, usernameTo: 'id1001' });
        assert.deepEqual(cp.markReadPayload(Object.assign({ groupChatId: 'g' }, anna), me),
            { serviceName: 'type_telegram', username: me.username, usernameTo: 'id1001' });
        assert.equal(cp.markReadPayload({ replyService: 'sms', replyAddress: '+316' }, me), null);
        assert.equal(cp.markReadPayload(anna, {}), null);
    });
});
