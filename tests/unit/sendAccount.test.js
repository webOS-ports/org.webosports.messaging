/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/sendAccount.js - an IM reply never quietly turns into an SMS.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var sendAccount = bootstrap.load('util/sendAccount.js');

function accounts(list) {
    return {
        getAccount: function (serviceName) {
            return list.filter(function (a) { return a.serviceName === serviceName; })[0];
        }
    };
}

var TELEGRAM = { _id: 'OUNrm8OmDNJ', serviceName: 'type_telegram', capabilitySubtype: 'IM' };

describe('sendAccount', function () {
    it('reports a Telegram reply whose account the app never loaded as missing, not as SMS', function () {
        // The login-code chat: the transport was built before the account existed.
        var transport = { serviceName: 'type_telegram', replyAddress: 'telegram', account: undefined };
        assert.deepEqual(sendAccount(transport, accounts([])),
            { state: 'missing', account: undefined });
    });

    it('picks up an account that has been loaded since the conversation opened', function () {
        var transport = { serviceName: 'type_telegram', replyAddress: 'telegram' };
        assert.deepEqual(sendAccount(transport, accounts([TELEGRAM])),
            { state: 'im', account: TELEGRAM });
    });

    it('keeps the account a transport already has', function () {
        var transport = { serviceName: 'type_telegram', account: TELEGRAM };
        assert.equal(sendAccount(transport, accounts([])).account, TELEGRAM);
    });

    it('sends text-message transports as text', function () {
        assert.equal(sendAccount({ serviceName: 'sms' }, accounts([])).state, 'text');
    });

    it('has nothing to send on without a transport', function () {
        assert.equal(sendAccount(null, accounts([TELEGRAM])).state, 'missing');
    });
});
