/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enyo's document touch listeners can cancel the touch again.
 *
 * Enyo 2.7 (src/touch.js) listens for touchstart and touchmove on the document with a bare
 * `false` and calls preventDefault() on each touchmove to keep the fitted body from panning
 * under the finger; its drag handling cancels the same moves. Chrome 56 and later make a touch
 * listener on the document, the window or the root elements passive unless the listener says
 * otherwise, so those calls did nothing and WAM logged "Unable to preventDefault inside passive
 * event listener" twice per touchmove - some 3000 lines in an afternoon.
 *
 * So a touchstart/touchmove listener added to one of those targets without listener options is
 * added as {passive: false}, the way it was before that change and the way Enyo was written for.
 * Listeners that pass their own options object are left as they are. This has to run before
 * Enyo's touch module binds its listeners, which is why index.js requires it first.
 */

var TOUCH_TYPES = { touchstart: true, touchmove: true };

/** Whether the engine reads the `passive` member of a listener options object. */
function passiveSupported(win) {
    var supported = false;
    try {
        var probe = Object.defineProperty({}, "passive", {
            get: function () { supported = true; return false; }
        });
        win.addEventListener("touchlisteners-probe", null, probe);
        win.removeEventListener("touchlisteners-probe", null, probe);
    } catch (e) {
        return false;
    }
    return supported;
}

/** The options to add a listener with: non-passive for a bare document-level touch listener. */
function optionsFor(win, target, type, options) {
    if (!TOUCH_TYPES[type] || (options !== undefined && typeof options !== "boolean")) {
        return options;
    }
    var doc = win.document;
    if (target !== win && target !== doc &&
            target !== (doc && doc.documentElement) && target !== (doc && doc.body)) {
        return options;
    }
    return { capture: !!options, passive: false };
}

/** Wraps addEventListener on win (the page's window by default), once. */
function install(win) {
    win = win || (typeof window !== "undefined" ? window : null);
    if (!win || !win.EventTarget || win.__messagingTouchListeners || !passiveSupported(win)) {
        return false;
    }
    win.__messagingTouchListeners = true;
    var proto = win.EventTarget.prototype;
    var add = proto.addEventListener;
    proto.addEventListener = function (type, listener, options) {
        return add.call(this, type, listener, optionsFor(win, this, type, options));
    };
    return true;
}

module.exports = { install: install, optionsFor: optionsFor, passiveSupported: passiveSupported };
