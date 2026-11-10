/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * The icon a message's toast shows, in the two places that raise one: the app's DashboardManager
 * while the app runs, and the service's notifier while it does not. The shell stacks the toasts
 * by protocol, and a stack shows its toasts' icon, so each protocol's toasts carry the icon its
 * account template gives it - SMS its bubble, Telegram Telegram's - and Messaging's otherwise.
 *
 * unit/service/icon-accounts holds templates shaped as the device's: icon paths relative to the
 * template's folder, a single object rather than a list (com.palm.palmprofile), an SMS provider
 * that names no serviceName, an icon with only its 32x32, one whose file is not there, and a file
 * that does not parse.
 */

"use strict";

var { describe, it, beforeEach, afterEach } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var bootstrap = require('./bootstrap');

var appState = bootstrap.load('util/appState.js');
var DashboardManager = bootstrap.load('data/DashboardManager.js');
var toasticon = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'toasticon.js'));
var { createNotifier } = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'notify.js'));

var DIR = path.join(__dirname, 'service', 'icon-accounts');
var APP_ICON = '/usr/palm/applications/org.webosports.app.messaging/assets/notification-large-messaging.png';
var FAILED_ICON = '/usr/palm/applications/org.webosports.app.messaging/assets/notification-large-failed.png';
var NOW = 1000000000000;

function quietLog(errors) {
    return { log: function () {}, error: function (e) { errors.push(String(e)); } };
}

describe('the service reads each protocol\'s icon from its template', function () {
    var errors, icons;

    beforeEach(function () {
        errors = [];
        icons = toasticon.readIcons([DIR, path.join(DIR, 'missing')], quietLog(errors));
    });

    it('finds the 48x48 of the MESSAGING provider, in the template\'s folder', function () {
        assert.equal(icons.get('type_telegram'), path.join(DIR, 'com.palm.telegram', 'images', 'telegram-48x48.png'));
    });

    it('takes the SMS provider for the sms group, though it names no serviceName', function () {
        assert.equal(icons.get('sms'), path.join(DIR, 'com.palm.palmprofile', 'images', 'sms-48x48.png'));
    });

    it('makes do with a 32x32', function () {
        assert.equal(icons.get('type_whatsapp'), path.join(DIR, 'com.palm.whatsapp', 'images', 'whatsapp-32x32.png'));
    });

    it('leaves out an icon whose file is not there, and a file that does not parse', function () {
        assert.equal(icons.has('type_teams'), false);
        assert.deepEqual(Array.from(icons.keys()).sort(), ['sms', 'type_telegram', 'type_whatsapp']);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /com\.palm\.broken\.json/);
    });

    it('keeps the first template that names a protocol', function () {
        var twice = toasticon.readIcons([DIR, DIR], quietLog([]));
        assert.equal(twice.get('type_telegram'), icons.get('type_telegram'));
    });

    it('gives a protocol it has no icon for Messaging\'s', function () {
        assert.equal(toasticon.iconFor(icons, 'type_teams'), APP_ICON);
        assert.equal(toasticon.iconFor(icons, 'type_irc'), APP_ICON);
        assert.equal(toasticon.iconFor(null, 'sms'), APP_ICON);
        assert.equal(toasticon.iconFor(icons, 'type_telegram'), icons.get('type_telegram'));
    });
});

describe('the service\'s toasts carry their protocol\'s icon', function () {
    function notify(messages, templateDirs) {
        var toasts = [];
        var notifier = createNotifier({
            db: { find: function () { return Promise.resolve([]); }, merge: function () { return Promise.resolve(); } },
            call: function (uri, payload) {
                if (uri.endsWith('/createToast')) { toasts.push(payload); return Promise.resolve({}); }
                return Promise.resolve({ running: [] });
            },
            log: quietLog([]),
            now: function () { return NOW; },
            templateDirs: templateDirs
        });
        var newest = new Map(), threads = new Map();
        messages.forEach(function (m, i) {
            newest.set('t' + i, Object.assign({ localTimestamp: NOW - 1000, messageText: 'hi' }, m));
            threads.set('t' + i, { displayName: 'Alice' });
        });
        return notifier.notify(newest, threads).then(function () { return toasts; });
    }

    it('one icon a protocol, and Messaging\'s for one with none', async function () {
        var toasts = await notify([{ serviceName: 'sms' }, { serviceName: 'type_telegram' }, { serviceName: 'mms' },
            { serviceName: 'type_teams' }], [DIR]);
        assert.deepEqual(toasts.map(function (t) { return [t.groupId, t.iconUrl]; }), [
            ['sms', path.join(DIR, 'com.palm.palmprofile', 'images', 'sms-48x48.png')],
            ['type_telegram', path.join(DIR, 'com.palm.telegram', 'images', 'telegram-48x48.png')],
            ['sms', path.join(DIR, 'com.palm.palmprofile', 'images', 'sms-48x48.png')],
            ['type_teams', APP_ICON]
        ]);
    });

    it('Messaging\'s for all, with no templates to be found', async function () {
        var toasts = await notify([{ serviceName: 'type_telegram' }], [path.join(DIR, 'missing')]);
        assert.equal(toasts[0].iconUrl, APP_ICON);
    });
});

describe('the app\'s toasts carry their protocol\'s icon', function () {
    var dm, realNow, savedAccounts, asked;

    beforeEach(function () {
        appState.prefsHandler = { getPrefs: function () { return { enableNotification: true, notifyMaxAgeMinutes: 60 }; } };
        appState.setSelectedThread(null);
        appState.setAppDeactivated(false);
        savedAccounts = appState.accountService;
        asked = [];
        // AccountService.getIconPath as it answers: the accounts service's absolute path, or null.
        appState.accountService = {
            getIconPath: function (serviceName) {
                asked.push(serviceName);
                return { sms: '/usr/palm/public/accounts/com.palm.palmprofile/images/sms-48x48.png',
                    type_telegram: '/usr/palm/public/accounts/com.palm.telegram/images/telegram-48x48.png' }[serviceName] || null;
            }
        };
        realNow = Date.now;
        Date.now = function () { return NOW; };
        dm = new DashboardManager();
        dm.gotMessages(null, { results: [] });
    });

    afterEach(function () {
        Date.now = realNow;
        appState.accountService = savedAccounts;
    });

    function msg(id, thread, serviceName) {
        return { _id: id, conversations: [thread], localTimestamp: NOW - 1000, serviceName: serviceName,
            from: { addr: 'x' }, messageText: 'hi', flags: { read: false } };
    }

    it('one icon a protocol, looked up by its group, and Messaging\'s for one with none', function () {
        dm.gotMessages(null, { results: [msg('m1', 't1', 'type_mobile'), msg('m2', 't2', 'type_telegram'),
            msg('m3', 't3', 'type_teams')] });
        assert.deepEqual(dm.$.createToast.sent.map(function (t) { return [t.groupId, t.iconUrl]; }), [
            ['sms', '/usr/palm/public/accounts/com.palm.palmprofile/images/sms-48x48.png'],
            ['type_telegram', '/usr/palm/public/accounts/com.palm.telegram/images/telegram-48x48.png'],
            ['type_teams', APP_ICON]
        ]);
        assert.deepEqual(asked, ['sms', 'type_telegram', 'type_teams']);
    });

    it('Messaging\'s before the accounts are known', function () {
        appState.accountService = null;
        dm.gotMessages(null, { results: [msg('m1', 't1', 'type_telegram')] });
        assert.equal(dm.$.createToast.sent[0].iconUrl, APP_ICON);
    });

    it('an invitation its protocol\'s, and a failed send the failure icon', function () {
        dm.gotInvites(null, { results: [] });
        dm.gotInvites(null, { results: [{ _id: 'i1', accepted: 'pending', from: { addr: 'bob' }, serviceName: 'type_telegram' }] });
        dm.notifyFailedMessage({ _id: 'm9', conversations: ['t1'], serviceName: 'type_telegram', errorCategory: 'x' });
        var sent = dm.$.createToast.sent;
        assert.equal(sent[0].iconUrl, '/usr/palm/public/accounts/com.palm.telegram/images/telegram-48x48.png');
        assert.equal(sent[1].iconUrl, FAILED_ICON);
    });
});
