/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/accountErrors.js - which accounts get the "sign in again" dashboard. Without it a
 * Teams account whose sign-in Microsoft refused just stayed offline, with the reason only in the
 * transport's log.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var accountErrors = bootstrap.load('util/accountErrors.js');

describe('accountErrors.credentialErrors', function () {
    it('picks out the accounts whose sign-in was refused or has no credentials', function () {
        // The record imlibpurpleservice wrote for a Teams account with an expired code.
        var teams = { accountId: 'OTsY2+BFWe+', capabilityProvider: 'com.palm.teams.im',
            busAddress: 'com.palm.imlibpurple', syncState: 'ERROR', errorCode: '401_UNAUTHORIZED' };
        var noCreds = { accountId: 'b', syncState: 'ERROR', errorCode: 'CREDENTIALS_NOT_FOUND' };
        assert.deepEqual(accountErrors.credentialErrors([teams, noCreds]), { 'OTsY2+BFWe+': true, b: true });
    });

    it('ignores other states, other errors, folder records and junk', function () {
        assert.deepEqual(accountErrors.credentialErrors([
            { accountId: 'a', syncState: 'INITIAL_SYNC' },
            { accountId: 'b', syncState: 'ERROR', errorCode: 'NETWORK_ERROR' },
            { accountId: 'c', syncState: 'ERROR', errorCode: '401_UNAUTHORIZED', collectionId: 'inbox' },
            { syncState: 'ERROR', errorCode: '401_UNAUTHORIZED' },
            null
        ]), {});
        assert.deepEqual(accountErrors.credentialErrors(undefined), {});
    });
});

describe('accountErrors.plan', function () {
    var teams = { accountId: 't', loc_name: 'Microsoft Teams' };

    it('raises a dashboard for a messaging account with an error', function () {
        assert.deepEqual(accountErrors.plan({ t: true }, { t: teams }, {}), { raise: ['t'], close: [] });
    });

    it('does not raise a second one while the first is up', function () {
        assert.deepEqual(accountErrors.plan({ t: true }, { t: teams }, { t: 'toast-1' }), { raise: [], close: [] });
    });

    it('leaves accounts that are not messaging accounts, or not loaded yet, alone', function () {
        assert.deepEqual(accountErrors.plan({ mail: true }, { t: teams }, {}), { raise: [], close: [] });
        assert.deepEqual(accountErrors.plan({ t: true }, undefined, {}), { raise: [], close: [] });
    });

    it('closes the dashboard once the error has gone', function () {
        assert.deepEqual(accountErrors.plan({}, { t: teams }, { t: 'toast-1' }),
            { raise: [], close: [{ accountId: 't', toastId: 'toast-1' }] });
    });

    it('closes it even when the account itself has gone', function () {
        assert.deepEqual(accountErrors.plan({}, {}, { gone: 'toast-2' }),
            { raise: [], close: [{ accountId: 'gone', toastId: 'toast-2' }] });
    });
});
