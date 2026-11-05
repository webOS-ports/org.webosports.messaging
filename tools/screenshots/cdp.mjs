// Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
//
// SPDX-License-Identifier: Apache-2.0
//
// node cdp.mjs PORT STEP...
//
// Drives the first page of a Chromium started with --remote-debugging-port=PORT. Steps run in
// order:
//   size:W,H,DPR   viewport (and screen) in CSS px, with touch input
//   go:URL         load a page
//   wait:MS        sleep
//   tapt:TEXT      tap the innermost visible element whose whole text is TEXT
//   xy:X,Y         tap at CSS px X,Y
//   shot:FILE      save a PNG of the viewport
//
// Before every page load, the Prelude faces served from shotfonts/ are declared under the names
// the app's CSS asks for first (Helvetica Neue, Arial, ...). On a device none of those exist and
// fontconfig falls through to Prelude; on a desktop they do exist, so they are shadowed here.
import { writeFileSync } from 'node:fs';

const [port, ...steps] = process.argv.slice(2);
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const sock = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    sock.send(JSON.stringify({ id: i, method, params }));
});
sock.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
        console.error('page exception:', m.params.exceptionDetails.exception?.description ||
            m.params.exceptionDetails.text);
    }
    if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) { rej(new Error(JSON.stringify(m.error))); } else { res(m.result); }
    }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r) => sock.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');

const FONT_CSS = `
(function () {
    var faces = [["Prelude-Medium.ttf", "100 500", "normal"], ["Prelude-Bold.ttf", "600 900", "normal"],
                 ["Prelude-MediumOblique.ttf", "100 500", "italic"], ["Prelude-BoldOblique.ttf", "600 900", "italic"]];
    var names = ["Prelude", "Prelude Medium", "Helvetica Neue", "Nimbus Sans L", "Arial", "Helvetica", "Segoe UI"];
    var css = "";
    names.forEach(function (n) {
        faces.forEach(function (f) {
            css += "@font-face{font-family:'" + n + "';src:url(shotfonts/" + f[0] + ");font-weight:" + f[1] +
                   ";font-style:" + f[2] + "}";
        });
    });
    document.addEventListener("DOMContentLoaded", function () {
        var s = document.createElement("style");
        s.textContent = css;
        document.head.appendChild(s);
    });
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: FONT_CSS });

async function touch(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const step of steps) {
    const k = step.indexOf(':');
    const op = step.slice(0, k);
    const arg = step.slice(k + 1);
    if (op === 'size') {
        const [width, height, deviceScaleFactor] = arg.split(',').map(Number);
        await send('Emulation.setDeviceMetricsOverride', {
            width, height, screenWidth: width, screenHeight: height, deviceScaleFactor, mobile: true
        });
        await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    } else if (op === 'go') {
        await send('Page.navigate', { url: arg });
    } else if (op === 'wait') {
        await sleep(Number(arg));
    } else if (op === 'xy') {
        const [x, y] = arg.split(',').map(Number);
        await touch(x, y);
    } else if (op === 'tapt') {
        const r = await send('Runtime.evaluate', {
            returnByValue: true,
            expression: `(function () {
                var hits = [].filter.call(document.querySelectorAll("body *"), function (e) {
                    var b = e.getBoundingClientRect();
                    return b.width > 0 && b.height > 0 && e.textContent.trim() === ${JSON.stringify(arg)};
                });
                var e = hits[hits.length - 1];
                if (!e) { return null; }
                var b = e.getBoundingClientRect();
                return [b.left + b.width / 2, b.top + b.height / 2];
            })()`
        });
        if (!r.result.value) { console.error('tapt: no element reads ' + JSON.stringify(arg)); process.exit(1); }
        await touch(...r.result.value);
    } else if (op === 'shot') {
        const s = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(arg, Buffer.from(s.data, 'base64'));
        console.log(arg);
    } else {
        console.error('unknown step ' + step);
        process.exit(1);
    }
}
sock.close();
process.exit(0);
