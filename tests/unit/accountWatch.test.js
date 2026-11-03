/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/data/AccountService.js - an account added while the app runs is picked up.
 */

var { describe, it, beforeEach } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

// Look like a device, so the service talks to the bus stand-ins rather than the mock db.
global.window.PalmSystem = {};
var AccountService = bootstrap.load('data/AccountService.js');

var PROFILE = { _id: 'OUFu1sABMzR', templateId: 'com.palm.palmprofile',
    capabilityProviders: [{ capability: 'MESSAGING', capabilitySubtype: 'SMS' }] };
var WHATSAPP = { _id: 'OUKtrtCsGhV', templateId: 'com.palm.whatsapp',
    capabilityProviders: [{ capability: 'MESSAGING', capabilitySubtype: 'IM', serviceName: 'type_whatsapp' }] };
var TELEGRAM = { _id: 'OUNrm8OmDNJ', templateId: 'com.palm.telegram',
    capabilityProviders: [{ capability: 'MESSAGING', capabilitySubtype: 'IM', serviceName: 'type_telegram' }] };

function logins(ids) {
    return { returnValue: true, results: ids.map(function (id) { return { accountId: id }; }) };
}

describe('AccountService login-state watch', function () {
    var service;
    beforeEach(function () {
        service = new AccountService();
        service.getAccounts();
        service.gotAccounts(null, { returnValue: true, results: [PROFILE, WHATSAPP] });
    });

    it('watches imloginstate once the accounts are asked for', function () {
        assert.equal(service.$.loginWatch.sent.length, 1);
        assert.equal(service.$.loginWatch.sent[0].query.from, 'com.palm.imloginstate:1');
        assert.equal(service.$.loginWatch.sent[0].watch, true);
    });

    it('re-reads the accounts when Telegram is added while the app runs', function () {
        service.gotLoginStates(null, logins(['OUKtrtCsGhV']));
        assert.equal(service.$.listAccounts.sent.length, 1, 'no re-read for the known account');

        service.gotLoginStates(null, { fired: true });
        assert.equal(service.$.loginWatch.sent.length, 2, 'a fired watch is asked again');
        service.gotLoginStates(null, logins(['OUKtrtCsGhV', 'OUNrm8OmDNJ']));
        assert.equal(service.$.listAccounts.sent.length, 2, 'the new account triggers a re-read');

        service.gotAccounts(null, { returnValue: true, results: [PROFILE, WHATSAPP, TELEGRAM] });
        assert.equal(service.getAccount('type_telegram').accountId, 'OUNrm8OmDNJ');
    });

    it('re-reads the accounts when one is removed', function () {
        service.gotLoginStates(null, logins(['OUKtrtCsGhV', 'OUNrm8OmDNJ']));
        var before = service.$.listAccounts.sent.length;
        service.gotLoginStates(null, logins(['OUKtrtCsGhV']));
        assert.equal(service.$.listAccounts.sent.length, before + 1);
    });

    it('does not re-read on a presence change that leaves the accounts as they were', function () {
        service.gotLoginStates(null, logins(['OUKtrtCsGhV']));
        service.gotLoginStates(null, logins(['OUKtrtCsGhV']));
        assert.equal(service.$.listAccounts.sent.length, 1);
    });

    it('catches an account created before the first watch answer', function () {
        service.gotLoginStates(null, logins(['OUKtrtCsGhV', 'OUNrm8OmDNJ']));
        assert.equal(service.$.listAccounts.sent.length, 2);
    });
});
