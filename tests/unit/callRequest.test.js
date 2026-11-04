/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/callRequest.js - calls go to the phone app over the service picked in the chat.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var callRequest = bootstrap.load('util/callRequest.js');
var AccountService = bootstrap.load('data/AccountService.js');

// As listAccounts answers on Sargo: no templates, the providers on each account record.
var ACCOUNTS = [
    { _id: 'p', templateId: 'com.palm.palmprofile', capabilityProviders: [
        { capability: 'MESSAGING' }, { capability: 'PHONE' }] },
    { _id: 'w', templateId: 'com.palm.whatsapp', capabilityProviders: [
        { capability: 'MESSAGING', serviceName: 'type_whatsapp' },
        { capability: 'PHONE', serviceName: 'type_whatsapp', videoFormat: 'both' }] },
    { _id: 's', templateId: 'com.palm.signal', capabilityProviders: [
        { capability: 'MESSAGING', serviceName: 'type_signal' },
        { capability: 'PHONE', serviceName: 'type_signal', videoFormat: 'none' }] },
    { _id: 'd', templateId: 'com.palm.discord', capabilityProviders: [
        { capability: 'MESSAGING', serviceName: 'type_discord', reactions: { max: 1 } }] }
];

function accounts() {
    var service = new AccountService();
    service.gotAccounts(null, { returnValue: true, results: ACCOUNTS });
    return service;
}

var SIGNAL = { serviceName: 'type_signal', replyAddress: '+31611745571', isPhone: false };
var WHATSAPP = { serviceName: 'type_whatsapp', replyAddress: '+31611745571', isPhone: false };
var DISCORD = { serviceName: 'type_discord', replyAddress: 'mazzinia', isPhone: false };
var SMS = { serviceName: 'sms', replyAddress: '+31611745571', isPhone: true };

describe('AccountService call capabilities without templates', function () {
    it('reads them from the account records', function () {
        var service = accounts();
        assert.equal(service.hasVoiceCapability('type_signal'), true);
        assert.equal(service.hasVideoCapability('type_signal'), false, 'Signal: videoFormat none');
        assert.equal(service.hasVoiceCapability('type_whatsapp'), true);
        assert.equal(service.hasVideoCapability('type_whatsapp'), true);
    });

    it('does not take the profile\'s PHONE provider, which names no service, for every service', function () {
        assert.equal(accounts().hasVoiceCapability('type_discord'), false);
    });

    it('finds the other provider settings there too', function () {
        assert.deepEqual(accounts().getReactions('type_discord'), { max: 1 });
    });
});

describe('callRequest.callOptions', function () {
    it('offers what the service can do', function () {
        var service = accounts();
        assert.deepEqual(callRequest.callOptions(WHATSAPP, service, false), { voice: true, video: true });
        assert.deepEqual(callRequest.callOptions(SIGNAL, service, false), { voice: true, video: false });
        assert.deepEqual(callRequest.callOptions(DISCORD, service, false), { voice: false, video: false });
        assert.deepEqual(callRequest.callOptions(SMS, service, false), { voice: true, video: false });
    });

    it('offers no call in a group chat, or without an address or accounts', function () {
        var service = accounts();
        assert.deepEqual(callRequest.callOptions(WHATSAPP, service, true), { voice: false, video: false });
        assert.deepEqual(callRequest.callOptions({ serviceName: 'type_whatsapp' }, service, false),
            { voice: false, video: false });
        assert.deepEqual(callRequest.callOptions(WHATSAPP, null, false), { voice: false, video: false });
        assert.deepEqual(callRequest.callOptions(null, service, false), { voice: false, video: false });
    });
});

describe('callRequest.callRequest', function () {
    it('asks the phone app to dial over the IM service', function () {
        assert.deepEqual(callRequest.callRequest(SIGNAL, false), { id: 'org.webosports.app.phone',
            params: { action: 'dial', address: '+31611745571', video: false, transport: 'type_signal' } });
        assert.equal(callRequest.callRequest(WHATSAPP, true).params.video, true);
    });

    it('makes a phone number on SMS a cellular call', function () {
        assert.deepEqual(callRequest.callRequest(SMS, false), { id: 'org.webosports.app.phone',
            params: { action: 'dial', address: '+31611745571', video: false, transport: 'com.palm.telephony' } });
    });

    it('has nothing to dial without an address', function () {
        assert.equal(callRequest.callRequest({ serviceName: 'type_signal' }, false), null);
        assert.equal(callRequest.callRequest(null, false), null);
    });
});
