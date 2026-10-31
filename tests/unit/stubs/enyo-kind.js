/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stand-in for enyo/kind, enough to construct a non-visual Component in node.
 *
 * The real kind() pulls in enyo's whole object model, which reaches for document on load. This
 * builds a constructor from the kind's own properties, gives it a this.$ holding one recording
 * stand-in per declared component (see enyo-webos-lunaservice.js), and runs create(). The
 * inherited() calls the kinds make go nowhere: Component's own create and destroy do nothing a
 * test looks at.
 */

"use strict";

var LunaService = require('./enyo-webos-lunaservice.js');

module.exports = function kind(props) {
    function Ctor() {
        var self = this;
        this.$ = {};
        (props.components || []).forEach(function (c) {
            self.$[c.name] = LunaService.instance(c);
        });
        this.create();
    }
    Object.keys(props).forEach(function (k) {
        if (k !== 'components') { Ctor.prototype[k] = props[k]; }
    });
    Ctor.prototype.inherited = function () {};
    Ctor.prototype.warn = function () {};
    Ctor.prototype.log = function () {};
    Ctor.prototype.error = function () {};
    if (!Ctor.prototype.create) { Ctor.prototype.create = function () {}; }
    return Ctor;
};
