/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * A finger dragged across the PACKED app, in a real browser engine with touch on.
 *
 * Enyo 2.7 listens for touchmove on the document and calls preventDefault() on it so the fitted
 * body does not pan under the finger. Chrome makes a document touch listener passive unless it
 * asks not to be, and Enyo's does not ask, so on the device every one of those calls was ignored
 * and WAM logged "Unable to preventDefault inside passive event listener" twice per touchmove -
 * some 3000 lines in an afternoon. index.tpl now asks for the non-passive listener before the
 * bundle loads. A passive listener cannot cancel the event, so whether the move ends up
 * defaultPrevented is the test.
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

var WIDTH = 480, HEIGHT = 723;

function haveChromium() {
    try {
        execFileSync(CHROMIUM, ['--version'], { stdio: 'ignore', timeout: 30000 });
        return true;
    } catch (e) {
        return false;
    }
}

var skip = !haveChromium() && ('no ' + CHROMIUM + ' to run the page in; set CHROMIUM');
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

function touch(type, x, y) {
    return session.send('Input.dispatchTouchEvent', {
        type: type,
        touchPoints: type === 'touchEnd' ? [] :
            [{ x: x, y: y, radiusX: 1, radiusY: 1, force: 1, id: 1 }]
    });
}

describe('a finger dragged across the packed page', { skip: skip }, function () {
    before(async function () {
        assert.ok(PACK, 'set MESSAGING_PACK_DIR to a directory from tests/pack.sh');
        var profile = path.join(path.dirname(PACK), 'chromium-profile-touch');
        fs.rmSync(profile, { recursive: true, force: true });
        fs.mkdirSync(profile, { recursive: true });
        var port = await startChromium(profile);
        session = await cdp.attach(await cdp.waitForTarget(port, 'about:blank', 20000));
        // Touch has to be on before the page loads: Enyo decides at load whether to bind
        // touch or mouse, and binds the document touch listeners only for touch.
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        await session.send('Emulation.setDeviceMetricsOverride',
            { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true });
        await session.send('Page.navigate',
            { url: 'file://' + path.join(PACK, 'index.html') });
        for (var i = 0; i < 60; i++) {
            if (await session.evaluate('!!document.getElementById("app_mainView_views")')) { break; }
            await sleep(250);
        }
    });

    after(function () {
        if (session) { session.close(); }
        if (chrome) { chrome.kill(); }
    });

    it('runs with touch, so Enyo bound its document touch listeners', async function () {
        assert.equal(await session.evaluate("'ontouchstart' in window"), true);
    });

    it('lets Enyo cancel the touchmoves it means to cancel', async function () {
        // Added after Enyo's, on the same target and phase, so it runs after Enyo's handler
        // and sees what that handler did to the event.
        await session.evaluate('(function () {' +
            '  window.__moves = [];' +
            '  document.addEventListener("touchmove", function (e) {' +
            '    window.__moves.push({ cancelable: e.cancelable, prevented: e.defaultPrevented });' +
            '  });' +
            '  return true;' +
            '}())');

        var x = WIDTH / 2, y = HEIGHT / 2;
        await touch('touchStart', x, y);
        for (var step = 1; step <= 5; step++) {
            await touch('touchMove', x, y - step * 20);
        }
        await touch('touchEnd');

        var moves = await session.evaluate('window.__moves');
        assert.ok(moves.length > 0, 'no touchmove reached the document');
        var cancelable = moves.filter(function (m) { return m.cancelable; });
        assert.ok(cancelable.length > 0, 'none of the touchmoves could be cancelled at all');
        assert.ok(cancelable.some(function (m) { return m.prevented; }),
            'Enyo called preventDefault() on ' + cancelable.length + ' cancelable touchmove(s) ' +
            'and none of them took: its document listener is passive');
    });
});
