/**
 * A single channel (room) row inside a server's channel list.
 * Ported from com.palm.app.messaging/app/servers/ChannelItem.js.
 *
 * Channels are presented IRC-style with a leading "#". The record is an imchannel; its
 * chatThreadId links to the conversation.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    messagingUtils = require('../util/messagingUtils'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "ChannelItem",
    kind: Control,
    classes: "contactItem flex-row",

    published: {
        record: null
    },

    components: [
        {
            classes: "message-summary", components: [
                { name: "displayName", classes: "contact-name", allowHtml: true }
            ]
        },
        { name: "unreadCount", classes: "unread-count channel-unread", showing: false }
    ],

    recordChanged: function () {
        if (this.record) {
            this.setChannel(this.record);
        }
    },

    setChannel: function (inChannel) {
        this.$.displayName.setContent(
            messagingUtils.message.emojifyEscaped(this.getChannelLabel(inChannel)));
    },

    /**
     * Unread count for this channel; 0 (or being the currently-open channel) hides the badge and
     * un-bolds the name, matching the thread-list unread treatment.
     */
    setUnread: function (inCount) {
        var n = Number(inCount) || 0;
        this.$.unreadCount.setContent(n > 99 ? "99+" : n);
        this.$.unreadCount.setShowing(n > 0);
        this.$.displayName.setClasses("contact-name" + (n > 0 ? " contact-name-unread" : ""));
    },

    /**
     * Channels seeded from tagged messages carry name = remote id, so prefer displayName (the human
     * name or topic) and fall back to the raw remote id only when no displayName was ever resolved.
     * Prefixed with "#", but not doubled for IRC channels whose name already starts with one.
     */
    getChannelLabel: function (inChannel) {
        var name = inChannel.displayName || inChannel.name || inChannel.remoteId || $L("channel");
        return (String(name).charAt(0) === "#") ? name : ("# " + name);
    }
});
