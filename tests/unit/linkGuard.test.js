/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/linkGuard.js - no click inside a link loads it in the app's card.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var lg = bootstrap.load('util/linkGuard.js');

function el(name, attrs, parent) {
    return {
        nodeType: 1, nodeName: name, parentNode: parent || { nodeType: 9 },
        getAttribute: function (k) { return (attrs || {})[k] || null; }
    };
}
function click(target) {
    var e = { target: target, prevented: false, preventDefault: function () { this.prevented = true; } };
    lg.onClick(e);
    return e.prevented;
}

describe('linkGuard', function () {
    it('stops a click on a link, or on what is inside one, from following it', function () {
        var a = el('A', { href: 'https://maps.google.com/maps?q=52.1%2C5.1' });
        assert.equal(click(a), true);
        assert.equal(click(el('B', {}, a)), true, 'bold text in a link');
        assert.equal(click({ nodeType: 3, nodeName: '#text', parentNode: a }), true, 'its text node');
    });
    it('leaves other clicks alone', function () {
        assert.equal(click(el('DIV', {})), false);
        assert.equal(click(el('A', {})), false, 'an anchor with no href');
        assert.equal(click(null), false);
    });
    it('installs once, in the capture phase', function () {
        var calls = [];
        var doc = { addEventListener: function (type, fn, capture) { calls.push([type, capture]); } };
        assert.equal(lg.install(doc), true);
        assert.equal(lg.install(doc), false);
        assert.deepEqual(calls, [['click', true]]);
    });
});
