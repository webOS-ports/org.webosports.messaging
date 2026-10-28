/**
 * A dashboard for each messaging account that has stopped signing in, so the user learns about
 * it from somewhere other than the transport's log.
 *
 * Modelled on enyo-1's SyncUI.syncDashboard, which webOS only ever ran for email, contacts and
 * calendar: it watches the com.palm.account.syncstate:1 records the transports write to tempdb,
 * and for an account with a credentials error (see util/accountErrors) it shows the account and
 * "sign in again". Tapping it opens the Accounts app's change-login flow for that account, as
 * the old dashboard did; the dashboard goes away once the error does.
 *
 * LuneOS has no dashboards as such, so this is a persistent toast. Its id is kept in
 * localStorage, so a restart of the app neither raises a second one nor forgets to close it.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    cancelRequests = require('../util/cancelRequests'),
    accountErrors = require('../util/accountErrors'),
    appState = require('../util/appState'),
    mockDb = require('./mockDb'),
    $L = require('enyo/i18n').$L;

var NOTIFICATION_SERVICE = 'luna://com.webos.notification';
var TEMPDB_SERVICE = 'luna://com.webos.service.tempdb';
var SYNCSTATE_KIND = 'com.palm.account.syncstate:1';
var ACCOUNTS_APP_ID = 'com.palm.app.accounts';
var STORAGE_KEY = 'accountErrorToasts';

/** How long to wait before trying again when the notification service turns a toast down. */
var RETRY_MS = 30000;

module.exports = kind({
    name: "AccountErrorDashboard",
    kind: Component,

    components: [
        {
            name: 'syncStateWatch', kind: LunaService, service: TEMPDB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotSyncStates', onError: 'serviceErr'
        },
        {
            name: 'createToast', kind: LunaService, service: NOTIFICATION_SERVICE,
            method: 'createToast', onResponse: 'toastCreated', onError: 'toastFailed'
        },
        { name: 'closeToast', kind: LunaService, service: NOTIFICATION_SERVICE, method: 'closeToast', onError: 'serviceErr' }
    ],

    create: function () {
        this.inherited(arguments);
        this.errorIds = null;         // accountId -> true, from the latest syncstate records
        this.shown = this.loadShown(); // accountId -> toastId ("" while the toast is being created)
        if (mockDb.enabled) {
            return;
        }
        this.accountsChanged = this.update.bind(this);
        if (appState.accountService) {
            appState.accountService.register(this, this.accountsChanged);
        }
        this.watchSyncStates();
    },

    destroy: function () {
        clearTimeout(this.retryTimer);
        cancelRequests(this.$.syncStateWatch);
        if (appState.accountService) {
            appState.accountService.unregister(this);
        }
        this.inherited(arguments);
    },

    watchSyncStates: function () {
        cancelRequests(this.$.syncStateWatch);
        this.$.syncStateWatch.send({ query: { from: SYNCSTATE_KIND }, watch: true });
    },

    gotSyncStates: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            // db8 watches fire once: ask again, which also arms the next one.
            this.watchSyncStates();
            return true;
        }
        this.errorIds = accountErrors.credentialErrors(inResponse && inResponse.results);
        this.update();
        return true;
    },

    /** Raise and close toasts so there is one for each messaging account that needs signing in. */
    update: function () {
        if (!this.errorIds) {
            // Nothing is known about the errors yet, so every saved toast would look stale.
            return;
        }
        var accounts = appState.accountService && appState.accountService.getMyAccountTypesHash();
        var todo = accountErrors.plan(this.errorIds, accounts, this.shown);
        todo.close.forEach(function (c) {
            if (c.toastId) {
                this.$.closeToast.send({ toastId: c.toastId });
            }
            delete this.shown[c.accountId];
        }, this);
        todo.raise.forEach(function (accountId) {
            this.raise(accountId, accounts[accountId]);
        }, this);
        if (todo.close.length || todo.raise.length) {
            this.saveShown();
        }
    },

    raise: function (accountId, account) {
        var name = account.alias || account.username || account.loc_name || "";
        var icon = account.icon && (account.icon.loc_48x48 || account.icon.loc_32x32);
        this.shown[accountId] = "";
        var request = this.$.createToast.send({
            title: account.loc_name && account.loc_name !== name ? account.loc_name + ": " + name : name,
            message: $L("Sign-in failed. Tap to sign in again."),
            iconUrl: icon || undefined,
            persistent: true,
            onclick: {
                appId: ACCOUNTS_APP_ID,
                params: { launchType: "changelogin", accountId: accountId }
            }
        });
        request.accountId = accountId;
    },

    toastCreated: function (inSender, inResponse) {
        var accountId = inResponse.originator && inResponse.originator.accountId;
        if (!accountId || !Object.prototype.hasOwnProperty.call(this.shown, accountId)) {
            return true;
        }
        if (!this.errorIds[accountId]) {
            // Signed in again while the toast was on its way.
            if (inResponse.toastId) {
                this.$.closeToast.send({ toastId: inResponse.toastId });
            }
            delete this.shown[accountId];
        } else {
            this.shown[accountId] = inResponse.toastId || "";
        }
        this.saveShown();
        return true;
    },

    toastFailed: function (inSender, inError) {
        // Early in boot notificationmgr answers "UI is not yet ready"; forget the attempt so the
        // next update raises the toast again.
        var accountId = inError.originator && inError.originator.accountId;
        this.warn("createToast failed:", inError.errorText || inError);
        if (accountId) {
            delete this.shown[accountId];
            this.saveShown();
        }
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(this.update.bind(this), RETRY_MS);
        return true;
    },

    loadShown: function () {
        try {
            var stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
            return (stored && typeof stored === "object") ? stored : {};
        } catch (e) {
            return {};
        }
    },

    saveShown: function () {
        try {
            // A toast still being created has no id yet; leaving it out means a restart raises it
            // again rather than believing it is up.
            var ids = {};
            Object.keys(this.shown).forEach(function (id) {
                if (this.shown[id]) { ids[id] = this.shown[id]; }
            }, this);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        } catch (e) {
            // Without storage a restart may raise the toast once more; nothing worse.
        }
    },

    serviceErr: function (inSender, inError) {
        this.warn("account error dashboard:", inError && (inError.errorText || inError));
        return true;
    }
});
