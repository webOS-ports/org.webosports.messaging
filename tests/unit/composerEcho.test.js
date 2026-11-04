/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/composerEcho.js - the keyboard's last word does not come back after a send.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var composerEcho = bootstrap.load('util/composerEcho.js');

/** A TextArea stand-in with a DOM-like node; `document.activeElement` is faked through global. */
function field(value) {
    var node = {
        value: value || '',
        blur: function () { global.document.activeElement = null; this.blurred = true; },
        focus: function () { global.document.activeElement = this; }
    };
    return {
        node: node,
        hasNode: function () { return node; },
        get: function () { return node.value; },
        set: function (k, v) { node.value = v; }
    };
}
global.document = { activeElement: null };

describe('composerEcho.isEcho', function () {
    it('takes the sent text\'s last word, written back just after the send, as the echo', function () {
        // What Sargo saved as a draft after "Hello from LuneOS Synergy" was sent.
        assert.equal(composerEcho.isEcho('Synergy', 'Hello from LuneOS Synergy', 300), true);
        assert.equal(composerEcho.isEcho('next', 'Discord up next', 50), true);
        assert.equal(composerEcho.isEcho('ok', 'ok', 50), true);
    });

    it('leaves new typing alone', function () {
        assert.equal(composerEcho.isEcho('o', 'go', 100), false, 'end of a word, not the word');
        assert.equal(composerEcho.isEcho('H', 'Hello from LuneOS Synergy', 100), false);
        assert.equal(composerEcho.isEcho('LuneOS Synergy', 'Hello from LuneOS Synergy', 100), false, 'more than one word');
        assert.equal(composerEcho.isEcho('Synergy', 'Hello from LuneOS Synergy', 2500), false, 'too late');
        assert.equal(composerEcho.isEcho('Synergy', '', 100), false);
    });
});

describe('composerEcho.check', function () {
    it('empties the field when the echo arrives, and keeps the focus there', function () {
        var ta = field('');
        ta.node.focus();
        composerEcho.sent(ta, 'Hello from LuneOS Synergy');
        ta.node.value = 'Synergy';
        assert.equal(composerEcho.check(ta), true);
        assert.equal(ta.node.value, '');
        assert.equal(ta.node.blurred, true);
        assert.equal(global.document.activeElement, ta.node);
    });

    it('looks at the first input only: later typing of the same word stays', function () {
        var ta = field('');
        composerEcho.sent(ta, 'say hi');
        ta.node.value = 'h';
        assert.equal(composerEcho.check(ta), false);
        ta.node.value = 'hi';
        assert.equal(composerEcho.check(ta), false);
        assert.equal(ta.node.value, 'hi');
    });

    it('does nothing when there was no send', function () {
        var ta = field('Synergy');
        assert.equal(composerEcho.check(ta), false);
        assert.equal(ta.node.value, 'Synergy');
    });
});
