/**
 * A single row in the conversations list.
 * Ported from com.palm.app.messaging/app/threads/ThreadItem.js.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    Image = require('enyo/Image'),
    SwipeableItem = require('./widgets/SwipeableItem'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "ThreadItem",
    kind: SwipeableItem,
    confirmCaption: $L("Delete"),
    classes: "contactItem flex-row",

    published: {
        /** The raw joined chatthread record this row renders. */
        record: null
    },

    components: [
        {
            components: [
                { name: "imageBorder", classes: "contact-image-border" },
                {
                    name: "contactImage", kind: Image, classes: "contact-image",
                    // Plain HTML, because an <img> error event does not bubble to Enyo.
                    attributes: { onerror: "window.__messagingAvatarFailed(this)" }
                }
            ]
        },
        {
            classes: "status-box", components: [
                { name: "status", classes: "status" },
                { name: "outgoing", classes: "sent-received" }
            ]
        },
        {
            classes: "message-summary", components: [
                {
                    classes: "contact-name-box", components: [
                        { name: "displayName", classes: "contact-name", allowHtml: true },
                        { name: "unreadCount", classes: "unread-count", showing: false }
                    ]
                },
                { name: "summary", classes: "message-preview", allowHtml: true }
            ]
        }
    ],

    recordChanged: function () {
        if (this.record) {
            this.setThread(this.record);
        }
    },

    setThread: function (inThread) {
        this.thread = inThread;
        this.updateStatus(inThread.status);
        this.updateContactImage(inThread.person, inThread);
        this.updateUnreadCount(inThread);
        this.updateOutgoing(inThread.flags);

        var displayName;
        if (inThread.person) {
            displayName = messagingUtils.person.getDisplayName(inThread.person);
        } else {
            displayName = inThread.displayName ? inThread.displayName : inThread.replyAddress;
        }
        this.$.displayName.setContent(messagingUtils.message.emojifyEscaped(displayName));

        // The summary mirrors the message text, whose astral emoji the transport stored as numeric
        // entities, so render them as inline images too. Line breaks are flattened first: the
        // preview is styled nowrap/ellipsis for a single line, but a <br> defeats that, and feed
        // summaries carry several - which is what made those rows several times taller than the
        // 77px a row should be.
        this.$.summary.setContent(
            messagingUtils.message.emojify(this.flattenLines(this.getThreadSummary(inThread))));
    },

    updateStatus: function (inStatus) {
        this.$.status.setClasses(this.getStatusClassName(inStatus));
    },

    updateUnreadCount: function (inThread) {
        var inUnreadCount = inThread.unreadCount;
        var hasUnread = !this.isThreadSelected(inThread) && Number(inUnreadCount) > 0;
        this.$.unreadCount.setContent(inUnreadCount || 0);
        this.$.unreadCount.setShowing(hasUnread);
        this.$.displayName.setClasses("contact-name" + (hasUnread ? " contact-name-unread" : ""));
    },

    /**
     * 1:1 chats keep the buddy avatar; group chats (which have no person) show the service logo
     * instead, so you can tell at a glance which network a group is on.
     */
    updateContactImage: function (inPerson, inThread) {
        if (inPerson) {
            this.$.contactImage.setAttribute("src", messagingUtils.person.getDisplayImage(inPerson));
            this.setServiceIconStyle(false);
            return;
        }
        var svc = inThread && (inThread.serviceName || inThread.replyService);
        var icon = this.getServiceIcon(svc);
        this.$.contactImage.setAttribute("src", icon || messagingUtils.person.getDisplayImage(inPerson));
        // Provider logos already have their own rounded edges, so the square photo frame clashes
        // and the full-bleed logo reads too bright: drop the frame and soften it.
        this.setServiceIconStyle(Boolean(icon));
    },

    /** Set on every row so recycled rows never keep a previous row's treatment. */
    setServiceIconStyle: function (isServiceIcon) {
        this.$.imageBorder.setShowing(!isServiceIcon);
        this.$.contactImage.addRemoveClass("contact-image-service", isServiceIcon);
    },

    getServiceIcon: function (serviceName) {
        if (!serviceName || !appState.accountService || !appState.accountService.getIconPath) {
            return null;
        }
        return appState.accountService.getIconPath(serviceName);
    },

    updateOutgoing: function (inFlags) {
        this.$.outgoing.setClasses("sent-received " +
            (Boolean(inFlags && inFlags.outgoing) ? "message-outgoing" : ""));
    },

    getStatusClassName: function (inStatus) {
        var status = inStatus &&
            (inStatus.offline ? "offline" : messagingUtils.im.availabilityClasses[inStatus.availability]);
        return "status" + (!status ? "" : " status-" + status);
    },

    getThreadSummary: function (inThread) {
        var summary;
        if (messagingUtils.message.isMMSThread(inThread)) {
            summary = messagingUtils.message.getMMSThreadSummary();
        } else if (inThread.summary) {
            if (inThread.flags && inThread.flags.outgoing) {
                // Only outgoing messages need escaping; incoming ones are sanitized on the way in.
                summary = messagingUtils.message.escapeHtml(inThread.summary);
            } else {
                summary = inThread.summary;
            }
            summary = this.summarizeMedia(summary);
        } else {
            summary = "";
        }
        return summary;
    },

    /**
     * A voice note / photo / video / file arrives with the media URL as the message body, so the
     * preview would otherwise show a raw "file:///..." path. Show a friendly label instead; if
     * there is real text alongside it, keep the text.
     */
    summarizeMedia: function (text) {
        return messagingUtils.message.summarizeMedia(text);
    },

    /** Collapse breaks and runs of whitespace so the preview stays on one line. */
    flattenLines: function (text) {
        if (!text) {
            return text;
        }
        return String(text)
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/[\r\n]+/g, " ")
            .replace(/\s{2,}/g, " ")
            .replace(/^\s+|\s+$/g, "");
    },

    isThreadSelected: function (inThread) {
        return appState.isThreadOnScreen(inThread);
    }
});
