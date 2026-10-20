/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/formFactor.js - the one decision behind the whole layout: two panes, or the
 * single pane a phone had. It used to be `viewport width <= 800`, which gave the right answer
 * on the devices to hand only by luck, so the cases below are the real panels those devices
 * report, in both orientations.
 */

var { describe, it, beforeEach } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var Panels = require('./stubs/layout-panels');
var formFactor = bootstrap.load('util/formFactor.js');

// The panels as PalmSystem.deviceInfo reports them, read off the devices themselves.
var TOUCHPAD = [1024, 768],
    MINDPHONE = [480, 800],
    Q25 = [450, 450];

/** The window a device gives the app, less its status bar, in the stated orientation. */
function windowFor(panel, landscape) {
    var long = Math.max(panel[0], panel[1]), short = Math.min(panel[0], panel[1]);
    return landscape ? [long, short - 70] : [short, long - 77];
}

function on(panel, landscape) {
    bootstrap.asDevice(panel, windowFor(panel, landscape));
    formFactor._forget();
}

beforeEach(function () {
    formFactor._forget();
});

describe('what the device is', function () {
    it('calls the TouchPad a tablet', function () {
        on(TOUCHPAD, true);
        assert.equal(formFactor.isTablet(), true);
    });

    it('calls the MindPhone and the Q25 phones', function () {
        on(MINDPHONE, false);
        assert.equal(formFactor.isTablet(), false);
        on(Q25, true);
        assert.equal(formFactor.isTablet(), false);
    });

    it('does not call a long thin panel a tablet on its long edge alone', function () {
        // 1080 long, but only 480 across: a phone, however much of it there is.
        on([480, 1080], true);
        assert.equal(formFactor.isTablet(), false);
    });

    it('falls back to the screen when there is no PalmSystem', function () {
        bootstrap.asDevice(TOUCHPAD, [1024, 698]);
        delete global.window.PalmSystem;
        formFactor._forget();
        assert.equal(formFactor.isTablet(), true);
    });

    it('survives a deviceInfo that will not parse', function () {
        bootstrap.asDevice(TOUCHPAD, [1024, 698]);
        global.window.PalmSystem = { deviceInfo: 'not json' };
        formFactor._forget();
        assert.equal(formFactor.isTablet(), true, 'should have fallen back to the screen');
    });
});

describe('which layout that earns', function () {
    it('gives the TouchPad two panes in landscape', function () {
        on(TOUCHPAD, true);
        assert.equal(formFactor.isWide(), true);
    });

    it('gives the TouchPad one pane in portrait', function () {
        on(TOUCHPAD, false);
        assert.equal(formFactor.isWide(), false);
    });

    it('gives a phone one pane whichever way up it is', function () {
        on(MINDPHONE, false);
        assert.equal(formFactor.isWide(), false);
        on(MINDPHONE, true);
        assert.equal(formFactor.isWide(), false,
            'the MindPhone is exactly 800 wide in landscape - this is the case width alone got right by one pixel');
        on(Q25, true);
        assert.equal(formFactor.isWide(), false);
    });

    it('does not hand the tablet layout to a wide phone', function () {
        // The case the old `width <= 800` rule got wrong: a phone with room to spare sideways.
        on([540, 1200], true);
        assert.equal(formFactor.isLandscape(), true);
        assert.equal(formFactor.isWide(), false);
    });
});

describe('what it tells the rest of the app', function () {
    it('marks the control it is given, only in the wide layout', function () {
        var marks = {};
        var control = { addRemoveClass: function (c, on) { marks[c] = on; } };

        on(TOUCHPAD, true);
        assert.equal(formFactor.apply(control), true);
        assert.equal(marks['layout-wide'], true);

        on(TOUCHPAD, false);
        assert.equal(formFactor.apply(control), false);
        assert.equal(marks['layout-wide'], false);
    });

    it('does not mind being asked without a control', function () {
        on(TOUCHPAD, true);
        assert.equal(formFactor.apply(), true);
    });

    it('puts Panels\' narrow-screen test on the same rule', function () {
        on(MINDPHONE, true);
        formFactor.install();
        assert.equal(Panels.isNarrowDevice(), true, 'a phone in landscape is still narrow');

        on(TOUCHPAD, true);
        assert.equal(Panels.isNarrowDevice(), false, 'a tablet in landscape is not');

        on(TOUCHPAD, false);
        assert.equal(Panels.isNarrowDevice(), true, 'a tablet in portrait is');
    });
});
