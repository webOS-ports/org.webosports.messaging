/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/urlTarget.js - the im: and sms: URLs the app is opened with. Tapping a Teams
 * address in Contacts opened "im:herrie.1982?personId=...&type=teams", which found no account
 * because the accounts are known as type_teams.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var urlTarget = bootstrap.load('util/urlTarget.js');

describe('urlTarget.composeParams', function () {
    it('puts the type_ prefix back on the IM type Contacts sends', function () {
        assert.deepEqual(urlTarget.composeParams('im:herrie.1982?personId=OTtO2BQNLQw&type=teams'), {
            ims: [{ value: 'herrie.1982', type: 'type_teams' }],
            messageText: undefined
        });
    });

    it('leaves a type that already has the prefix, and a missing one, alone', function () {
        assert.equal(urlTarget.composeParams('im:a?type=type_aim').ims[0].type, 'type_aim');
        assert.equal(urlTarget.composeParams('im:fred@aim.com').ims[0].type, undefined);
    });

    it('decodes the address and the body', function () {
        // Contacts encodes the address with encodeURIComponent.
        assert.deepEqual(urlTarget.composeParams('im:user%40herrie.org?type=teams&body=Let%27s%20go'), {
            ims: [{ value: 'user@herrie.org', type: 'type_teams' }],
            messageText: "Let's go"
        });
    });

    it('takes the first of several sms numbers', function () {
        assert.deepEqual(urlTarget.composeParams('sms:1-501-555-1212,123?body=Hey%20babe'), {
            phoneNumbers: [{ value: '1-501-555-1212', type: 'sms' }],
            messageText: 'Hey babe'
        });
    });

    it('ignores other schemes and junk', function () {
        assert.equal(urlTarget.composeParams('mailto:a@b.c'), null);
        assert.equal(urlTarget.composeParams('no scheme here'), null);
        assert.equal(urlTarget.composeParams(undefined), null);
    });
});
