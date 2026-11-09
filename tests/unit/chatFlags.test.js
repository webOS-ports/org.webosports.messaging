/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/chatFlags.js - pinning, muting, marking unread and archiving a chat from the Chats
 * list. Each is a flag on the chatthread; the list orders and filters by them, the hold menu
 * offers what is not set, and a change is one merge.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var cf = bootstrap.load('util/chatFlags.js');

function chat(id, flags, unread) {
    return { _id: id, flags: flags || {}, unreadCount: unread || 0 };
}
function ids(list) { return list.map(function (t) { return t._id; }); }

describe('chatFlags: reading the flags', function () {
    it('only a flag set to true counts', function () {
        assert.equal(cf.isPinned(chat('a', { pinned: true })), true);
        assert.equal(cf.isPinned(chat('a', { pinned: 'yes' })), false);
        assert.equal(cf.isMuted(chat('a', { muted: true })), true);
        assert.equal(cf.isArchived(chat('a', { archived: true })), true);
        assert.equal(cf.isMarkedUnread(chat('a', { markedUnread: true })), true);
        assert.equal(cf.isLeft(chat('a', { left: true })), true);
        assert.equal(cf.isLeft(chat('a', { left: 'yes' })), false);
        assert.equal(cf.isLeft(chat('a')), false);
        assert.equal(cf.isMuted({ _id: 'a' }), false);
        assert.equal(cf.isPinned(null), false);
    });
    it('unread: unread messages, or marked so; marked counts once in the tab', function () {
        assert.equal(cf.isUnread(chat('a', {}, 3)), true);
        assert.equal(cf.isUnread(chat('a', { markedUnread: true })), true);
        assert.equal(cf.isUnread(chat('a')), false);
        assert.equal(cf.isUnread(null), false);
        assert.equal(cf.unreadWeight(chat('a', {}, 3)), 3);
        assert.equal(cf.unreadWeight(chat('a', { markedUnread: true }, 3)), 3);
        assert.equal(cf.unreadWeight(chat('a', { markedUnread: true })), 1);
        assert.equal(cf.unreadWeight(chat('a')), 0);
        assert.equal(cf.unreadWeight(null), 0);
    });
});

describe('chatFlags.arrange', function () {
    var list = [
        chat('new'), chat('pin-new', { pinned: true }), chat('arch', { archived: true }, 2),
        chat('mid'), chat('pin-old', { pinned: true }), chat('arch-read', { archived: true, pinned: true })
    ];
    it('pinned first, each part newest first as it came; archived left out and counted', function () {
        var r = cf.arrange(list, false);
        assert.deepEqual(ids(r.list), ['pin-new', 'pin-old', 'new', 'mid']);
        assert.equal(r.archivedCount, 2);
        assert.equal(r.archivedUnread, 1);
    });
    it('the archive: only archived chats, newest first, no pinned part', function () {
        var r = cf.arrange(list, true);
        assert.deepEqual(ids(r.list), ['arch', 'arch-read']);
        assert.equal(r.archivedCount, 2);
    });
    it('nothing for nothing', function () {
        assert.deepEqual(cf.arrange(null, false), { list: [], archivedCount: 0, archivedUnread: 0 });
    });
});

describe('chatFlags.dividerCaption', function () {
    it('"Pinned" over a pinned chat in the list; the date in the archive or unpinned', function () {
        assert.equal(cf.dividerCaption(chat('a', { pinned: true }), false, 'Today'), 'Pinned');
        assert.equal(cf.dividerCaption(chat('a', { pinned: true }), true, 'Today'), 'Today');
        assert.equal(cf.dividerCaption(chat('a'), false, 'Today'), 'Today');
    });
});

describe('chatFlags.actions', function () {
    function labels(t) { return cf.actions(t).map(function (a) { return a.label; }); }
    it('offers what is not set, and to undo what is', function () {
        assert.deepEqual(labels(chat('a')), ['Pin to Top', 'Mute Notifications', 'Mark as Unread', 'Archive']);
        assert.deepEqual(labels(chat('a', { pinned: true, muted: true, markedUnread: true })),
            ['Unpin', 'Unmute', 'Mark as Read', 'Archive']);
        assert.deepEqual(labels(chat('a', {}, 4)), ['Pin to Top', 'Mute Notifications', 'Mark as Read', 'Archive']);
    });
    it('no pinning in the archive', function () {
        assert.deepEqual(labels(chat('a', { archived: true })), ['Mute Notifications', 'Mark as Unread', 'Unarchive']);
    });
    it('each choice carries its change', function () {
        assert.deepEqual(cf.actions(chat('a')).map(function (x) { return x.change; }),
            [{ pinned: true }, { muted: true }, { markedUnread: true }, { archived: true }]);
        assert.deepEqual(cf.actions(chat('a', { pinned: true, muted: true, archived: false }, 1))
            .map(function (x) { return x.change; }),
            [{ pinned: false }, { muted: false }, { read: true }, { archived: true }]);
        assert.deepEqual(cf.actions(chat('a', { archived: true })).pop().change, { archived: false });
    });
    it('nothing for a record with no _id', function () {
        assert.deepEqual(cf.actions({}), []);
        assert.deepEqual(cf.actions(null), []);
    });
});

describe('chatFlags.merge', function () {
    it('one flag, on the chat', function () {
        assert.deepEqual(cf.merge(chat('a'), { pinned: true }), { _id: 'a', flags: { pinned: true } });
        assert.deepEqual(cf.merge(chat('a'), { muted: false }), { _id: 'a', flags: { muted: false } });
        assert.deepEqual(cf.merge(chat('a'), { markedUnread: true }), { _id: 'a', flags: { markedUnread: true } });
        assert.deepEqual(cf.merge(chat('a'), { left: true }), { _id: 'a', flags: { left: true } });
    });
    it('leaving a group is not offered on a hold', function () {
        var labels = cf.actions(chat('a')).map(function (a) { return a.change; })
            .filter(function (c) { return c && 'left' in c; });
        assert.deepEqual(labels, []);
    });
    it('archiving unpins; unarchiving leaves pinned alone', function () {
        assert.deepEqual(cf.merge(chat('a'), { archived: true }), { _id: 'a', flags: { archived: true, pinned: false } });
        assert.deepEqual(cf.merge(chat('a'), { archived: false }), { _id: 'a', flags: { archived: false } });
    });
    it('read clears the count and the mark', function () {
        assert.deepEqual(cf.merge(chat('a', {}, 3), { read: true }),
            { _id: 'a', flags: { markedUnread: false }, unreadCount: 0 });
    });
    it('null for nothing to change, or no chat', function () {
        assert.equal(cf.merge(chat('a'), {}), null);
        assert.equal(cf.merge(chat('a'), { pinned: 'yes' }), null);
        assert.equal(cf.merge(chat('a'), null), null);
        assert.equal(cf.merge({}, { pinned: true }), null);
        assert.equal(cf.merge(null, { pinned: true }), null);
    });
});

describe('chatFlags.mutedIds', function () {
    it('the muted chats, as a lookup', function () {
        assert.deepEqual(cf.mutedIds([chat('a', { muted: true }), chat('b'), { flags: { muted: true } }]), { a: true });
        assert.deepEqual(cf.mutedIds(null), {});
    });
});
