/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/sentExtras.js - a location or contact card we sent, drawn as a received one is.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var se = bootstrap.load('util/sentExtras.js');
var ca = bootstrap.load('util/chatActions.js');

function out(extra) {
    return Object.assign({ folder: 'outbox', messageText: '' }, extra);
}

describe('sentExtras.sentLocation', function () {
    it('a location we sent, with its name or without', function () {
        var loc = ca.location(52.3702161, 4.8951679, 'Dam Square');
        assert.deepEqual(se.sentLocation(out({ location: loc, messageText: ca.locationText(loc) })),
            { lat: 52.3702161, lng: 4.8951679, name: 'Dam Square' });
        assert.deepEqual(se.sentLocation(out({ location: { latitude: -33.8688, longitude: 151.2093 } })),
            { lat: -33.8688, lng: 151.2093, name: '' });
        assert.deepEqual(se.sentLocation(out({ location: { latitude: 0, longitude: 0 } })), { lat: 0, lng: 0, name: '' });
    });
    it('nothing for a received message, a message without one, or no place', function () {
        var loc = { latitude: 1, longitude: 2 };
        assert.equal(se.sentLocation(out({ folder: 'inbox', location: loc })), null);
        assert.equal(se.sentLocation(out({})), null);
        assert.equal(se.sentLocation(null), null);
        assert.equal(se.sentLocation(out({ location: { latitude: '1', longitude: 2 } })), null);
        assert.equal(se.sentLocation(out({ location: { latitude: NaN, longitude: 2 } })), null);
        assert.equal(se.sentLocation(out({ location: { latitude: 91, longitude: 2 } })), null);
        assert.equal(se.sentLocation(out({ location: { latitude: 1, longitude: -181 } })), null);
    });
});

describe('sentExtras.sentContact', function () {
    it('the name of a card we sent, as chatActions writes it', function () {
        var person = { name: 'Vera van Dijk, PhD', phoneNumbers: [{ value: '+31 6 1234 5678' }] };
        assert.deepEqual(se.sentContact(out({ contactCard: ca.contactCard(person), messageText: ca.contactText(person) })),
            { name: 'Vera van Dijk, PhD', fullName: 'Vera van Dijk, PhD', personId: '', phones: ['+31 6 1234 5678'], emails: [] });
    });
    it('keeps the person it was sent from, and the numbers and addresses, each once', function () {
        var card = ca.contactCard({ name: 'Ann', phoneNumbers: [{ value: '+15550100' }, { value: '+15550101' }],
            emails: [{ value: 'ann@example.org' }] });
        card.personId = 'p1';
        var c = se.sentContact(out({ contactCard: card }));
        assert.equal(c.personId, 'p1');
        assert.deepEqual(c.phones, ['+15550100', '+15550101']);
        assert.deepEqual(c.emails, ['ann@example.org']);
        assert.deepEqual(se.vcardValues('BEGIN:VCARD\r\nTEL;TYPE=CELL:+1\r\n 555\r\ntel:+1555\r\nEND:VCARD', 'TEL'), ['+1555'],
            'folded, any case, each once');
        assert.equal(se.sentContact(out({ contactCard: { vcard: card.vcard, personId: 7 } })).personId, '', 'only a string id');
    });
    it('reads FN with parameters, folded, and escaped', function () {
        assert.equal(se.vcardName('BEGIN:VCARD\r\nFN;CHARSET=UTF-8:Ann\r\n  Lee\; Jr.\r\nEND:VCARD'), 'Ann Lee; Jr.');
        assert.equal(se.vcardName('BEGIN:VCARD\nfn:a\\\\b\nEND:VCARD'), 'a\\b');
        assert.equal(se.vcardName('BEGIN:VCARD\r\nN:Lee;Ann;;;\r\nEND:VCARD'), '');
    });
    it('without an FN, the first line of the text, else "Contact card"', function () {
        var vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\nTEL:+15550100\r\nEND:VCARD\r\n';
        assert.equal(se.sentContact(out({ contactCard: { vcard: vcard }, messageText: 'Sam\n+15550100' })).name, 'Sam');
        assert.equal(se.sentContact(out({ contactCard: { vcard: vcard }, messageText: 'Sam<br />\n+15550100' })).name, 'Sam');
        assert.equal(se.sentContact(out({ contactCard: { vcard: vcard } })).name, 'Contact card');
        assert.equal(se.sentContact(out({ contactCard: { vcard: vcard } })).fullName, '', 'no name to give Contacts');
    });
    it('nothing for a received message or one with no card', function () {
        var card = { vcard: 'BEGIN:VCARD\r\nFN:X\r\nEND:VCARD' };
        assert.equal(se.sentContact(out({ folder: 'inbox', contactCard: card })), null);
        assert.equal(se.sentContact(out({ contactCard: { vcard: 'hello' } })), null);
        assert.equal(se.sentContact(out({ contactCard: {} })), null);
        assert.equal(se.sentContact(out({})), null);
    });
});
