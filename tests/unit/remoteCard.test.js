/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/remoteCard.js - a contact card that came as a link, fetched before Contacts opens it.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var rc = bootstrap.load('util/remoteCard.js');
var URL = 'https://cdn.discordapp.com/attachments/111/222/Jane_Doe.vcf?ex=6a&amp;is=6b&amp;hm=0c';

describe('remoteCard', function () {
    it('a vCard on the web, by its path', function () {
        assert.equal(rc.isRemote(URL), true);
        assert.equal(rc.isRemote('http://example.org/a.VCF'), true);
        assert.equal(rc.isRemote('file:///media/internal/a.vcf'), false, 'a local one opens as it is');
        assert.equal(rc.isRemote('https://example.org/a.vcf.jpg'), false);
        assert.equal(rc.isRemote('https://example.org/page?file=a.vcf'), false, 'only the path counts');
        assert.equal(rc.isRemote(''), false);
        assert.equal(rc.isRemote(null), false);
    });
    it('asks for it in our folder, under a name that stays when the signature changes', function () {
        var r = rc.request(URL);
        assert.equal(r.target, 'https://cdn.discordapp.com/attachments/111/222/Jane_Doe.vcf?ex=6a&is=6b&hm=0c');
        assert.equal(r.targetDir, '/media/internal/.im-attachments/cards');
        assert.match(r.targetDir, /^\/media\/internal\//, 'the manager allows only /media/internal');
        assert.equal(r.subscribe, true);
        assert.match(r.targetFilename, /^card-[0-9a-f]{8}\.vcf$/);
        assert.equal(rc.fileName(URL.replace('ex=6a', 'ex=7f')), r.targetFilename);
        assert.notEqual(rc.fileName(URL.replace('/222/', '/223/')), r.targetFilename);
    });
    it('reads the manager\'s replies', function () {
        assert.deepEqual(rc.outcome({ returnValue: true, ticket: 4, target: '/x/card.vcf', subscribed: true }), { state: 'pending' });
        assert.deepEqual(rc.outcome({ completed: true, completionStatusCode: 0, httpStatus: 200, target: '/x/card.vcf' }),
            { state: 'done', path: '/x/card.vcf' });
        assert.deepEqual(rc.outcome({ completed: true, target: '/x/card.vcf' }), { state: 'done', path: '/x/card.vcf' });
        assert.deepEqual(rc.outcome({ completed: true, completionStatusCode: 0, httpStatus: 404, target: '/x/c.vcf' }), { state: 'failed' });
        assert.deepEqual(rc.outcome({ completed: true, completionStatusCode: -5, target: '/x/c.vcf' }), { state: 'failed' });
        assert.deepEqual(rc.outcome({ completed: true, completionStatusCode: 0 }), { state: 'failed' }, 'no path');
        assert.deepEqual(rc.outcome({ completed: false, aborted: true }), { state: 'failed' });
        assert.deepEqual(rc.outcome({ completed: false, interrupted: true, completionStatusCode: 11 }), { state: 'failed' });
        assert.deepEqual(rc.outcome({ returnValue: false, errorCode: '-5' }), { state: 'failed' });
        assert.deepEqual(rc.outcome(null), { state: 'failed' });
        assert.deepEqual(rc.outcome({ amountReceived: 10, amountTotal: 20 }), { state: 'pending' });
    });
});
