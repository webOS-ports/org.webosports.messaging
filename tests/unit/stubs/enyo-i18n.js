/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stand-in for enyo/i18n.
 *
 * The real module (app/lib/enyo/src/i18n.js) requires enyo's dispatcher and Signals, which
 * reach for document on load, so it cannot be pulled into a plain node process. $L is the only
 * thing the modules under test take from it, and with no i18n library loaded enyo's own $L is
 * documented to return its argument unchanged - which is exactly what this does.
 */

exports.$L = function (str) {
    return str;
};
