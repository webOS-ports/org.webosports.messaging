/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * The PACKED app laid out in a real browser engine, at a phone's window size.
 *
 * Whether a list can scroll is a fact about the laid-out page: a Scroller only scrolls when
 * FittableRows has given it less height than its rows need. The lists once stopped scrolling
 * altogether because MainView's fit child was sized taller than the screen - an absolutely
 * placed menu anchor declared after it made FittableRows add the child's own height back on each
 * reflow - so every list grew to its content and had nothing left to scroll. Nothing in the
 * sources looks wrong for that; only a layout pass shows it.
 *
 * Runs the packed page in headless Chromium (CHROMIUM, or `chromium` on the PATH) through its
 * inspector, with tests/device/cdp.js. Without a Chromium it skips rather than fails.
 *
 * Point MESSAGING_PACK_DIR at a directory produced by tests/pack.sh.
 */

var { describe, it, before, after } = require('node:test');
var assert = require('node:assert/strict');
var { spawn, execFileSync } = require('node:child_process');
var fs = require('node:fs');
var path = require('node:path');
var cdp = require('../device/cdp');

var PACK = process.env.MESSAGING_PACK_DIR;
var CHROMIUM = process.env.CHROMIUM || 'chromium';

// The Mindphone's card: a 480x800 panel less the status bar, as the device reports it.
var WIDTH = 480, HEIGHT = 723;

function haveChromium() {
    try {
        execFileSync(CHROMIUM, ['--version'], { stdio: 'ignore', timeout: 30000 });
        return true;
    } catch (e) {
        return false;
    }
}

var skip = !haveChromium() && ('no ' + CHROMIUM + ' to lay the page out in; set CHROMIUM');
var chrome, session;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/** Starts Chromium on a free inspector port and resolves to that port. */
function startChromium(profile) {
    chrome = spawn(CHROMIUM, ['--headless=new', '--remote-debugging-port=0',
        '--user-data-dir=' + profile, '--no-first-run', '--allow-file-access-from-files',
        'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    return new Promise(function (resolve, reject) {
        var seen = '';
        var timer = setTimeout(function () {
            reject(new Error('Chromium printed no inspector port: ' + seen));
        }, 30000);
        chrome.stderr.on('data', function (d) {
            seen += d;
            var m = /DevTools listening on ws:\/\/[^:]+:(\d+)/.exec(seen);
            if (m) { clearTimeout(timer); resolve(parseInt(m[1], 10)); }
        });
        chrome.on('error', function (e) { clearTimeout(timer); reject(e); });
    });
}

/** Heights of the controls the layout is about, by their enyo ids. */
function measure() {
    return session.evaluate('(function () {' +
        'function h(id) { var n = document.getElementById(id);' +
        '  return n ? { client: n.clientHeight, scroll: n.scrollHeight } : null; }' +
        'return { window: window.innerHeight, main: h("app_mainView"),' +
        '  views: h("app_mainView_views"),' +
        '  threads: h("app_mainView_messaging_threadList_scroller") };' +
        '})()');
}

describe('the packed page laid out at phone size', { skip: skip }, function () {
    before(async function () {
        assert.ok(PACK, 'set MESSAGING_PACK_DIR to a directory from tests/pack.sh');
        // Next to the pack rather than in a temp directory: it is a scratch profile for one run.
        var profile = path.join(path.dirname(PACK), 'chromium-profile');
        fs.rmSync(profile, { recursive: true, force: true });
        fs.mkdirSync(profile, { recursive: true });
        var port = await startChromium(profile);
        session = await cdp.attach(await cdp.waitForTarget(port, 'about:blank', 20000));
        await session.send('Emulation.setDeviceMetricsOverride',
            { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true });
        await session.send('Page.navigate',
            { url: 'file://' + path.join(PACK, 'index.html') });
        // The app renders from enyo/ready; wait for MainView rather than for a fixed time.
        for (var i = 0; i < 60; i++) {
            if (await session.evaluate('!!document.getElementById("app_mainView_views")')) { break; }
            await sleep(250);
        }
    });

    after(function () {
        if (session) { session.close(); }
        if (chrome) { chrome.kill(); }
    });

    it('renders the main view at the window size', async function () {
        var m = await measure();
        assert.ok(m.main, 'no main view in the page');
        assert.equal(m.main.client, HEIGHT);
    });

    // Each reflow made the views a screen taller, so check after a few of them, as a card gets
    // when the keyboard or the status bar changes its height.
    it('keeps the fit child inside the main view, reflow after reflow', async function () {
        for (var i = 0; i < 3; i++) {
            await session.evaluate('(window.dispatchEvent(new Event("resize")), true)');
            await sleep(300);
            var m = await measure();
            assert.ok(m.views, 'no views panel in the page');
            assert.ok(m.views.client <= m.main.client,
                'views is ' + m.views.client + 'px tall in a ' + m.main.client +
                'px main view after ' + (i + 1) + ' resize(s)');
        }
    });

    it('gives the thread list no more height than the screen has', async function () {
        var m = await measure();
        assert.ok(m.threads, 'no thread list scroller in the page');
        assert.ok(m.threads.client > 0, 'the thread list has no height at all');
        assert.ok(m.threads.client < m.window,
            'the thread list is ' + m.threads.client + 'px tall in a ' + m.window +
            'px window, so it can never scroll');
    });
});
