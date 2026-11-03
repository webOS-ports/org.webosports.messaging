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

// Signal and WhatsApp both use the phone number as the address.
var BEN = {
    name: { givenName: 'Ben' },
    ims: [
        { value: '+31612345678', type: 'type_whatsapp' },
        { value: '+31612345678', type: 'type_signal' }
    ],
    phoneNumbers: [{ value: '+31612345678', type: 'type_mobile' }]
};

describe('transportPicker with one number on several services', function () {
    beforeEach(function () {
        appState.accountService = accountsFor(['type_whatsapp', 'type_signal', 'sms'], {});
    });

    it('replies on the service the thread was last used on, not the first one listed', function () {
        picker.setTransportsByPerson(BEN, { replyAddress: '+31612345678', replyService: 'type_signal' });
        assert.equal(picker.getSelectedTransport().serviceName, 'type_signal');
    });

    it('keeps to the service even when the stored address is another spelling', function () {
        // A thread first used on WhatsApp keeps its jid as the address after a Signal message.
        picker.setTransportsByPerson(BEN,
            { replyAddress: '31612345678@s.whatsapp.net', replyService: 'type_signal' });
        assert.equal(picker.getSelectedTransport().serviceName, 'type_signal');
    });

    it('takes SMS for an MMS thread', function () {
        picker.setTransportsByPerson(BEN, { replyAddress: '+31612345678', replyService: 'mms' });
        assert.equal(picker.getSelectedTransport().serviceName, 'sms');
    });

    it('follows an incoming message onto the service it came in on', function () {
        picker.setTransportsByPerson(BEN, { replyAddress: '+31612345678', replyService: 'type_whatsapp' });
        assert.equal(picker.followMessage({ serviceName: 'type_signal', from: { addr: '+31612345678' } }), true);
        assert.equal(picker.getSelectedTransport().serviceName, 'type_signal');
        assert.equal(picker.followMessage({ serviceName: 'type_signal', from: { addr: '+31612345678' } }), false);
    });

    it('leaves the selection alone for a message on a service it cannot send on', function () {
        picker.setTransportsByPerson(BEN, { replyAddress: '+31612345678', replyService: 'type_whatsapp' });
        assert.equal(picker.followMessage({ serviceName: 'type_telegram', from: { addr: '+31612345678' } }), false);
        assert.equal(picker.getSelectedTransport().serviceName, 'type_whatsapp');
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

describe('transportPicker.serviceNameFor', function () {
    var TEMPLATES = { type_signal: { loc_shortName: 'Signal' }, type_telegram: { loc_name: 'Telegram' } };

    it('names only the service, not the number it goes to', function () {
        // Was "+31611745571 Signal" in the header.
        appState.accountService = accountsFor(['type_signal'], TEMPLATES);
        var transport = picker.setTransportsByChatThread(
            { replyAddress: '+31611745571', replyService: 'type_signal' })[0];
        assert.equal(picker.serviceNameFor(transport), 'Signal');
    });

    it('says SMS for a phone number, whatever kind of number it is', function () {
        appState.accountService = accountsFor(['sms'], {});
        var transports = picker.setTransportsByPerson(ADA, null);
        assert.equal(picker.serviceNameFor(transports[0]), 'SMS');
        assert.equal(picker.serviceNameFor(transports[1]), 'SMS');
    });

    it('falls back to the template name, then the bare service id', function () {
        appState.accountService = accountsFor([], TEMPLATES);
        assert.equal(picker.serviceNameFor({ serviceName: 'type_telegram' }), 'Telegram');
        assert.equal(picker.serviceNameFor({ serviceName: 'type_discord' }), 'discord');
        assert.equal(picker.serviceNameFor(null), '');
    });
});

describe('transportPicker.iconFor', function () {
    function withIcons(paths) {
        var service = accountsFor(Object.keys(paths), {});
        service.getIconPath = function (serviceName) { return paths[serviceName] || null; };
        return service;
    }

    it('gives an IM transport its service icon', function () {
        appState.accountService = withIcons({ type_signal: '/usr/palm/public/accounts/com.palm.signal/images/signal-48x48.png' });
        assert.equal(picker.iconFor({ serviceName: 'type_signal', isPhone: false }),
            '/usr/palm/public/accounts/com.palm.signal/images/signal-48x48.png');
    });

    it('gives SMS, an unknown service or no transport no icon', function () {
        appState.accountService = withIcons({ sms: '/sms.png' });
        assert.equal(picker.iconFor({ serviceName: 'sms', isPhone: true }), null);
        assert.equal(picker.iconFor({ serviceName: 'type_teams', isPhone: false }), null);
        assert.equal(picker.iconFor(null), null);
    });
});
