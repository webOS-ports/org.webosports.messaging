/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Loads app/src modules in a plain node process.
 *
 * The app is built by enyo-dev, which resolves a bare "enyo/..." or "moment" against app/lib.
 * node knows nothing about that, so map the handful of library requires the modules under test
 * actually make. Anything else stays on node's own resolution, so a new library import in a
 * tested module shows up as a resolution failure rather than silently loading something else.
 */

var Module = require('node:module');
var path = require('node:path');

var APP = path.resolve(__dirname, '..', '..', 'app');

var LIBRARIES = {
    'enyo/i18n': path.join(__dirname, 'stubs', 'enyo-i18n.js'),
    'moment': path.join(APP, 'lib', 'moment', 'moment.js')
};

var resolve = Module._resolveFilename;
Module._resolveFilename = function (request) {
    if (Object.prototype.hasOwnProperty.call(LIBRARIES, request)) {
        return LIBRARIES[request];
    }
    return resolve.apply(this, arguments);
};

/*
 * messagingUtils hangs its inline-media callbacks off window when there is one, and
 * getEmojiBase() derives the image directory from window.location.href. Give it the href WAM
 * loads the packed app from, so the emoji assertions see the paths the device would.
 */
global.window = {
    location: { href: 'file:///usr/palm/applications/org.webosports.app.messaging/index.html' }
};

/** require() an app module by its path under app/src. */
exports.load = function (relative) {
    return require(path.join(APP, 'src', relative));
};

exports.APP = APP;
