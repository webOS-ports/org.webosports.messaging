/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/mentionMarkup.js - a sent message's mentions drawn bold, as a received one's are.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var mm = bootstrap.load('util/mentionMarkup.js');
var messagingUtils = bootstrap.load('util/messagingUtils.js');
var escapeHtml = messagingUtils.message.escapeHtml;

describe('mentionMarkup.mark', function () {
    it('bolds each name the message mentions', function () {
        assert.equal(mm.mark('@rad hi', [{ id: '1', name: 'rad' }], escapeHtml), '<b>@rad</b> hi');
        assert.equal(mm.mark('hi @rad and @Ann Lee.', [{ name: 'rad' }, { name: 'Ann Lee' }], escapeHtml),
            'hi <b>@rad</b> and <b>@Ann Lee</b>.');
    });

    it('only whole names, at a word start', function () {
        assert.equal(mm.mark('@Anna', [{ name: 'Ann' }], escapeHtml), '@Anna');
        assert.equal(mm.mark('me@rad.com', [{ name: 'rad' }], escapeHtml), 'me@rad.com');
        assert.equal(mm.mark('(@rad)', [{ name: 'rad' }], escapeHtml), '(<b>@rad</b>)');
        assert.equal(mm.mark('@Ann Lee', [{ name: 'Ann' }, { name: 'Ann Lee' }], escapeHtml), '<b>@Ann Lee</b>',
            'the longest name first');
    });

    it('matches a name as the text was escaped, and never inside a tag', function () {
        assert.equal(mm.mark('@Tom &amp; Jo', [{ name: 'Tom & Jo' }], escapeHtml), '<b>@Tom &amp; Jo</b>');
        assert.equal(mm.mark('a<br>@rad', [{ name: 'rad' }], escapeHtml), 'a<br><b>@rad</b>');
        assert.equal(mm.mark('<a title="@rad">x</a>', [{ name: 'rad' }], escapeHtml), '<a title="@rad">x</a>');
        assert.equal(mm.mark('@a.b', [{ name: 'a.b' }], escapeHtml), '<b>@a.b</b>', 'a dot in a name is no wildcard');
        assert.equal(mm.mark('@axb', [{ name: 'a.b' }], escapeHtml), '@axb');
    });

    it('leaves the text alone with nothing mentioned', function () {
        assert.equal(mm.mark('@rad', undefined, escapeHtml), '@rad');
        assert.equal(mm.mark('@rad', [{ id: '1' }, null], escapeHtml), '@rad');
        assert.equal(mm.mark('', [{ name: 'rad' }], escapeHtml), '');
    });
});
