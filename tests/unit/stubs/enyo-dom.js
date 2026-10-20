/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * enyo/dom, as much of it as the modules under test use: the window measurements, read live so
 * a test can resize between assertions.
 */

module.exports = {
    getWindowWidth: function () { return global.window.innerWidth; },
    getWindowHeight: function () { return global.window.innerHeight; }
};
