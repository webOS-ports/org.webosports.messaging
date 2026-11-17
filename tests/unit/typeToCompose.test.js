/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/typeToCompose.js - typing on a hardware keyboard goes to the message field.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var typeToCompose = bootstrap.load('util/typeToCompose.js');

function key(k, extra) {
    return Object.assign({ key: k, ctrlKey: false, altKey: false, metaKey: false,
        defaultPrevented: false, isComposing: false }, extra || {});
}
var body = { tagName: "BODY" };

describe('typeToCompose', function () {
    it('takes a letter typed on the page', function () {
        assert.equal(typeToCompose(key("h"), body), true);
    });
    it('takes digits, punctuation and accented letters', function () {
        ["7", "?", "é", "ß"].forEach(function (k) {
            assert.equal(typeToCompose(key(k), body), true, k);
        });
    });
    it('takes an emoji from a surrogate pair', function () {
        assert.equal(typeToCompose(key("😀"), body), true);
    });
    it('takes typing with no target at all', function () {
        assert.equal(typeToCompose(key("a"), null), true);
    });
    it('leaves named keys alone', function () {
        ["Enter", "Tab", "Escape", "ArrowUp", "Backspace", "Shift", "F5", "Unidentified"].forEach(function (k) {
            assert.equal(typeToCompose(key(k), body), false, k);
        });
    });
    it('leaves Space alone', function () {
        assert.equal(typeToCompose(key(" "), body), false);
    });
    it('leaves shortcuts alone', function () {
        assert.equal(typeToCompose(key("c", { ctrlKey: true }), body), false);
        assert.equal(typeToCompose(key("f", { altKey: true }), body), false);
        assert.equal(typeToCompose(key("v", { metaKey: true }), body), false);
    });
    it('leaves a key someone already handled', function () {
        assert.equal(typeToCompose(key("a", { defaultPrevented: true }), body), false);
    });
    it('leaves an IME composition alone', function () {
        assert.equal(typeToCompose(key("a", { isComposing: true }), body), false);
    });
    it('does not steal from a field that has focus', function () {
        [{ tagName: "INPUT" }, { tagName: "textarea" }, { tagName: "SELECT" }, { tagName: "BUTTON" },
            { tagName: "DIV", isContentEditable: true }].forEach(function (t) {
            assert.equal(typeToCompose(key("a"), t), false, t.tagName);
        });
    });
    it('ignores a missing event', function () {
        assert.equal(typeToCompose(null, body), false);
    });
});
