/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stand-in for enyo-webos/LunaService (and enyo/Component, which only has to exist): each
 * component enyo-kind.js builds records what it was asked to send, so a test can read back the
 * exact payload a call would have put on the bus.
 */

"use strict";

exports.instance = function (decl) {
    return {
        name: decl.name,
        service: decl.service,
        method: decl.method,
        activeRequests: [],
        sent: [],
        send: function (params) {
            this.sent.push(params);
            return {};
        },
        cancel: function () {}
    };
};
