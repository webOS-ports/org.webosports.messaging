/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * The sound a new message makes, in the two places that raise one: the app's DashboardManager
 * while the app runs, and the service's notifier while it does not.
 *
 * The rules are the legacy com.palm.app.messaging's (notification-assistant.js,
 * setNotificationSound and considerForNotification; chatview-assistant.js, considerForNotification):
 * the Alert preference picks soundClass "notifications" (with the ringtone's file when one is
 * chosen), "vibrate" or "none"; one batch makes one sound; the thread on screen gets the sound and
 * no toast; a muted chat, old history and Show Notifications off make none.
 */

"use strict";

var { describe, it, beforeEach } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var bootstrap = require('./bootstrap');

var messageAlerts = bootstrap.load('util/messageAlerts.js');
var appState = bootstrap.load('util/appState.js');
var DashboardManager = bootstrap.load('data/DashboardManager.js');
var alertsound = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'alertsound.js'));
var { createNotifier } = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'notify.js'));

var NOW = 1000000000000;
var SYSTEM = { soundClass: 'notifications' };
var TONE = '/media/internal/ringtones/Discreet.mp3';

// [ what it is, the prefs, the sound fields of the toast ]
var PREFS = [
    ['prefs not loaded yet', undefined, SYSTEM],
    ['a record with no choice in it', {}, SYSTEM],
    ['System Sound, as this app stores it', { notificationSound: 'system' }, SYSTEM],
    ['System Sound, as the legacy app stored it', { notificationSound: 'alert' }, SYSTEM],
    ['a ringtone', { notificationSound: 'ringtone', ringtone: { name: 'Discreet', path: TONE } },
        { soundClass: 'notifications', soundFile: TONE }],
    ['a ringtone as the TouchPad app stored it', { notificationSound: 'ringtone', ringtone: { name: 'Discreet', fullPath: TONE } },
        { soundClass: 'notifications', soundFile: TONE }],
    ['Ringtone with none picked', { notificationSound: 'ringtone', ringtone: {} }, SYSTEM],
    ['a ringtone that is not a path', { notificationSound: 'ringtone', ringtone: { path: 'Discreet.mp3' } }, SYSTEM],
    ['Vibrate', { notificationSound: 'vibrate' }, { soundClass: 'vibrate' }],
    ['Mute', { notificationSound: 'mute' }, { soundClass: 'none' }],
    ['a choice nobody knows', { notificationSound: 'loud' }, { soundClass: 'none' }]
];

describe('the sound a toast carries', function () {
    PREFS.forEach(function (c) {
        it(c[0] + ', in the app', function () {
            assert.deepEqual(messageAlerts.toastSound(c[1]), c[2]);
        });
        it(c[0] + ', in the service', function () {
            assert.deepEqual(alertsound.toastSound(c[1]), c[2]);
        });
    });

    it('is played on its own for the system sound and a ringtone, and not for vibrate or mute', function () {
        var feedback = { name: 'sysmgr_notification', sink: 'palerts' };
        assert.deepEqual(messageAlerts.feedbackSound({ notificationSound: 'system' }), feedback);
        assert.deepEqual(messageAlerts.feedbackSound({ notificationSound: 'ringtone', ringtone: { path: TONE } }), feedback);
        assert.equal(messageAlerts.feedbackSound({ notificationSound: 'vibrate' }), null);
        assert.equal(messageAlerts.feedbackSound({ notificationSound: 'mute' }), null);
    });
});

// --- the app ---------------------------------------------------------------------------------

function msg(id, thread, extra) {
    return Object.assign({
        _id: id, conversations: [thread], localTimestamp: NOW - 1000,
        from: { addr: '+15551234567', name: 'Alice' }, messageText: 'hi ' + id, flags: { read: false }
    }, extra || {});
}

describe('the app\'s alerts for a batch', function () {
    var dm, prefs, realNow;

    beforeEach(function () {
        prefs = { enableNotification: true, notificationSound: 'system', notifyMaxAgeMinutes: 60 };
        appState.prefsHandler = { getPrefs: function () { return prefs; } };
        appState.setSelectedThread(null);
        appState.setAppDeactivated(false);
        realNow = Date.now;
        Date.now = function () { return NOW; };
        dm = new DashboardManager();
        dm.gotMessages(null, { results: [] }); // the first answer only primes the seen set
    });

    function deliver(messages) {
        Date.now = function () { return NOW; };
        dm.gotMessages(null, { results: messages });
        Date.now = realNow;
        return { toasts: dm.$.createToast.sent.slice(), feedback: dm.$.playFeedback.sent.slice() };
    }

    function soundOf(toast) {
        var s = {};
        if ('soundClass' in toast) { s.soundClass = toast.soundClass; }
        if ('soundFile' in toast) { s.soundFile = toast.soundFile; }
        return s;
    }

    it('puts the chosen sound on the toast', function () {
        var out = deliver([msg('m1', 't1')]);
        assert.equal(out.toasts.length, 1);
        assert.deepEqual(soundOf(out.toasts[0]), SYSTEM);
        assert.equal(out.feedback.length, 0);
    });

    it('carries the ringtone\'s file', function () {
        prefs.notificationSound = 'ringtone';
        prefs.ringtone = { name: 'Discreet', path: TONE };
        assert.deepEqual(soundOf(deliver([msg('m1', 't1')]).toasts[0]), { soundClass: 'notifications', soundFile: TONE });
    });

    it('sends vibrate and mute as the legacy banner did', function () {
        prefs.notificationSound = 'vibrate';
        assert.deepEqual(soundOf(deliver([msg('m1', 't1')]).toasts[0]), { soundClass: 'vibrate' });
        prefs.notificationSound = 'mute';
        assert.deepEqual(soundOf(deliver([msg('m2', 't2')]).toasts[1]), { soundClass: 'none' });
    });

    it('makes one sound for a batch over several threads', function () {
        var out = deliver([msg('m1', 't1'), msg('m2', 't2'), msg('m3', 't3')]);
        assert.equal(out.toasts.length, 3);
        assert.deepEqual(soundOf(out.toasts[0]), SYSTEM);
        assert.deepEqual(soundOf(out.toasts[1]), {});
        assert.deepEqual(soundOf(out.toasts[2]), {});
    });

    it('raises one toast, with its sound, for a burst in one thread', function () {
        var out = deliver([msg('m1', 't1'), msg('m2', 't1')]);
        assert.equal(out.toasts.length, 1);
        assert.deepEqual(soundOf(out.toasts[0]), SYSTEM);
    });

    it('only plays the sound for the thread on screen', function () {
        appState.setSelectedThread({ _id: 't1' });
        var out = deliver([msg('m1', 't1')]);
        assert.equal(out.toasts.length, 0);
        assert.deepEqual(out.feedback, [{ name: 'sysmgr_notification', sink: 'palerts' }]);
    });

    it('toasts the thread on screen once the app is in the background', function () {
        appState.setSelectedThread({ _id: 't1' });
        appState.setAppDeactivated(true);
        var out = deliver([msg('m1', 't1')]);
        assert.equal(out.toasts.length, 1);
        assert.deepEqual(soundOf(out.toasts[0]), SYSTEM);
        assert.equal(out.feedback.length, 0);
    });

    it('lets a toast for another thread carry the batch\'s one sound', function () {
        appState.setSelectedThread({ _id: 't1' });
        var out = deliver([msg('m1', 't1'), msg('m2', 't2')]);
        assert.equal(out.toasts.length, 1);
        assert.equal(out.toasts[0].onclick.params.threadId, 't2');
        assert.deepEqual(soundOf(out.toasts[0]), SYSTEM);
        assert.equal(out.feedback.length, 0);
    });

    it('plays nothing on screen for mute or vibrate', function () {
        appState.setSelectedThread({ _id: 't1' });
        prefs.notificationSound = 'mute';
        assert.equal(deliver([msg('m1', 't1')]).feedback.length, 0);
        dm.lastToastAt = {};
        prefs.notificationSound = 'vibrate';
        assert.equal(deliver([msg('m2', 't1')]).feedback.length, 0);
        dm.lastToastAt = {};
        prefs.notificationSound = 'system';
        assert.equal(deliver([msg('m3', 't1')]).feedback.length, 1);
    });

    it('stays silent for a muted chat', function () {
        var out = deliver([msg('m1', 't1', { flags: { read: false, noNotification: true } })]);
        assert.equal(out.toasts.length, 0);
        assert.equal(out.feedback.length, 0);
    });

    it('stays silent for a muted chat on screen', function () {
        appState.setSelectedThread({ _id: 't1' });
        var out = deliver([msg('m1', 't1', { flags: { read: false, noNotification: true } })]);
        assert.equal(out.feedback.length, 0);
    });

    it('stays silent for back-filled history, unless the window is unlimited', function () {
        var old = { localTimestamp: NOW - 2 * 3600000 };
        assert.equal(deliver([msg('m1', 't1', old)]).toasts.length, 0);
        prefs.notifyMaxAgeMinutes = -1;
        var out = deliver([msg('m2', 't2', old)]);
        assert.equal(out.toasts.length, 1);
        assert.deepEqual(soundOf(out.toasts[0]), SYSTEM);
    });

    it('keeps to an hour when the record names no window', function () {
        delete prefs.notifyMaxAgeMinutes;
        assert.equal(deliver([msg('m1', 't1', { localTimestamp: NOW - 2 * 3600000 })]).toasts.length, 0);
    });

    it('stays silent with Show Notifications off, on screen or not', function () {
        prefs.enableNotification = false;
        appState.setSelectedThread({ _id: 't1' });
        var out = deliver([msg('m1', 't1'), msg('m2', 't2')]);
        assert.equal(out.toasts.length, 0);
        assert.equal(out.feedback.length, 0);
    });

    it('does not alert again for a message it has seen, or one already read', function () {
        deliver([msg('m1', 't1')]);
        dm.lastToastAt = {};
        var out = deliver([msg('m1', 't1'), msg('m2', 't2', { flags: { read: true } })]);
        assert.equal(out.toasts.length, 1);
    });

    it('gives an invitation the message sound, once a batch', function () {
        dm.gotInvites(null, { results: [] });
        dm.gotInvites(null, { results: [
            { _id: 'i1', accepted: 'pending', from: { addr: 'bob' }, conversations: ['t9'] },
            { _id: 'i2', accepted: 'pending', from: { addr: 'carol' }, conversations: ['t8'] }
        ] });
        var toasts = dm.$.createToast.sent;
        assert.equal(toasts.length, 2);
        assert.deepEqual(soundOf(toasts[0]), SYSTEM);
        assert.deepEqual(soundOf(toasts[1]), {});
    });

    it('holds an invitation back with Show Notifications off', function () {
        prefs.enableNotification = false;
        dm.gotInvites(null, { results: [] });
        dm.gotInvites(null, { results: [{ _id: 'i1', accepted: 'pending', from: { addr: 'bob' } }] });
        assert.equal(dm.$.createToast.sent.length, 0);
    });

    it('raises a failed send silently, as legacy did', function () {
        dm.notifyFailedMessage({ _id: 'm1', conversations: ['t1'], errorCategory: 'x' });
        assert.deepEqual(soundOf(dm.$.createToast.sent[0]), {});
    });
});

// --- the service -----------------------------------------------------------------------------

describe('the service\'s alerts for a batch', function () {
    function setup(opts) {
        opts = opts || {};
        var toasts = [];
        var calls = 0;
        var notifier = createNotifier({
            db: { find: function () { return Promise.resolve(opts.prefs ? [opts.prefs] : []); } },
            call: function (uri, payload) {
                if (uri.endsWith('/createToast')) {
                    calls++;
                    if (opts.failFirst && calls === 1) { return Promise.reject(new Error('UI is not yet ready')); }
                    toasts.push(payload);
                    return Promise.resolve({});
                }
                return Promise.resolve({ running: opts.running ? [{ id: 'org.webosports.app.messaging' }] : [] });
            },
            log: { error: function () {} },
            now: function () { return NOW; }
        });
        return { notifier: notifier, toasts: toasts };
    }

    function batch(threads, extra) {
        return new Map(threads.map(function (t) { return [t, Object.assign({ localTimestamp: NOW - 1000, messageText: 'hi' }, extra || {})]; }));
    }

    function threadsOf(ids) {
        return new Map(ids.map(function (t) { return [t, { displayName: 'Alice' }]; }));
    }

    async function run(ids, opts, extra) {
        var s = setup(opts);
        await s.notifier.notify(batch(ids, extra), threadsOf(ids));
        return s.toasts;
    }

    function soundOf(toast) {
        var s = {};
        if ('soundClass' in toast) { s.soundClass = toast.soundClass; }
        if ('soundFile' in toast) { s.soundFile = toast.soundFile; }
        return s;
    }

    it('puts the system sound on the toast by default', async function () {
        var toasts = await run(['t1']);
        assert.deepEqual(soundOf(toasts[0]), SYSTEM);
    });

    it('follows the Alert preference', async function () {
        for (var c of PREFS) {
            if (!c[1]) { continue; }
            var toasts = await run(['t1'], { prefs: c[1] });
            assert.deepEqual(soundOf(toasts[0]), c[2], c[0]);
        }
    });

    it('makes one sound for a batch over several threads', async function () {
        var toasts = await run(['t1', 't2', 't3']);
        assert.equal(toasts.length, 3);
        assert.deepEqual(soundOf(toasts[0]), SYSTEM);
        assert.deepEqual(soundOf(toasts[1]), {});
        assert.deepEqual(soundOf(toasts[2]), {});
    });

    it('passes the sound on when notificationmgr refuses the first toast', async function () {
        var toasts = await run(['t1', 't2'], { failFirst: true });
        assert.equal(toasts.length, 1);
        assert.deepEqual(soundOf(toasts[0]), SYSTEM);
    });

    it('leaves the sound to the app while the app runs', async function () {
        assert.equal((await run(['t1'], { running: true })).length, 0);
    });

    it('stays silent with Show Notifications off', async function () {
        assert.equal((await run(['t1'], { prefs: { enableNotification: false } })).length, 0);
    });

    it('stays silent for back-filled history', async function () {
        assert.equal((await run(['t1'], {}, { localTimestamp: NOW - 2 * 3600000 })).length, 0);
    });
});
