/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * A stand-in palmbus, as luneos-synergy-connectors' tests/unit/lib/fakes.js has it:
 * new Handle(name); registerMethod; addListener("request", fn); call(uri, json) -> a request that
 * emits "response". onCall(uri, args) answers outgoing calls: an object is the reply, undefined
 * never replies. handle.request(method, payload) delivers a call as the hub would.
 */

"use strict";

var { EventEmitter } = require('node:events');

function fakePalmbus(onCall) {
    var handles = [];
    function Handle(name) {
        this.name = name;
        this.methods = [];
        this.listeners = {};
        this.calls = [];
        handles.push(this);
    }
    Handle.prototype.registerMethod = function (category, m) { this.methods.push(category + m); };
    Handle.prototype.addListener = function (ev, fn) { this.listeners[ev] = fn; };
    Handle.prototype.unregister = function () { this.unregistered = true; };
    Handle.prototype.call = function (uri, payload) {
        var req = new EventEmitter();
        var args = JSON.parse(payload);
        this.calls.push({ uri: uri, args: args });
        req.cancel = function () { req.cancelled = true; };
        setImmediate(async function () {
            var r = await onCall(uri, args);
            if (r === undefined) { return; }
            req.emit("response", { payload: function () { return JSON.stringify(r); } });
        });
        return req;
    };
    Handle.prototype.request = function (method, payload, caller) {
        caller = caller || {};
        var replies = [];
        var resolveFirst;
        var first = new Promise(function (r) { resolveFirst = r; });
        this.listeners.request({
            method: function () { return method; },
            payload: function () { return JSON.stringify(payload || {}); },
            applicationID: function () { return caller.appId || ""; },
            senderServiceName: function () { return caller.service || ""; },
            respond: function (text) { var v = JSON.parse(text); replies.push(v); if (replies.length === 1) { resolveFirst(v); } return true; }
        });
        return { replies: replies, first: first };
    };
    return { Handle: Handle, handles: handles };
}

// Ask and wait for the one reply.
async function ask(handle, method, payload, caller) {
    var r = handle.request(method, payload, caller);
    var v = await r.first;
    await new Promise(function (res) { setTimeout(res, 5); });
    if (r.replies.length !== 1) { throw new Error(method + ": " + r.replies.length + " replies"); }
    return v;
}

module.exports = { fakePalmbus, ask };
