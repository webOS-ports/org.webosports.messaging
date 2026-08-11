/**
 * Notifications for incoming messages, buddy invitations and failed sends.
 * Ported from com.palm.app.messaging/app/dashboards/*.
 *
 * The Mojo app drove webOS 3 dashboards; LuneOS exposes notifications through
 * com.webos.notification, so the same behaviour is expressed as toasts here:
 *   - nothing is raised while the app is foregrounded with that thread open (the filter)
 *   - a burst of messages from one thread is throttled into a single toast
 *   - tapping a toast relaunches the app onto the thread it came from
 *   - a failed send offers a retry
 *
 * The messaging service raises its own toast for incoming messages when the app is not running;
 * this manager covers the running-app case and suppresses the duplicate for the open thread.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    cancelRequests = require('../util/cancelRequests'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('./mockDb'),
    $L = require('enyo/i18n').$L;

var NOTIFICATION_SERVICE = 'luna://com.webos.notification';
var DB_SERVICE = 'luna://com.webos.service.db';
var APP_ID = 'org.webosports.app.messaging';

/** Minimum gap between toasts for the same thread, so a burst does not produce a stream. */
var THROTTLE_MS = 10000;

module.exports = kind({
    name: "DashboardManager",
    kind: Component,

    components: [
        {
            name: 'createToast', kind: LunaService, service: NOTIFICATION_SERVICE,
            method: 'createToast', onError: 'serviceErr'
        },
        {
            name: 'messageWatch', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotMessages', onError: 'serviceErr'
        },
        {
            name: 'inviteWatch', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotInvites', onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.filter = { filterAll: false, thread: undefined };
        this.lastToastAt = {};        // threadId -> timestamp of the last toast raised
        this.seenMessageIds = {};     // message _id -> true, so a re-query does not re-notify
        this.primed = false;          // first result set only primes the seen set
        this.invitesPrimed = false;
        this.seenInviteIds = {};

        if (!mockDb.enabled) {
            this.watchMessages();
            this.watchInvites();
        }
    },

    destroy: function () {
        cancelRequests(this.$.messageWatch);
        cancelRequests(this.$.inviteWatch);
        this.inherited(arguments);
    },

    // --- filtering ---------------------------------------------------------------------------

    getFilter: function () {
        return this.filter;
    },

    /**
     * @param filter.filterAll  suppress every notification, e.g. while preferences are open
     * @param filter.thread     suppress notifications for this thread, because it is on screen
     */
    setFilter: function (filter) {
        this.filter = filter || {};
    },

    setAppDeactivated: function (deactivated) {
        appState.setAppDeactivated(deactivated);
    },

    getAppDeactivated: function () {
        return appState.getAppDeactivated();
    },

    /** An account was removed, so its pending notifications are no longer meaningful. */
    accountRemoved: function (account) {
        if (!account) {
            return;
        }
        this.seenMessageIds = {};
        this.seenInviteIds = {};
    },

    shouldNotify: function (message) {
        var prefs = appState.prefsHandler && appState.prefsHandler.getPrefs();
        if (prefs && prefs.enableNotification === false) {
            return false;
        }
        if (this.filter.filterAll) {
            return false;
        }
        // The thread the user is looking at, in a foregrounded app, needs no toast.
        var threadId = message.conversations && message.conversations[0];
        if (!appState.getAppDeactivated() && this.filter.thread && this.filter.thread === threadId) {
            return false;
        }
        // During a history sync the transports back-fill old messages with their original send
        // time, so only notify for messages inside the configured window.
        var maxAge = prefs ? prefs.notifyMaxAgeMinutes : 60;
        if (maxAge !== undefined && maxAge !== -1) {
            var age = Date.now() - (message.localTimestamp || message.timestamp || 0);
            if (age > maxAge * 60 * 1000) {
                return false;
            }
        }
        return true;
    },

    /** One toast per thread per throttle window, so a burst collapses into a single alert. */
    throttled: function (threadId) {
        var now = Date.now();
        var last = this.lastToastAt[threadId] || 0;
        if (now - last < THROTTLE_MS) {
            return true;
        }
        this.lastToastAt[threadId] = now;
        return false;
    },

    // --- incoming messages ---------------------------------------------------------------------

    watchMessages: function () {
        cancelRequests(this.$.messageWatch);
        this.$.messageWatch.send({
            query: {
                from: messagingUtils.message.dbKind,
                where: [
                    { prop: "folder", op: "=", val: messagingUtils.message.FOLDERS.INBOX },
                    { prop: "flags.read", op: "=", val: false }
                ],
                orderBy: "localTimestamp",
                desc: true,
                limit: 20
            },
            watch: true
        });
    },

    gotMessages: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this.watchMessages();
            return true;
        }
        var results = (inResponse && inResponse.results) || [];

        // The first result set is the backlog that existed before the app started; remember it so
        // only genuinely new messages raise a toast.
        if (!this.primed) {
            for (var p = 0; p < results.length; p++) {
                this.seenMessageIds[results[p]._id] = true;
            }
            this.primed = true;
            return true;
        }

        for (var i = 0; i < results.length; i++) {
            var message = results[i];
            if (this.seenMessageIds[message._id]) {
                continue;
            }
            this.seenMessageIds[message._id] = true;

            if (!this.shouldNotify(message)) {
                continue;
            }
            var threadId = message.conversations && message.conversations[0];
            if (this.throttled(threadId)) {
                continue;
            }
            this.showMessageToast(message, threadId);
        }
        return true;
    },

    showMessageToast: function (message, threadId) {
        var sender = (message.from && (message.from.name || message.from.addr)) || $L("New message");
        var body = messagingUtils.message.getMessageText(message);

        // A toast is plain text, so emoji must be stripped rather than left as tofu or entities, and
        // a bare media URL is replaced by its friendly label.
        body = messagingUtils.message.stripEmojiForPlainText(
            messagingUtils.message.summarizeMedia(body) || "");

        this.$.createToast.send({
            message: messagingUtils.message.stripEmojiForPlainText(sender) + ": " + body,
            iconUrl: "/usr/palm/applications/" + APP_ID + "/assets/notification-large-messaging.png",
            onclick: {
                appId: APP_ID,
                params: { threadId: threadId }
            }
        });
    },

    // --- buddy invitations -----------------------------------------------------------------------

    watchInvites: function () {
        cancelRequests(this.$.inviteWatch);
        this.$.inviteWatch.send({
            query: {
                from: "com.palm.iminvitation:1",
                where: [{ prop: "accepted", op: "=", val: "pending" }]
            },
            watch: true
        });
    },

    gotInvites: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this.watchInvites();
            return true;
        }
        var results = (inResponse && inResponse.results) || [];

        if (!this.invitesPrimed) {
            for (var p = 0; p < results.length; p++) {
                this.seenInviteIds[results[p]._id] = true;
            }
            this.invitesPrimed = true;
            return true;
        }

        for (var i = 0; i < results.length; i++) {
            var invite = results[i];
            if (this.seenInviteIds[invite._id] || this.filter.filterAll) {
                continue;
            }
            this.seenInviteIds[invite._id] = true;

            var from = (invite.from && (invite.from.name || invite.from.addr)) || $L("Someone");
            this.$.createToast.send({
                message: messagingUtils.message.stripEmojiForPlainText(from) + " " +
                    $L("wants to add you as a buddy"),
                iconUrl: "/usr/palm/applications/" + APP_ID + "/assets/notification-large-messaging.png",
                onclick: {
                    appId: APP_ID,
                    params: { threadId: invite.conversations && invite.conversations[0] }
                }
            });
        }
        return true;
    },

    /** Raised by the conversation view when a send fails, offering a retry on tap. */
    notifyFailedMessage: function (message) {
        if (!message) {
            return;
        }
        this.$.createToast.send({
            message: messagingUtils.message.getMessageErrorFromCode(message.errorCategory, message),
            iconUrl: "/usr/palm/applications/" + APP_ID + "/assets/notification-large-failed.png",
            onclick: {
                appId: APP_ID,
                params: {
                    threadId: message.conversations && message.conversations[0],
                    retryMessageId: message._id
                }
            }
        });
    },

    serviceErr: function (inSender, inError) {
        this.warn("notification service failed:", inError && (inError.errorText || inError));
        return true;
    }
});
