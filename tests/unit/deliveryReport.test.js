/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/deliveryReport.js - asking for an SMS delivery report when Preferences say so,
 * and the receipt icon a message shows for what came back.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var bootstrap = require('./bootstrap');

var dr = bootstrap.load('util/deliveryReport.js');

describe('deliveryReport: asking for one', function () {
    it('an SMS asks when the setting is on', function () {
        assert.equal(dr.wanted("sms", { smsDeliveryReports: true }), true);
    });
    it('off, unset or not a plain true: no', function () {
        assert.equal(dr.wanted("sms", { smsDeliveryReports: false }), false);
        assert.equal(dr.wanted("sms", {}), false);
        assert.equal(dr.wanted("sms", { smsDeliveryReports: "true" }), false);
        assert.equal(dr.wanted("sms", null), false);
        assert.equal(dr.wanted("sms", undefined), false);
    });
    it('only SMS: MMS and the IM transports have receipts of their own', function () {
        var on = { smsDeliveryReports: true };
        assert.equal(dr.wanted("mms", on), false);
        assert.equal(dr.wanted("type_telegram", on), false);
        assert.equal(dr.wanted(undefined, on), false);
    });
});

describe('deliveryReport: the receipt icon', function () {
    it('an outgoing message shows what came back', function () {
        assert.equal(dr.receiptIcon("delivered", true), "assets/msg-delivered.svg");
        assert.equal(dr.receiptIcon("read", true), "assets/msg-read.svg");
        assert.equal(dr.receiptIcon("undelivered", true), "assets/msg-undelivered.svg");
    });
    it('nothing yet, or something unknown: no icon', function () {
        assert.equal(dr.receiptIcon(undefined, true), null);
        assert.equal(dr.receiptIcon("", true), null);
        assert.equal(dr.receiptIcon("sent", true), null);
    });
    it('incoming messages show none', function () {
        assert.equal(dr.receiptIcon("delivered", false), null);
        assert.equal(dr.receiptIcon("undelivered", false), null);
    });
    it('every icon it names is in the app', function () {
        ["read", "delivered", "undelivered"].forEach(function (s) {
            var file = path.resolve(__dirname, '..', '..', 'app', dr.receiptIcon(s, true));
            assert.ok(fs.existsSync(file), file);
        });
    });
});
