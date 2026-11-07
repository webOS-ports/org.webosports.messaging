/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/chatActions.js - what can be done to a chat or a message besides sending to it, and
 * the imcommands that do it: their shape is the one imlibpurpleservice's SendOneCommandHandler
 * reads (fromUsername, targetUsername, params), the members and poll options "\x1f"-joined.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var ca = bootstrap.load('util/chatActions.js');

var KIND = 'com.palm.imcommand.whatsapp:1';
var me = { username: '+15555550100' };
var GROUP = '120363041234567890@g.us';
var NOW = 1800000000000;

function sent(extra) {
    var m = {
        _id: 'm1', folder: 'outbox', status: 'successful', serviceName: 'type_whatsapp',
        serviceMessageId: '3EB0AA', messageText: 'See you at six', timestamp: NOW - 60000
    };
    for (var k in extra || {}) { m[k] = extra[k]; }
    return m;
}

describe('chatActions: what a service does', function () {
    it('WhatsApp edits for 20 minutes, deletes, makes groups and mentions; Signal has no groups', function () {
        var wa = ca.actionsFor('type_whatsapp');
        assert.equal(wa.editWindowMs, 20 * 60 * 1000);
        assert.equal(wa.groupCreate && wa.groupInvite && wa.groupLeave && wa.mentions, true);
        var sig = ca.actionsFor('type_signal');
        assert.equal(sig.edit && sig.deleteForEveryone && sig.mentions && sig.contact, true);
        assert.equal(!!sig.groupCreate, false);
        assert.equal(!!sig.location, false, 'Signal has no location message: it goes as text');
        var tg = ca.actionsFor('type_telegram');
        assert.equal(tg.edit && tg.deleteForEveryone && tg.groupCreate && tg.groupInvite && tg.groupLeave &&
            tg.mentions && tg.location && tg.contact, true);
        assert.equal(tg.editWindowMs, undefined, 'no window we know of');
        var dc = ca.actionsFor('type_discord');
        assert.equal(dc.edit && dc.deleteForEveryone && dc.groupCreate && dc.groupInvite && dc.groupLeave && dc.mentions, true);
        assert.equal(!!(dc.location || dc.contact || dc.editWindowMs), false);
    });
    it('nothing for a service not listed, and a template says otherwise', function () {
        assert.deepEqual(ca.actionsFor('type_irc'), {});
        assert.deepEqual(ca.actionsFor('sms'), {});
        var accounts = { getChatActions: function (s) { return s === 'type_irc' ? { mentions: true } : null; } };
        assert.deepEqual(ca.actionsFor('type_irc', accounts), { mentions: true });
        assert.equal(ca.actionsFor('type_whatsapp', accounts).edit, true, 'no template entry: the table');
    });
});

describe('chatActions: groups', function () {
    it('a WhatsApp group by its JID or the thread mark; not a 1:1 chat or a server channel', function () {
        assert.equal(ca.isGroupThread({ replyAddress: GROUP }), true);
        assert.equal(ca.isGroupThread({ replyAddress: 'x', groupChatId: 'g' }), true);
        assert.equal(ca.isGroupThread({ replyAddress: '46701234567@s.whatsapp.net' }), false);
        assert.equal(ca.isGroupThread({ replyAddress: 'c', channelId: 'c1', groupChatId: 'g' }), false);
        assert.equal(ca.isGroupThread({ replyAddress: GROUP, channelId: 'c2' }), true,
            'a WhatsApp group the threader linked to an imchannel is still one');
        assert.equal(ca.isGroupThread(null), false);
    });
});

describe('chatActions: edit and delete for everyone', function () {
    var wa = ca.actionsFor('type_whatsapp');
    it('our own sent message, inside the window', function () {
        assert.equal(ca.canEdit(sent(), wa, NOW), true);
        assert.equal(ca.canEdit(sent({ timestamp: NOW - 20 * 60 * 1000 }), wa, NOW), true, 'at the edge');
        assert.equal(ca.canEdit(sent({ timestamp: NOW - 20 * 60 * 1000 - 1 }), wa, NOW), false);
        assert.equal(ca.canEdit(sent({ timestamp: undefined, localTimestamp: NOW - 1000 }), wa, NOW), true);
    });
    it('not someone else\'s, not one still going or failed, not one without an id, not a deleted one', function () {
        assert.equal(ca.canEdit(sent({ folder: 'inbox' }), wa, NOW), false);
        assert.equal(ca.canEdit(sent({ status: 'pending' }), wa, NOW), false);
        assert.equal(ca.canEdit(sent({ status: 'failed' }), wa, NOW), false);
        assert.equal(ca.canEdit(sent({ serviceMessageId: '' }), wa, NOW), false);
        assert.equal(ca.canEdit(sent({ deleted: true }), wa, NOW), false);
        assert.equal(ca.canDeleteForEveryone(sent({ deleted: true }), wa, NOW), false);
        assert.equal(ca.canDeleteForEveryone(sent({ folder: 'inbox' }), wa, NOW), false);
    });
    it('only the text of a message is edited; a file is not', function () {
        assert.equal(ca.canEdit(sent({ filePath: '/media/internal/a.jpg' }), wa, NOW), false);
        assert.equal(ca.canEdit(sent({ messageText: 'file:///media/internal/a.opus' }), wa, NOW), false);
        assert.equal(ca.canEdit(sent({ messageText: '<img src="x.jpg">' }), wa, NOW), false);
        assert.equal(ca.canDeleteForEveryone(sent({ filePath: '/media/internal/a.jpg' }), wa, NOW), true);
    });
    it('no window where the service has none we know; nothing where it cannot', function () {
        var sig = ca.actionsFor('type_signal');
        assert.equal(ca.canEdit(sent({ serviceName: 'type_signal', timestamp: NOW - 864e5 }), sig, NOW), true);
        assert.equal(ca.canDeleteForEveryone(sent({ timestamp: NOW - 864e5 * 30 }), wa, NOW), true);
        assert.equal(ca.canEdit(sent(), {}, NOW), false);
        assert.equal(ca.canDeleteForEveryone(sent(), {}, NOW), false);
        assert.equal(ca.canDeleteForEveryone(sent({ timestamp: NOW - 11 }), { deleteForEveryone: true, deleteWindowMs: 10 }, NOW), false);
        assert.equal(ca.canEdit(sent(), null, NOW), false);
    });
});

describe('chatActions: the chat a message is in', function () {
    var family = { replyService: 'type_whatsapp', replyAddress: GROUP };
    it('a group\'s or channel\'s message: the thread\'s address', function () {
        assert.equal(ca.chatOf({ serviceName: 'type_whatsapp', folder: 'inbox', chatType: 'groupchat', from: { addr: '+1501' } }, family), GROUP);
        assert.equal(ca.chatOf(sent(), family), GROUP, 'ours in a group');
        var channel = { replyService: 'type_discord', replyAddress: '#general', channelId: 'c1' };
        assert.equal(ca.chatOf({ serviceName: 'type_discord', folder: 'inbox', from: { addr: 'bob' } }, channel), '#general');
        assert.equal(ca.chatOf({ serviceName: 'type_telegram', chatType: 'groupchat' }, family), '',
            'the thread is on another service: no address for this one');
    });
    it('a 1:1 message: who it went to, or who it came from, on its own service', function () {
        var marta = { replyService: 'type_telegram', replyAddress: 'id1001' };
        assert.equal(ca.chatOf(sent({ to: [{ addr: '46701234567@s.whatsapp.net' }] }), marta), '46701234567@s.whatsapp.net');
        assert.equal(ca.chatOf({ serviceName: 'type_whatsapp', folder: 'inbox', from: { addr: '+4670' } }, marta), '+4670');
        assert.equal(ca.chatOf(sent(), marta), '');
        assert.equal(ca.chatOf(null, marta), '');
    });
    it('no chat, no command', function () {
        assert.equal(ca.editCommand(KIND, me, '', sent(), 'x'), null);
        assert.equal(ca.deleteCommand(KIND, me, '', sent()), null);
        assert.equal(ca.reactionCommand(KIND, me, '', sent(), 'X'), null);
        assert.equal(ca.pollVoteCommand(KIND, me, '', sent(), []), null);
    });
});

describe('chatActions: the commands, as the transport reads them', function () {
    it('an edit', function () {
        assert.deepEqual(ca.editCommand(KIND, me, GROUP, sent(), 'See you at seven'), {
            _kind: KIND, command: 'editMessage', handler: 'transport', serviceName: 'type_whatsapp',
            fromUsername: '+15555550100', targetUsername: GROUP,
            params: { targetServiceMessageId: '3EB0AA', text: 'See you at seven' }
        });
        assert.equal(ca.editCommand(KIND, me, GROUP, sent(), '  '), null, 'no text is no edit');
        assert.equal(ca.editCommand(KIND, me, GROUP, sent({ serviceMessageId: '' }), 'x'), null);
    });
    it('a delete', function () {
        var c = ca.deleteCommand(KIND, me, GROUP, sent());
        assert.equal(c.command, 'deleteMessage');
        assert.deepEqual(c.params, { targetServiceMessageId: '3EB0AA' });
    });
    it('none without our account or the kind', function () {
        assert.equal(ca.deleteCommand(KIND, null, GROUP, sent()), null);
        assert.equal(ca.deleteCommand(KIND, { username: '' }, GROUP, sent()), null);
        assert.equal(ca.deleteCommand('', me, GROUP, sent()), null);
    });
    it('a reaction names the message, its sender, and whether it is taken off', function () {
        var theirs = { serviceName: 'type_whatsapp', folder: 'inbox', serviceMessageId: '3EB0C4F1A2', from: { addr: '+46701234567' } };
        assert.deepEqual(ca.reactionCommand(KIND, me, GROUP, theirs, 'X', false).params,
            { targetServiceMessageId: '3EB0C4F1A2', emoji: 'X', remove: false, targetSender: '+46701234567' });
        var mine = ca.reactionCommand(KIND, me, GROUP, sent({ from: { addr: me.username } }), 'X', true);
        assert.equal(mine.params.targetSender, '', 'our own message: no sender');
        assert.equal(mine.params.remove, true);
        assert.equal(mine.fromUsername, me.username);
        assert.equal(mine.targetUsername, GROUP);
        assert.equal(ca.reactionCommand(KIND, me, GROUP, sent({ serviceMessageId: undefined }), 'X'), null);
    });
    it('a poll vote is every option ticked, "\\x1f"-joined; none clears it', function () {
        var poll = { serviceName: 'type_whatsapp', folder: 'inbox', serviceMessageId: 'P1', from: { addr: '+1501' } };
        assert.deepEqual(ca.pollVoteCommand(KIND, me, GROUP, poll, ['Sat', 'Sun']).params,
            { pollMessageId: 'P1', optionNames: 'Sat\x1fSun', senderJid: '+1501' });
        assert.equal(ca.pollVoteCommand(KIND, me, GROUP, poll, []).params.optionNames, '');
    });
    it('a group is made with a name and the members\' addresses, each once', function () {
        var c = ca.createGroupCommand(KIND, 'type_whatsapp', me, ' Climbing ',
            ['46701234567@s.whatsapp.net', '', '46701234567@s.whatsapp.net', '1501@s.whatsapp.net']);
        assert.equal(c.command, 'createGroup');
        assert.equal(c.targetUsername, '', 'no chat yet');
        assert.deepEqual(c.params, { name: 'Climbing', members: '46701234567@s.whatsapp.net\x1f1501@s.whatsapp.net' });
        assert.equal(ca.createGroupCommand(KIND, 'type_whatsapp', me, '', ['a']), null, 'no name');
        assert.equal(ca.createGroupCommand(KIND, 'type_whatsapp', me, 'x', []), null, 'nobody in it');
        assert.equal(ca.createGroupCommand(KIND, 'type_whatsapp', me, 'a\x1fb', ['c\x1fd']).params.members, 'cd',
            'a separator in a name cannot split the list');
    });
    it('who can be put in a group: an address on the service, or for WhatsApp a full number', function () {
        assert.equal(ca.memberAddress({ value: '1501@s.whatsapp.net', type: 'type_whatsapp' }, 'type_whatsapp'), '1501@s.whatsapp.net');
        assert.equal(ca.memberAddress({ value: 'anna', type: 'type_telegram' }, 'type_whatsapp'), null, 'another service');
        assert.equal(ca.memberAddress({ value: '+31 (6) 11-11.11/11', isPhone: true }, 'type_whatsapp'), '+31611111111');
        assert.equal(ca.memberAddress({ value: '0031 6 1111 1111', isPhone: true }, 'type_whatsapp'), '+31611111111');
        assert.equal(ca.memberAddress({ value: '06 1111 1111', isPhone: true }, 'type_whatsapp'), null, 'no country code');
        assert.equal(ca.memberAddress({ value: '+123', isPhone: true }, 'type_whatsapp'), null, 'too short');
        assert.equal(ca.memberAddress({ value: '+31611111111', isPhone: true }, 'type_signal'), null, 'only WhatsApp by number');
        assert.equal(ca.memberAddress({ value: '', type: 'type_whatsapp' }, 'type_whatsapp'), null);
        assert.equal(ca.memberAddress(null, 'type_whatsapp'), null);
    });
    it('people are added to a group, and it is left', function () {
        var add = ca.inviteCommand(KIND, 'type_whatsapp', me, GROUP, ['1501@s.whatsapp.net']);
        assert.equal(add.command, 'inviteToGroup');
        assert.equal(add.targetUsername, GROUP);
        assert.equal(add.params.members, '1501@s.whatsapp.net');
        assert.equal(ca.inviteCommand(KIND, 'type_whatsapp', me, GROUP, []), null);
        var leave = ca.leaveCommand(KIND, 'type_whatsapp', me, GROUP);
        assert.equal(leave.command, 'leaveGroup');
        assert.deepEqual(leave.params, {});
        assert.equal(ca.leaveCommand(KIND, 'type_whatsapp', me, ''), null);
    });
});

describe('chatActions: a location', function () {
    it('on the earth, to seven places, with a name of one line', function () {
        assert.deepEqual(ca.location(52.37310004, 4.89250001, ' Dam\nsquare '), { latitude: 52.3731, longitude: 4.8925, name: 'Dam square' });
        assert.deepEqual(ca.location(-90, 180), { latitude: -90, longitude: 180 });
        assert.deepEqual(ca.location('0', '0'), { latitude: 0, longitude: 0 }, 'a number as text');
    });
    it('none off the earth or without a position', function () {
        [[91, 0], [0, -180.0001], [NaN, 0], [0, Infinity], [null, 1], [1, undefined], ['a', 1]].forEach(function (p) {
            assert.equal(ca.location(p[0], p[1]), null, JSON.stringify(p));
        });
    });
    it('goes as a name and a link, with no emoji', function () {
        assert.equal(ca.locationText({ latitude: 52.3731, longitude: 4.8925, name: 'Dam' }),
            'Dam\nhttps://maps.google.com/?q=52.3731,4.8925');
        var t = ca.locationText({ latitude: -33.8, longitude: 151.2 });
        assert.equal(t, 'My location\nhttps://maps.google.com/?q=-33.8,151.2');
        assert.equal(/[\uD800-\uDFFF]/.test(t), false, 'nothing above the BMP, which db8 mangles');
    });
});

describe('chatActions: a contact card', function () {
    var anna = { name: 'Anna Kowalski', phoneNumbers: [{ value: '+31611111111' }, { value: '+31611111111' }, { value: '' }], emails: [{ value: 'anna@x.nl' }] };
    it('a vCard 3.0 with the name and each number and address once', function () {
        assert.equal(ca.contactCard(anna).vcard,
            'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Anna Kowalski\r\nN:;Anna Kowalski;;;\r\n' +
            'TEL;TYPE=CELL:+31611111111\r\nEMAIL:anna@x.nl\r\nEND:VCARD\r\n');
    });
    it('what a vCard value cannot hold is escaped', function () {
        var card = ca.contactCard({ name: 'Smith, John; Jr\\', phoneNumbers: ['+1 555'] }).vcard;
        assert.match(card, /\r\nFN:Smith\\, John\\; Jr\\\\\r\n/);
        assert.match(card, /\r\nTEL;TYPE=CELL:\+1 555\r\n/, 'plain strings as numbers too');
    });
    it('none without a name, or without a way to reach them', function () {
        assert.equal(ca.contactCard({ name: '', phoneNumbers: [{ value: '1' }] }), null);
        assert.equal(ca.contactCard({ name: 'Anna' }), null);
        assert.equal(ca.contactCard(null), null);
    });
    it('goes as the name and the numbers, a line each', function () {
        assert.equal(ca.contactText(anna), 'Anna Kowalski\n+31611111111\nanna@x.nl');
    });
});

describe('chatActions: mentions', function () {
    var members = [{ id: '+1501', name: 'Mum' }, { id: '+4670', name: 'Marta Lindqvist' }, { id: '+31', name: 'Ben' }];
    it('the mention being typed: an "@" at the start or after a space, up to the caret', function () {
        assert.deepEqual(ca.mentionQuery('@', 1), { start: 0, query: '' });
        assert.deepEqual(ca.mentionQuery('hi @Ma', 6), { start: 3, query: 'Ma' });
        assert.deepEqual(ca.mentionQuery('hi @Ma there', 6), { start: 3, query: 'Ma' }, 'the caret, not the end');
        assert.equal(ca.mentionQuery('mail anna@x', 11), null, 'an address is no mention');
        assert.equal(ca.mentionQuery('@Ma rest', 8), null, 'a space after it ends it');
        assert.equal(ca.mentionQuery('no at', 5), null);
        assert.deepEqual(ca.mentionQuery('a\n@B'), { start: 2, query: 'B' }, 'no caret: the end');
    });
    it('who it may be: a name or a word of it that starts so, any case', function () {
        assert.deepEqual(ca.mentionCandidates(members, 'm').map(function (m) { return m.name; }), ['Mum', 'Marta Lindqvist']);
        assert.deepEqual(ca.mentionCandidates(members, 'lind').map(function (m) { return m.name; }), ['Marta Lindqvist']);
        assert.equal(ca.mentionCandidates(members, '').length, 3);
        assert.equal(ca.mentionCandidates(members, '', 2).length, 2);
        assert.equal(ca.mentionCandidates(members, 'um').length, 0, 'not the middle of a word');
    });
    it('picking one writes "@Name " in place of what was typed', function () {
        var r = ca.insertMention('hi @Ma, bring it', 6, { start: 3, query: 'Ma' }, members[1]);
        assert.deepEqual(r, { text: 'hi @Marta Lindqvist , bring it', caret: 20 });
    });
    it('the people of a group are its senders, once each, by name; not us', function () {
        var msgs = [
            { folder: 'inbox', from: { addr: '+1501', name: 'Mom' } },
            { folder: 'inbox', from: { addr: '+4670', name: 'Marta Lindqvist' } },
            { folder: 'outbox', from: { addr: '+15555550100', name: 'Me' } },
            { folder: 'inbox', from: { addr: '+1501', name: 'Mum' } },
            { folder: 'inbox', from: { addr: '+99' } },
            { folder: 'inbox' }
        ];
        assert.deepEqual(ca.groupMembers(msgs), [{ id: '+4670', name: 'Marta Lindqvist' }, { id: '+1501', name: 'Mum' }]);
    });
    it('a message mentions those picked whose "@Name" it still has, each once', function () {
        var picked = [members[0], members[1], members[0], members[2], { id: '', name: 'X' }];
        assert.deepEqual(ca.mentionsInText('@Mum and @Marta Lindqvist, and @Mum.', picked),
            [{ id: '+1501', name: 'Mum' }, { id: '+4670', name: 'Marta Lindqvist' }]);
        assert.deepEqual(ca.mentionsInText('@Mummy and @Ben', picked), [{ id: '+31', name: 'Ben' }],
            '"@Mummy" is not Mum');
        assert.deepEqual(ca.mentionsInText('@Mumé @Mum’s', [members[0]]), [{ id: '+1501', name: 'Mum' }],
            'a letter goes on with the name, punctuation does not');
        assert.deepEqual(ca.mentionsInText('no one', picked), []);
    });
});
