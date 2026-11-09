/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/forwarded.js - the "Forwarded from" line a forwarded message starts with
 * (tdlib-purple getForwardHeader), which the chat draws as a label.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var fw = bootstrap.load('util/forwarded.js');
var utils = bootstrap.load('util/messagingUtils.js');
var L = function (s) { return s; };
var escape = utils.message.escapeHtml;

describe('forwarded.find', function () {
    it('reads the line the plugin writes, as given and as the db holds it', function () {
        assert.deepEqual(fw.find('<b>Forwarded from Ann:</b>\nhi'), { name: 'Ann' });
        assert.deepEqual(fw.find('<b>Forwarded from Ann:</b><br />\nhi'), { name: 'Ann' });
        assert.deepEqual(fw.find('<b>Forwarded from Ann:</b><br>hi'), { name: 'Ann' });
        assert.deepEqual(fw.find('<b>Forwarded from News &lt;x&gt; (Bob):</b><br />\nfile:///m/a.jpg'),
            { name: 'News &lt;x&gt; (Bob)' }, 'escaped, as the db has it');
        assert.deepEqual(fw.find('<b>Forwarded from A: B:</b><br />\nhi'), { name: 'A: B' }, 'a colon in the name');
        assert.deepEqual(fw.find('<b>Forwarded:</b><br />\nhi'), { name: '' }, 'from nobody named');
        assert.deepEqual(fw.find('<b>Forwarded from Ann:</b>'), { name: 'Ann' }, 'nothing after it');
    });

    it('takes nothing else for one', function () {
        [undefined, null, '', 'hello', 'Forwarded from Ann: hi', '<b>Forwarded from Ann</b> hi',
            'hi <b>Forwarded from Ann:</b>', '<b>Forwarded from <i>Ann</i>:</b> hi', '<b>Forwarding:</b> x'
        ].forEach(function (t) {
            assert.equal(fw.find(t), null, String(t));
        });
    });
});

describe('forwarded.strip', function () {
    it('leaves the message as it would be without the line', function () {
        assert.equal(fw.strip('<b>Forwarded from Ann:</b><br />\nhi<br />\nthere'), 'hi<br />\nthere');
        assert.equal(fw.strip('<b>Forwarded from Ann:</b>\nfile:///m/a.jpg\ncap'), 'file:///m/a.jpg\ncap');
        assert.equal(fw.strip('<b>Forwarded:</b><br />\nluneos-file:?name=a.mp4&amp;size=1&amp;type=video&amp;state=ask<br />\ncap'),
            'luneos-file:?name=a.mp4&amp;size=1&amp;type=video&amp;state=ask<br />\ncap');
    });

    it('leaves a message that is no forward as it is', function () {
        ['hi', 'hi <b>Forwarded from Ann:</b><br />x', '', '<b>bold</b><br />x'].forEach(function (t) {
            assert.equal(fw.strip(t), t);
        });
        assert.equal(fw.strip(undefined), '');
    });

    it('leaves an offered file for its card to find', function () {
        var offer = bootstrap.load('util/fileOffer.js');
        var text = '<b>Forwarded from Ann:</b><br />\nluneos-file:?name=a.mp4&amp;size=10&amp;type=video&amp;state=ask<br />\ncap';
        assert.equal(offer.find(fw.strip(text)).name, 'a.mp4');
        assert.equal(offer.strip(fw.strip(text)), 'cap');
    });
});

describe('forwarded.labelHtml', function () {
    it('names who it is from, as the db has the name', function () {
        assert.equal(fw.labelHtml({ name: 'News &lt;x&gt;' }, L, escape), 'Forwarded from News &lt;x&gt;');
        assert.equal(fw.labelHtml({ name: '' }, L, escape), 'Forwarded');
        assert.equal(fw.labelHtml(null, L, escape), '');
    });

    it('escapes the translation, not the name again', function () {
        var tr = function (s) { return s === 'Forwarded from {name}' ? '<{name}> sent this & that' : 'Fwd <x>'; };
        assert.equal(fw.labelHtml({ name: 'A &amp; B' }, tr, escape), '&lt;A &amp; B&gt; sent this &amp; that');
        assert.equal(fw.labelHtml({ name: '' }, tr, escape), 'Fwd &lt;x&gt;');
    });
});
