/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Just enough of the Chrome DevTools Protocol to ask a running web app questions.
 *
 * WAM is started with --remote-debugging-port=9998 on every LuneOS build, so the app that is
 * actually on screen can be evaluated in. That is the difference between "the app launched" and
 * "the app laid itself out the way it was meant to": the latter is a property of the live DOM.
 *
 * node 22 has WebSocket and fetch built in, so this needs nothing from npm.
 */

var { execFileSync } = require('node:child_process');

/** adb with a serial, returning stdout. */
function adb(serial, args, options) {
    return execFileSync('adb', ['-s', serial].concat(args),
        Object.assign({ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, options || {}));
}

/**
 * Forwards a free local port to the device's inspector and returns {port, close}. A fixed port
 * would collide with whatever forward is already set up for the device being worked on.
 */
function forwardInspector(serial) {
    var out = adb(serial, ['forward', 'tcp:0', 'tcp:9998']).trim();
    var port = parseInt(out, 10);
    if (!port) { throw new Error('adb forward gave no port: ' + out); }
    return {
        port: port,
        close: function () {
            try { adb(serial, ['forward', '--remove', 'tcp:' + port]); } catch (e) { /* gone */ }
        }
    };
}

/** The inspector target whose url contains `match`, or null while the app is still loading. */
async function findTarget(port, match) {
    var res = await fetch('http://127.0.0.1:' + port + '/json/list');
    var targets = await res.json();
    return targets.filter(function (t) {
        return t.type === 'page' && String(t.url).indexOf(match) !== -1;
    })[0] || null;
}

/** Polls for a target, because sam returns from /launch before the page is up. */
async function waitForTarget(port, match, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 20000);
    for (;;) {
        var target = await findTarget(port, match);
        if (target) { return target; }
        if (Date.now() > deadline) {
            throw new Error('no inspector target for ' + match + ' within ' + timeoutMs + 'ms');
        }
        await new Promise(function (r) { setTimeout(r, 500); });
    }
}

/** Opens a session on a target. `evaluate` returns the value of an expression in the page. */
async function attach(target) {
    var socket = new WebSocket(target.webSocketDebuggerUrl);
    var nextId = 1;
    var pending = new Map();

    await new Promise(function (resolve, reject) {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', function () {
            reject(new Error('could not open ' + target.webSocketDebuggerUrl));
        }, { once: true });
    });

    socket.addEventListener('message', function (event) {
        var frame = JSON.parse(event.data);
        var waiter = pending.get(frame.id);
        if (!waiter) { return; }
        pending.delete(frame.id);
        if (frame.error) { waiter.reject(new Error(frame.error.message)); }
        else { waiter.resolve(frame.result); }
    });

    function send(method, params) {
        var id = nextId++;
        return new Promise(function (resolve, reject) {
            pending.set(id, { resolve: resolve, reject: reject });
            socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
        });
    }

    return {
        send: send,

        /**
         * Evaluates an expression and returns its value. Objects come back by value, so the
         * caller gets plain data rather than a handle it would have to release.
         */
        evaluate: async function (expression) {
            var result = await send('Runtime.evaluate', {
                expression: '(function () { return (' + expression + '); })()',
                returnByValue: true,
                awaitPromise: true
            });
            if (result.exceptionDetails) {
                var ex = result.exceptionDetails;
                throw new Error('page threw: ' +
                    ((ex.exception && ex.exception.description) || ex.text));
            }
            return result.result.value;
        },

        /**
         * Taps an element, as a finger would: enyo synthesises its `ontap` from the mouse events
         * below, so going through Input rather than calling the handler exercises the real path.
         */
        tap: async function (selector) {
            var at = await this.evaluate(
                '(function () {' +
                '  var all = document.querySelectorAll(' + JSON.stringify(selector) + ');' +
                // Views that are not on screen stay in the dom at zero size, so the first match
                // is routinely the wrong one; take the first that has been laid out.
                '  for (var i = 0; i < all.length; i++) {' +
                '    var r = all[i].getBoundingClientRect();' +
                '    if (r.width && r.height) {' +
                '      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };' +
                '    }' +
                '  }' +
                '  return null;' +
                '}())');
            if (!at) { throw new Error('nothing to tap at ' + selector); }

            // WAM runs with touch enabled, and enyo's gesture layer binds touch rather than mouse
            // when it is - a dispatched mouse click reaches the dom but never becomes an `ontap`.
            var touch = await this.evaluate("'ontouchstart' in window");
            if (touch) {
                var point = [{ x: at.x, y: at.y, radiusX: 1, radiusY: 1, force: 1, id: 1 }];
                await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
                await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            } else {
                var common = { x: at.x, y: at.y, button: 'left', clickCount: 1, buttons: 1 };
                await send('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed' }, common));
                await send('Input.dispatchMouseEvent',
                    Object.assign({ type: 'mouseReleased' }, common, { buttons: 0 }));
            }
            return at;
        },

        close: function () { socket.close(); }
    };
}

module.exports = { adb: adb, forwardInspector: forwardInspector, waitForTarget: waitForTarget, attach: attach };
