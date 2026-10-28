/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/lib/address.js - the keys a conversation is found by. The app computes the same key
 * when it starts a thread itself, so the two are held to each other here: where they differed,
 * a thread the app started and one the service started for the same contact never met.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var bootstrap = require('./bootstrap');

var address = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'address.js'));
var app = bootstrap.load('util/messagingUtils.js').utils;

describe('service address keys', function () {
    it('matches the app on every kind of address', function () {
        var corpus = [
            ['+1 (555) 123-4567', 'sms'], ['5551234567', 'sms'], ['(555) 123-4567', 'sms'],
            ['+31 6 1234 5678', 'sms'], ['0612345678', 'sms'], ['12345', 'sms'], ['1', 'sms'],
            ['  5551234567  ', 'mms'], ['Foo@Example.COM', 'sms'], ['+15551234567', 'type_mobile'],
            ['31612345678@s.whatsapp.net', 'type_whatsapp'], ['+31612345678', 'type_whatsapp'],
            ['31612345678', 'type_whatsapp'], ['123456@lid', 'type_whatsapp'],
            ['120363025246125486@g.us', 'type_whatsapp'],
            ['herrie.1982', 'type_teams'], ['  Herrie.1982 ', 'type_teams'], ['ScreenName', 'aol'],
            ['8:live:herrie', 'type_teams'], ['#luneos', 'type_irc'], ['', 'type_teams'], ['', 'sms']
        ];
        corpus.forEach(function (c) {
            assert.equal(address.normalizeAddress(c[0], c[1]), app.normalizeAddress(c[0], c[1]),
                JSON.stringify(c));
        });
    });

    it('keys every WhatsApp spelling of a number as E.164', function () {
        ['31612345678@s.whatsapp.net', '+31612345678', '31612345678', ' +31612345678 '].forEach(function (a) {
            assert.equal(address.normalizeAddress(a, 'type_whatsapp'), '+31612345678');
        });
    });

    it('formats a thread name as the app formats the address', function () {
        [['5551234567', 'sms'], ['+15551234567', 'sms'], ['+31612345678', 'sms'], ['5551234', 'sms'],
            ['15551234567@s.whatsapp.net', 'type_whatsapp'], ['31612345678@s.whatsapp.net', 'type_whatsapp'],
            ['123456@lid', 'type_whatsapp'], ['herrie.1982', 'type_teams']].forEach(function (c) {
            assert.equal(address.formatAddress(c[0], c[1]), app.formatAddress(c[0], c[1]), JSON.stringify(c));
        });
        assert.equal(address.formatAddress('', 'sms'), 'No Recipient');
    });

    it('looks a WhatsApp contact up under every form it may be stored in', function () {
        assert.deepEqual(address.imLookupValues('31612345678@s.whatsapp.net', 'type_whatsapp').sort(),
            ['+31612345678', '31612345678', '31612345678@s.whatsapp.net'].sort());
        assert.deepEqual(address.imLookupValues(' Herrie.1982', 'type_teams'), ['herrie.1982']);
    });

    it('finds a phone contact by the reversed last seven digits, and checks the match', function () {
        // PhoneNumber.normalizePhoneNumber(n, true) without extension: "-<subscriber reversed>-".
        assert.equal(address.phoneSearchPrefix('+1 (555) 123-4567'), '-7654321');
        assert.equal(address.phoneSearchPrefix('12345'), '');
        assert.equal(address.samePhoneNumber('+1 555 123 4567', '(555) 123-4567'), true);
        assert.equal(address.samePhoneNumber('+31 6 1234 5678', '06 12345678'), true);
        assert.equal(address.samePhoneNumber('5551234567', '5559234567'), false);
        assert.equal(address.samePhoneNumber('123456', '123456'), false);
    });
});
