/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/groupInfo.js - Group Info: the transport's getChatMembers request and reply
 * (imlibpurpleservice ChatMembers.h), the fall back to who has written, and what a tap on a member
 * opens.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var gi = bootstrap.load('util/groupInfo.js');

var me = { username: '+15555550100' };
var GROUP = '120363041234567890@g.us';
var waGroup = { _id: 't1', replyAddress: GROUP, replyService: 'type_whatsapp' };

describe('groupInfo.isGroupChat', function () {
    it('is a WhatsApp group, a group the threads mark, or a channel\'s chat', function () {
        assert.equal(gi.isGroupChat(waGroup), true);
        assert.equal(gi.isGroupChat({ replyAddress: 'x', groupChatId: 'g1' }), true);
        assert.equal(gi.isGroupChat({ replyAddress: 'chat-100', channelId: 'c1' }), true);
    });
    it('is not a 1:1 chat or nothing', function () {
        assert.equal(gi.isGroupChat({ replyAddress: '+31611111111', replyService: 'type_whatsapp' }), false);
        assert.equal(gi.isGroupChat(null), false);
    });
});

describe('groupInfo.request', function () {
    it('names the service, our account and the chat', function () {
        assert.deepEqual(gi.request(waGroup, me),
            { serviceName: 'type_whatsapp', username: '+15555550100', usernameTo: GROUP });
    });
    it('is nothing without an account, or for a 1:1 chat', function () {
        assert.equal(gi.request(waGroup, null), null);
        assert.equal(gi.request(waGroup, {}), null);
        assert.equal(gi.request({ replyAddress: '+31611111111', replyService: 'type_whatsapp' }, me), null);
    });
});

describe('groupInfo.fromReply', function () {
    it('takes each address once, by name, never ours', function () {
        var reply = { returnValue: true, inChat: true, members: [
            { address: '+46701234567', name: 'Marta' },
            { address: '15555550100@s.whatsapp.net', name: 'Me' },
            { address: '+15015550142', name: 'Anna' },
            { address: '+46701234567', name: 'Marta again' }
        ] };
        assert.deepEqual(gi.fromReply(reply, me, 'type_whatsapp'), [
            { id: '+15015550142', name: 'Anna' },
            { id: '+46701234567', name: 'Marta' }
        ]);
    });
    it('names one without a name by the address, and leaves out one without an address', function () {
        var reply = { returnValue: true, members: [{ address: 'id42', name: ' ' }, { name: 'Ghost' }, null] };
        assert.deepEqual(gi.fromReply(reply, me, 'type_telegram'), [{ id: 'id42', name: 'id42' }]);
    });
    it('keeps the separators of the app\'s records out of a name', function () {
        var reply = { returnValue: true, members: [{ address: 'a', name: 'An\x1fna\x1e' }] };
        assert.deepEqual(gi.fromReply(reply, me, 'type_discord'), [{ id: 'a', name: 'Anna' }]);
    });
    it('is no one for an error, no reply, or no list', function () {
        assert.deepEqual(gi.fromReply({ returnValue: false, errorText: 'x', members: [{ address: 'a' }] }), []);
        assert.deepEqual(gi.fromReply(null), []);
        assert.deepEqual(gi.fromReply({ returnValue: true }), []);
    });
});

describe('groupInfo.pick', function () {
    var writers = [{ id: '+46701234567', name: 'Marta' }];
    it('takes the transport\'s members when it gave any', function () {
        var service = [{ id: '+447700900123', name: 'Ben' }];
        assert.deepEqual(gi.pick(service, writers), { members: service, fromService: true });
    });
    it('falls back to who has written', function () {
        assert.deepEqual(gi.pick([], writers), { members: writers, fromService: false });
        assert.deepEqual(gi.pick(null, writers), { members: writers, fromService: false });
        assert.deepEqual(gi.pick(null, null), { members: [], fromService: false });
    });
});

describe('groupInfo.shownAddress', function () {
    it('shows a number or handle under the name', function () {
        assert.equal(gi.shownAddress({ id: '+46701234567', name: 'Marta' }), '+46701234567');
    });
    it('shows nothing that says no more: the name again, a linked id, a Signal UUID', function () {
        assert.equal(gi.shownAddress({ id: 'Marta', name: 'Marta' }), '');
        assert.equal(gi.shownAddress({ id: '123456789@lid', name: 'Marta' }), '');
        assert.equal(gi.shownAddress({ id: '0f3c2a5e-1b2c-4d5e-8f90-123456789abc', name: 'Signal user' }), '');
    });
});

describe('groupInfo.chatPerson', function () {
    it('is the person a 1:1 opens on, as a tapped sender', function () {
        assert.deepEqual(gi.chatPerson({ id: '+46701234567', name: 'Marta' }, 'type_whatsapp'),
            { username: '+46701234567', serviceName: 'type_whatsapp', displayName: 'Marta' });
    });
});

describe('groupInfo.contactLaunch', function () {
    it('offers Contacts a new contact with the IM address, and a WhatsApp number as a mobile', function () {
        assert.deepEqual(gi.contactLaunch({ id: '+46701234567', name: 'Marta' }, 'type_whatsapp'), {
            id: 'com.palm.app.contacts', params: { launchType: 'newContact', contact: {
                name: { givenName: 'Marta' },
                ims: [{ value: '+46701234567', type: 'type_whatsapp' }],
                phoneNumbers: [{ value: '+46701234567', type: 'type_mobile' }]
            } }
        });
    });
    it('gives a handle no number, and no name that is only the handle', function () {
        assert.deepEqual(gi.contactLaunch({ id: 'id42', name: 'id42' }, 'type_telegram').params.contact,
            { ims: [{ value: 'id42', type: 'type_telegram' }] });
    });
    it('asks whether new or added to one there is (no skipPrompt)', function () {
        assert.equal('skipPrompt' in gi.contactLaunch({ id: 'a', name: 'A' }, 'type_discord').params, false);
    });
    it('is nothing without a member or service', function () {
        assert.equal(gi.contactLaunch(null, 'type_whatsapp'), null);
        assert.equal(gi.contactLaunch({ id: 'a' }, ''), null);
    });
});

describe('groupInfo: WhatsApp members known by a linked id, and their numbers', function () {
    var me = { username: '+15555550100' };
    var reply = { returnValue: true, members: [
        { address: '222222222222222@lid', name: 'Sam', phone: '447700900123' },
        { address: '111111111111111@lid', name: 'Sam', phone: '+31 6 1111 1111' },
        { address: '333333333333333@lid', name: 'Ann' },
        { address: '444444444444444@lid', name: 'Me', phone: '+1 555 555 0100' },
        { address: '555555555555555@lid', name: '', phone: '+46701234567' }
    ] };
    var list = gi.fromReply(reply, me, 'type_whatsapp');
    it('keeps the number beside the linked id, as +digits, and leaves us out by our number', function () {
        assert.deepEqual(list.map(function (m) { return [m.name, m.phone || '']; }),
            [['+46701234567', '+46701234567'], ['Ann', ''], ['Sam', '+31611111111'], ['Sam', '+447700900123']],
            'by name, namesakes by number');
    });
    it('shows the number under the name, so namesakes are told apart', function () {
        assert.deepEqual(list.map(gi.shownAddress), ['', '', '+31611111111', '+447700900123'],
            'not the number again under a member named by it, nothing for a linked id alone');
        assert.equal(gi.shownAddress({ id: '31611111111@s.whatsapp.net', name: 'Sam' }), '+31611111111');
    });
    it('opens a 1:1 and offers Contacts by the number', function () {
        var sam = list[2];
        assert.deepEqual(gi.chatPerson(sam, 'type_whatsapp'),
            { username: '+31611111111', serviceName: 'type_whatsapp', displayName: 'Sam' });
        assert.deepEqual(gi.contactLaunch(sam, 'type_whatsapp').params.contact, {
            ims: [{ value: '+31611111111', type: 'type_whatsapp' }], name: { givenName: 'Sam' },
            phoneNumbers: [{ value: '+31611111111', type: 'type_mobile' }] });
        assert.equal(gi.chatPerson(list[1], 'type_whatsapp').username, '333333333333333@lid', 'no number: the id');
    });
    it('takes no phone that is no number', function () {
        var l = gi.fromReply({ returnValue: true, members: [{ address: 'a@lid', name: 'A', phone: 'abc' }] }, me, 'type_whatsapp');
        assert.equal(l[0].phone, undefined);
    });
});
