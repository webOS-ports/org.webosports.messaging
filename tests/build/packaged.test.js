/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Assertions about the PACKED app, not its sources.
 *
 * enyo pack --production inlines every module and every stylesheet into one index.html, and that
 * inlining is a step the source tests cannot see through. It has already shipped a blank app
 * once: a string literal holding a bare script-end sequence closed the inline script element
 * early, and everything after it was discarded as markup. Nothing in app/src was wrong.
 *
 * Point MESSAGING_PACK_DIR at a directory produced by tests/pack.sh.
 */

var { describe, it, before } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var PACK = process.env.MESSAGING_PACK_DIR;
var html, appinfo;

before(function () {
    assert.ok(PACK, 'set MESSAGING_PACK_DIR to a directory from tests/pack.sh');
    html = fs.readFileSync(path.join(PACK, 'index.html'), 'utf8');
    appinfo = JSON.parse(fs.readFileSync(path.join(PACK, 'appinfo.json'), 'utf8'));
});

/** The one inline script element: from the end of the first opening tag to the single closer. */
function inlineScript() {
    var open = html.indexOf('<script');
    assert.notEqual(open, -1, 'no script element in the packed page');
    var body = html.indexOf('>', open) + 1;
    var close = html.indexOf('</script>', body);
    assert.notEqual(close, -1, 'the script element is never closed');
    return html.slice(body, close);
}

/**
 * Removes every @media block, so what is left is the CSS that applies at any width. Brace
 * counting rather than a regex: the blocks nest.
 */
function cssOutsideMediaQueries(css) {
    var out = '', i = 0;
    while (i < css.length) {
        var at = css.indexOf('@media', i);
        if (at === -1) { return out + css.slice(i); }
        out += css.slice(i, at);
        var brace = css.indexOf('{', at);
        if (brace === -1) { return out; }
        var depth = 1, j = brace + 1;
        while (j < css.length && depth > 0) {
            if (css[j] === '{') { depth++; }
            else if (css[j] === '}') { depth--; }
            j++;
        }
        i = j;
    }
    return out;
}

describe('the packed page', function () {
    it('is one self-contained file with the app inlined into it', function () {
        assert.ok(html.length > 100000, 'packed page is suspiciously small: ' + html.length);
        assert.match(html, /<style/, 'no inlined stylesheet');
        assert.match(html, /<script/, 'no inlined script');
    });

    it('closes its script element exactly once', function () {
        // A second one means a string literal in the bundle ended the element early. The opening
        // tag is not counted: "<script[^>]*>" legitimately appears inside the tag-stripping regex.
        var closers = html.split('</script').length - 1;
        assert.equal(closers, 1, 'expected one script-end sequence, found ' + closers);
    });

    it('holds a script the engine can actually parse', function () {
        // Compiling, not running: this is the check that catches any corruption of the bundle,
        // whatever its cause, which is what the early-close bug amounted to.
        var source = inlineScript();
        assert.ok(source.length > 100000, 'inline script is truncated: ' + source.length);
        assert.doesNotThrow(function () {
            new vm.Script(source, { filename: 'index.html' });
        });
    });

    it('still contains the app itself, not just the framework', function () {
        assert.match(html, /messaging\.MainView/);
        assert.match(html, /Your conversation list is empty/);
    });
});

describe('the packed stylesheet', function () {
    it('pins the thread-list column only where there is room for two panes', function () {
        // Unscoped, this rule overrode enyo-panels-fit-narrow and kept the two-pane arrangement on
        // a phone: on a 450px viewport the list took 320px and the conversation got the other 130.
        var style = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        var always = cssOutsideMediaQueries(style);
        assert.doesNotMatch(always, /\.messaging-pane\s*{[^}]*width\s*:\s*320px/,
            '.messaging-pane is given a fixed width at every screen size');
        assert.match(style, /@media[^{]*min-width\s*:\s*801px[^{]*{[^}]*\.messaging-pane/,
            'no wide-screen media query for .messaging-pane');
    });
});

describe('the packed appinfo', function () {
    it('identifies the app the way sam and the LS2 role files do', function () {
        assert.equal(appinfo.id, 'org.webosports.app.messaging');
        assert.equal(appinfo.type, 'web');
        assert.equal(appinfo.main, 'index.html');
    });

    it('requests every ACG the app calls out to', function () {
        // Dropping one of these is silent until a call is denied at runtime.
        ['accountsservice.management', 'accountsservice.operation', 'database.operation',
            'messaging-service.operation', 'notification.management', 'notification.operation',
            'tempdatabase.operation', 'audio.operation', 'settings.query', 'tts.operation'
        ].forEach(function (acg) {
            assert.ok(appinfo.requiredPermissions.indexOf(acg) !== -1, 'missing ACG: ' + acg);
        });
    });

    it('ships the icon and the emoji images the bundle points at', function () {
        assert.ok(fs.existsSync(path.join(PACK, appinfo.icon)), 'no ' + appinfo.icon);
        assert.ok(fs.existsSync(path.join(PACK, 'assets', 'emoji', '1f62d.png')),
            'no emoji images next to the app');
    });

    it('leaves the browser-only mock data out of the shipped assets', function () {
        assert.ok(!fs.existsSync(path.join(PACK, 'mock')), 'the mock directory was packed');
    });
});
