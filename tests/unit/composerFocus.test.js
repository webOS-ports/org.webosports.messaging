/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/composerFocus.js - Send leaves the keyboard's word in the field, and the focus there.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var composerFocus = bootstrap.load('util/composerFocus.js');

global.document = { activeElement: null };

/**
 * A focused textarea holding [typed], with the keyboard's [preedit] after it: as a browser does,
 * losing the focus puts the pre-edit into the value.
 */
function field(typed, preedit) {
    var node = {
        value: typed + preedit,
        composing: preedit,
        events: [],
        blur: function () {
            this.events.push('blur');
            this.composing = '';
            global.document.activeElement = null;
        },
        focus: function () {
            this.events.push('focus');
            global.document.activeElement = this;
        }
    };
    return { node: node, hasNode: function () { return node; } };
}

describe('composerFocus.finishWord', function () {
    it('ends the keyboard\'s pre-edit and keeps the focus in the field', function () {
        var ta = field('Just LuneOS ', ':)');
        global.document.activeElement = ta.node;
        composerFocus.finishWord(ta);
        assert.deepEqual(ta.node.events, ['blur', 'focus']);
        assert.equal(ta.node.composing, '', 'nothing left for the browser to write back');
        assert.equal(ta.node.value, 'Just LuneOS :)');
        assert.equal(global.document.activeElement, ta.node);
    });

    it('leaves a field without the focus alone', function () {
        var ta = field('Hello', '');
        global.document.activeElement = null;
        composerFocus.finishWord(ta);
        assert.deepEqual(ta.node.events, []);
        assert.equal(global.document.activeElement, null);
    });

    it('does nothing before the field is rendered', function () {
        composerFocus.finishWord({ hasNode: function () { return null; } });
        composerFocus.finishWord(null);
    });
});

describe('composerFocus.keepFocus', function () {
    it('cancels the press, so the button does not take the focus', function () {
        var prevented = false;
        composerFocus.keepFocus(null, { preventDefault: function () { prevented = true; } });
        assert.equal(prevented, true);
        composerFocus.keepFocus(null, {});
        composerFocus.keepFocus(null, null);
    });
});
