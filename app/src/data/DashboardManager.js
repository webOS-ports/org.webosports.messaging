/**
 * Notifications for incoming messages, buddy invitations and failed sends.
 * Ported from com.palm.app.messaging/app/dashboards/*.
 *
 * The Mojo app drove webOS 3 dashboards; LuneOS exposes notifications through
 * com.webos.notification, so the same behaviour is expressed as toasts here:
 *   - the thread open in a foregrounded app gets its sound but no toast, as the legacy chat view
 *     asked for (playSoundOnly)
 *   - each batch of new messages makes one sound: the first toast carries it (messageAlerts)
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
    messageAlerts = require('../util/messageAlerts'),
    mockDb = require('./mockDb'),
    $L = require('enyo/i18n').$L;

var NOTIFICATION_SERVICE = 'luna://com.webos.notification';
var DB_SERVICE = 'luna://com.webos.service.db';
var AUDIO_SERVICE = 'luna://com.palm.audio';
var APP_ID = 'org.webosports.app.messaging';
// Every toast names its sourceId. Left out, notificationmgr takes the caller's bus name, which for
// a web app is the app id plus WAM's pid (org.webosports.app.messaging-968); that matches no app,
// so the toast got notificationmgr's generic icon instead of the app's. For an application
// notificationmgr ignores iconUrl and shows the icon of the sourceId's app.

/** Minimum gap between toasts for the same thread, so a burst does not produce a stream. */
var THROTTLE_MS = 10000;

/** The toast with the soundClass/soundFile fields from messageAlerts added; {} adds none. */
function withSound(toast, sound) {
    for (var k in sound) {
        if (Object.prototype.hasOwnProperty.call(sound, k)) { toast[k] = sound[k]; }
    }
    return toast;
}

module.exports = kind({
    name: "DashboardManager",
    kind: Component,

    components: [
        {
            name: 'createToast', kind: LunaService, service: NOTIFICATION_SERVICE,
            method: 'createToast', onError: 'serviceErr'
        },
        {
            name: 'playFeedback', kind: LunaService, service: AUDIO_SERVICE,
            method: 'systemsounds/playFeedback', onError: 'serviceErr'
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

    alertContext: function () {
        var self = this;
        // The thread on screen is the one the conversation view shows, in a foregrounded window -
        // the same test that hides its unread badge. filter.thread is kept for a caller that sets
        // it, but nothing in the app does.
        var onScreen = this.filter.thread;
        if (!onScreen && appState.isThreadOnScreen(appState.selectedThread)) {
            onScreen = appState.getSelectedThreadId();
        }
        if (appState.getAppDeactivated()) {
            onScreen = undefined;
        }
        return {
            prefs: appState.prefsHandler && appState.prefsHandler.getPrefs(),
            filterAll: !!this.filter.filterAll,
            onScreenThread: onScreen,
            now: Date.now(),
            throttled: function (threadId) { return self.throttled(threadId); }
        };
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
        // com.palm.message:1 has no index spanning `folder` and `flags.read`, and none that
        // orders a filtered set by localTimestamp, so the obvious query - unread in the inbox,
        // newest first - is answered with "db: no index for query" and the watch never fires.
        // Worse, the subscription re-sends on every failure, so the app retried every ~7s for
        // as long as it was open and no incoming message ever raised a toast.
        //
        // `bynewincoming` is (folder, _rev), which is the index this is for: walk the revision
        // order within the inbox and pick the unread ones out in gotMessages(). _rev rises with
        // every write, so newest-first by _rev is the order we want anyway. Same trick as
        // watchInvites() below.
        this.$.messageWatch.send({
            query: {
                from: messagingUtils.message.dbKind,
                where: [
                    { prop: "folder", op: "=", val: messagingUtils.message.FOLDERS.INBOX },
                    { prop: "_rev", op: ">", val: 0 }
                ],
                orderBy: "_rev",
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

        var fresh = [];
        for (var i = 0; i < results.length; i++) {
            var message = results[i];
            if (this.seenMessageIds[message._id]) {
                continue;
            }

            // Not threaded yet. The transport stores a message without conversations and the
            // service's threader adds them a few ms later; the watch sees both writes. Judged
            // now it has no thread, so it never matched the thread on screen, and once marked
            // seen the threaded write was skipped. Both legacy apps waited for conversations too.
            if (!message.conversations || message.conversations.length === 0) {
                continue;
            }
            this.seenMessageIds[message._id] = true;

            // The query cannot filter on flags.read (no index), so do it here.
            if (message.flags && message.flags.read) {
                continue;
            }
            fresh.push(message);
        }

        // One sound for the batch: on its first toast, or alone for the thread on screen.
        var alerts = messageAlerts.plan(fresh, this.alertContext());
        for (var t = 0; t < alerts.toasts.length; t++) {
            this.showMessageToast(alerts.toasts[t].message, alerts.toasts[t].threadId, alerts.toasts[t].sound);
        }
        if (alerts.feedback) {
            this.$.playFeedback.send(alerts.feedback);
        }
        return true;
    },

    /** @param sound  the soundClass/soundFile fields from messageAlerts, or {} for a silent toast */
    showMessageToast: function (message, threadId, sound) {
        var sender = (message.from && (message.from.name || message.from.addr)) || $L("New message");

        // Title and message apart, as the layers of the Mojo dashboard were: the banner joins them
        // itself, and a toast sent without a title shows its message on both of the notification's
        // lines.
        this.$.createToast.send(withSound({
            sourceId: APP_ID,
            title: messagingUtils.message.stripEmojiForPlainText(sender),
            message: messagingUtils.message.getNotificationText(message) || $L("New message"),
            iconUrl: "/usr/palm/applications/" + APP_ID + "/assets/notification-large-messaging.png",
            onclick: {
                appId: APP_ID,
                params: { threadId: threadId }
            }
        }, sound || {}));
    },

    // --- buddy invitations -----------------------------------------------------------------------

    watchInvites: function () {
        cancelRequests(this.$.inviteWatch);
        // com.palm.iminvitation belongs to com.palm.app.messaging, not to this repo, and its kind
        // carries no index on `accepted` - so a where clause on it is answered with
        // "db: no index for query" and the watch never fires at all. Walk the revision index,
        // which the kind does have, and pick the pending ones out below. There are only ever a
        // handful of invitations, so this costs nothing.
        this.$.inviteWatch.send({
            query: {
                from: "com.palm.iminvitation:1",
                where: [{ prop: "_rev", op: ">", val: 0 }]
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
                if (results[p].accepted === "pending") {
                    this.seenInviteIds[results[p]._id] = true;
                }
            }
            this.invitesPrimed = true;
            return true;
        }

        // The legacy app raised an invitation through the same banner as a message, so it is held
        // back by the same Show Notifications switch and makes the same sound, once a batch.
        var prefs = appState.prefsHandler && appState.prefsHandler.getPrefs();
        var sound = messageAlerts.toastSound(prefs);
        for (var i = 0; i < results.length; i++) {
            var invite = results[i];
            if (invite.accepted !== "pending" || this.seenInviteIds[invite._id] ||
                    this.filter.filterAll || (prefs && prefs.enableNotification === false)) {
                continue;
            }
            this.seenInviteIds[invite._id] = true;

            var from = (invite.from && (invite.from.name || invite.from.addr)) || $L("Someone");
            this.$.createToast.send(withSound({
                sourceId: APP_ID,
                title: messagingUtils.message.stripEmojiForPlainText(from),
                message: $L("wants to add you as a buddy"),
                iconUrl: "/usr/palm/applications/" + APP_ID + "/assets/notification-large-messaging.png",
                onclick: {
                    appId: APP_ID,
                    params: { threadId: invite.conversations && invite.conversations[0] }
                }
            }, sound));
            sound = {};
        }
        return true;
    },

    /**
     * Raised by the conversation view when a send fails, offering a retry on tap. Silent, as the
     * legacy sendMessageErrorNotificationAndUpdateDashboard was ("TODO: Should we play an error
     * sound?").
     */
    notifyFailedMessage: function (message) {
        if (!message) {
            return;
        }
        this.$.createToast.send({
            sourceId: APP_ID,
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
