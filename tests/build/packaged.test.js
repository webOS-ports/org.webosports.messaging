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
    it('pins the thread-list column only in the wide layout', function () {
        // Unscoped, this rule overrode enyo-panels-fit-narrow and kept the two-pane arrangement on
        // a phone: on a 450px viewport the list took 320px and the conversation got the other 130.
        // The scope is util/formFactor's body class, not a width query - a phone turned on its
        // side is still a phone, and the MindPhone's 480x800 panel is exactly 800 wide in
        // landscape, so a `min-width: 801px` gate held only by a single pixel.
        var style = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        var always = cssOutsideMediaQueries(style);
        // every rule that gives the pane its column has to be scoped to the wide layout
        var columnRules = always.match(/[^{}]*\.messaging-pane[^{}]*{[^}]*}/g) || [];
        var unscoped = columnRules.filter(function (rule) {
            return /width\s*:\s*320px/.test(rule) &&
                rule.split('{')[0].split(',').some(function (sel) {
                    return /\.messaging-pane/.test(sel) && !/\.layout-wide/.test(sel);
                });
        });
        assert.deepEqual(unscoped, [],
            '.messaging-pane is given its column whatever the device: ' + unscoped.join(' '));
        assert.match(style, /\.layout-wide\s+\.messaging-pane\s*{[^}]*width\s*:\s*320px/,
            'no .layout-wide rule giving .messaging-pane its column');
    });

    it('does not gate the layout on viewport width any more', function () {
        var style = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
        assert.doesNotMatch(style, /@media[^{]*min-width\s*:\s*801px[^{]*{[^}]*\.messaging-pane/,
            '.messaging-pane is still scoped to a width media query');
    });
});

describe('the packed appinfo', function () {
    it('identifies the app the way sam and the LS2 role files do', function () {
        assert.equal(appinfo.id, 'org.webosports.app.messaging');
        assert.equal(appinfo.type, 'web');
        assert.equal(appinfo.main, 'index.html');
    });

    it('is trusted, so WAM lets it read the account templates\' icons', function () {
        // Every IM template points its icon at /usr/palm/public/accounts/<service>/images/...
        // A web app at the default trust level cannot read a file:// outside its own directory:
        // loading one from this app on a MindPhone is refused with ERR_BLOCKED_BY_CLIENT, while
        // the same URL loads from com.palm.app.accounts, which is trusted. Without this every
        // service badge - thread rows, server rows, the Preferences list - falls back.
        assert.equal(appinfo.trustLevel, 'trusted');
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

    it('ships every asset the packed app asks for', function () {
        // A renamed or retyped asset is silent: the reference just 404s on the device and the
        // glyph is missing. The artwork is SVG, so a stale .png reference is exactly that case.
        var missing = [];
        var seen = {};
        var pattern = /assets\/[A-Za-z0-9_@.\/-]+\.(?:svg|png|jpg|gif)/g;
        var match;
        while ((match = pattern.exec(html)) !== null) {
            var ref = match[0];
            if (seen[ref]) { continue; }
            seen[ref] = true;
            if (!fs.existsSync(path.join(PACK, ref))) { missing.push(ref); }
        }
        assert.ok(Object.keys(seen).length > 10, 'found almost no asset references to check');
        assert.deepEqual(missing, []);
    });

    it('draws its artwork from vectors, so a denser screen costs nothing', function () {
        var svgs = fs.readdirSync(path.join(PACK, 'assets'))
            .filter(function (f) { return f.endsWith('.svg'); });
        assert.ok(svgs.length >= 20, 'only ' + svgs.length + ' svg assets were packed');
    });

    it('leaves the browser-only mock data out of the shipped assets', function () {
        assert.ok(!fs.existsSync(path.join(PACK, 'mock')), 'the mock directory was packed');
    });

    it('packs the LuneOS event plumbing, not just the handlers that want it', function () {
        // MainView declares {kind: Signals, onbackgesture: "goBack", onwebOSRelaunch: ...}, but
        // those events only reach Signals if the enyo-luneos PACKAGE index ran. Its index.js
        // installs the keyup-27 -> `backgesture` emulation (via LuneOS/LuneOS.js) and the
        // document -> Signals forwarding for backgesture, activate, deactivate, menubutton,
        // virtualkeyboard, appshow, apphide and lowmemory, and it requires enyo-webos for
        // webOSLaunch/webOSRelaunch.
        //
        // Requiring enyo-webos/LunaService and friends - all this app used to do - loads those
        // modules without running either package index, so none of the listeners existed. The
        // shipped bundle contained MainView's onbackgesture handler and nothing that could ever
        // fire it, so on a phone (where picking a thread slides the conversation over the list)
        // there was no way back out of a conversation at all.
        //
        // Assert on what only the package index drags in, and keep it minification-proof by
        // matching string literals rather than function names: the packer renamed
        // fireDocumentEvent to a single letter, so the dispatch reads `e("backgesture",t)`.
        // Do NOT assert on webOSRelaunch or webOSLocaleChange - enyo-webos/src/Events.js was
        // already present in the broken bundle, unexecuted, so its strings prove nothing.
        assert.ok(html.indexOf('("backgesture"') !== -1 || html.indexOf("('backgesture'") !== -1,
            'the keyup -> backgesture emulation is absent: enyo-luneos is not required');
        assert.ok(html.indexOf('apphide') !== -1 && html.indexOf('lowmemory') !== -1,
            'the enyo-luneos document -> Signals forwarding is absent');

        // Shipping the code is not enough: LuneOS.js gates the whole block on
        // webOS.platform.{legacy,open,luneos}, and sets luneos only from a user agent that says
        // "luneos". This WAM's does not ("... Safari/537.36 WebAppManager"), so platform comes
        // back {} and the guard is false even with the package required. index.js corrects the
        // flag from window.PalmSystem before enyo-luneos reads it; without that the bundle
        // contains a listener that is never installed.
        assert.ok(/window\.webOS\.platform\.luneos\s*=/.test(html),
            'index.js no longer forces webOS.platform.luneos, so the UA gate will win');
    });
});
