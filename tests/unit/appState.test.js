/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/appState.js - the small shared state the rows consult while rendering. The rule
 * worth pinning down is isThreadOnScreen(), which is what suppresses an unread badge.
 */

var { describe, it, beforeEach } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var appState = bootstrap.load('util/appState.js');

beforeEach(function () {
    appState.setSelectedThread(null);
    appState.setAppDeactivated(false);
});

describe('appState.selectedThread', function () {
    it('round-trips the open thread and its id', function () {
        appState.setSelectedThread({ _id: 'thread-1' });
        assert.equal(appState.getSelectedThreadId(), 'thread-1');
    });

    it('normalizes anything falsy to null', function () {
        appState.setSelectedThread(undefined);
        assert.equal(appState.selectedThread, null);
        assert.equal(appState.getSelectedThreadId(), null);
    });
});

describe('appState.isThreadOnScreen', function () {
    it('is true only for the open thread in a foregrounded app', function () {
        appState.setSelectedThread({ _id: 'thread-1' });
        assert.equal(appState.isThreadOnScreen({ _id: 'thread-1' }), true);
        assert.equal(appState.isThreadOnScreen({ _id: 'thread-2' }), false);
    });

    it('is false once the app is in the background, so the badge comes back', function () {
        appState.setSelectedThread({ _id: 'thread-1' });
        appState.setAppDeactivated(true);
        assert.equal(appState.isThreadOnScreen({ _id: 'thread-1' }), false);
    });

    it('is false with no thread open, and never throws on a missing argument', function () {
        assert.equal(appState.isThreadOnScreen({ _id: 'thread-1' }), false);
        assert.equal(appState.isThreadOnScreen(undefined), false);
        assert.equal(appState.isThreadOnScreen(null), false);
    });

    it('coerces the deactivated flag to a boolean', function () {
        appState.setAppDeactivated('yes');
        assert.equal(appState.getAppDeactivated(), true);
        appState.setAppDeactivated(undefined);
        assert.equal(appState.getAppDeactivated(), false);
    });
});
