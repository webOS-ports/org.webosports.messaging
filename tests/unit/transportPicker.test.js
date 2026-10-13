/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/transportPicker.js - which addresses a conversation can be sent on, and which one
 * is selected. The only thing it reaches outside itself for is appState.accountService, so a
 * stand-in account service is enough to drive all of it on the host.
 */

var { describe, it, beforeEach } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var picker = bootstrap.load('util/transportPicker.js');
var appState = bootstrap.load('util/appState.js');

/** Stands in for AccountService: holds accounts for the service names it was given. */
function accountsFor(serviceNames, templates) {
    var accounts = {};
    serviceNames.forEach(function (name) {
        accounts[name] = { _id: 'acct-' + name, templateId: name };
    });
    return {
        getAccount: function (serviceName) {
            return accounts[serviceName];
        },
        getMyAccountTypesHash: function () {
            return templates;
        }
    };
}

var ADA = {
    name: { givenName: 'Ada', familyName: 'Lovelace' },
    ims: [
        { value: 'ada@aim', type: 'type_aol' },
        { value: 'ada@xmpp', type: 'type_jabber' }
    ],
    phoneNumbers: [
        { value: '5551234567', type: 'type_mobile' },
        { value: '5559876543', type: 'type_work' }
    ]
};

beforeEach(function () {
    appState.accountService = null;
    picker.setTransportsByChatThread(null);
});

describe('transportPicker.setTransportsByPerson', function () {
    it('keeps only the addresses there is an account to send on', function () {
        appState.accountService = accountsFor(['type_aol', 'sms'], {});
        var transports = picker.setTransportsByPerson(ADA, null);

        assert.deepEqual(transports.map(function (tr) { return tr.replyAddress; }),
            ['ada@aim', '5551234567', '5559876543']);
        assert.equal(transports[0].isPhone, false);
        assert.equal(transports[1].isPhone, true);
        assert.equal(transports[1].serviceName, 'sms');
    });

    it('drops every phone number when there is no SMS account', function () {
        appState.accountService = accountsFor(['type_aol'], {});
        var transports = picker.setTransportsByPerson(ADA, null);
        assert.deepEqual(transports.map(function (tr) { return tr.replyAddress; }), ['ada@aim']);
    });

    it('produces nothing at all with no accounts', function () {
        appState.accountService = accountsFor([], {});
        assert.deepEqual(picker.setTransportsByPerson(ADA, null), []);
        assert.equal(picker.getSelectedTransport(), null);
    });

    it('carries the person display name onto every transport', function () {
        appState.accountService = accountsFor(['sms'], {});
        picker.setTransportsByPerson(ADA, null).forEach(function (tr) {
            assert.equal(tr.displayName, 'Ada Lovelace');
        });
    });

    it('labels a phone number by its type', function () {
        appState.accountService = accountsFor(['sms'], {});
        var transports = picker.setTransportsByPerson(ADA, null);
        assert.equal(transports[0].label, 'Mobile');
        assert.equal(transports[1].label, 'Work');
    });

    it('labels an IM from the account template, falling back to the bare service name', function () {
        appState.accountService = accountsFor(['type_aol', 'type_jabber'],
            { type_aol: { loc_shortName: 'AIM' } });
        var transports = picker.setTransportsByPerson(ADA, null);
        assert.equal(transports[0].label, 'AIM');
        assert.equal(transports[1].label, 'jabber');
    });
});

describe('transportPicker.selectForThread', function () {
    it('selects the transport the thread already replies on', function () {
        appState.accountService = accountsFor(['type_aol', 'sms'], {});
        picker.setTransportsByPerson(ADA, { replyAddress: '5559876543', replyService: 'sms' });
        assert.equal(picker.getSelectedTransport().replyAddress, '5559876543');
    });

    it('matches on the normalized address, not the stored spelling', function () {
        appState.accountService = accountsFor(['sms'], {});
        picker.setTransportsByPerson(ADA, { replyAddress: '+1 (555) 123-4567', replyService: 'sms' });
        assert.equal(picker.getSelectedTransport().replyAddress, '5551234567');
    });

    it('falls back to the first transport when nothing matches', function () {
        appState.accountService = accountsFor(['type_aol', 'sms'], {});
        picker.setTransportsByPerson(ADA, { replyAddress: 'nobody@nowhere', replyService: 'type_aol' });
        assert.equal(picker.getSelectedTransport().replyAddress, 'ada@aim');
    });

    it('selects the first transport for a thread that is not there yet', function () {
        appState.accountService = accountsFor(['sms'], {});
        picker.setTransportsByPerson(ADA, null);
        assert.equal(picker.getSelectedTransport().replyAddress, '5551234567');
    });
});

describe('transportPicker.setTransportsByChatThread', function () {
    it('offers the one address a thread with no linked person carries', function () {
        appState.accountService = accountsFor(['sms'], {});
        var transports = picker.setTransportsByChatThread({
            replyAddress: '5551234567',
            replyService: 'sms',
            displayName: 'Unknown'
        });
        assert.equal(transports.length, 1);
        assert.equal(transports[0].replyAddress, '5551234567');
        assert.equal(transports[0].isPhone, true);
        assert.equal(picker.getSelectedTransport(), transports[0]);
    });

    it('falls back to the address as the display name', function () {
        appState.accountService = accountsFor(['sms'], {});
        var transports = picker.setTransportsByChatThread({
            replyAddress: '5551234567', replyService: 'sms'
        });
        assert.equal(transports[0].displayName, '5551234567');
    });

    it('marks an IM thread as not a phone', function () {
        appState.accountService = accountsFor(['type_aol'], {});
        var transports = picker.setTransportsByChatThread({
            replyAddress: 'ada@aim', replyService: 'type_aol'
        });
        assert.equal(transports[0].isPhone, false);
        assert.equal(transports[0].account._id, 'acct-type_aol');
    });

    it('clears everything for a missing thread', function () {
        appState.accountService = accountsFor(['sms'], {});
        picker.setTransportsByChatThread({ replyAddress: '5551234567', replyService: 'sms' });
        assert.deepEqual(picker.setTransportsByChatThread(null), []);
        assert.equal(picker.getSelectedTransport(), null);
    });
});

describe('transportPicker.labelFor', function () {
    it('shows the formatted address and what kind of address it is', function () {
        appState.accountService = accountsFor(['sms'], {});
        var transports = picker.setTransportsByPerson(ADA, null);
        assert.equal(picker.labelFor(transports[0]), '(555) 123-4567 Mobile');
    });

    it('returns an empty label for nothing', function () {
        assert.equal(picker.labelFor(null), '');
        assert.equal(picker.labelFor(undefined), '');
    });
});
