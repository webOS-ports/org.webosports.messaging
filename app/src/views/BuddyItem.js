/**
 * A single row in the buddies list.
 * Ported from com.palm.app.messaging/app/buddies/BuddyItem.js.
 */

var kind = require('enyo/kind'),
    Image = require('enyo/Image'),
    SwipeableItem = require('./widgets/SwipeableItem'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "BuddyItem",
    kind: SwipeableItem,
    confirmCaption: $L("Delete"),
    classes: "contactItem flex-row",

    published: {
        /** The raw joined buddy record this row renders. */
        record: null
    },

    components: [
        {
            name: "imageContainer", style: "display: inline-block;", components: [
                { classes: "contact-image-border" },
                { name: "contactImage", kind: Image, classes: "contact-image" }
            ]
        },
        { name: "status", classes: "status status-buddy" },
        {
            classes: "message-summary", components: [
                {
                    classes: "contact-name-box", components: [
                        { name: "contactName", classes: "contact-name", allowHtml: true },
                        { name: "favorite", classes: "favorite-icon", showing: false },
                        { name: "unreadCount", classes: "unread-count", showing: false }
                    ]
                },
                { name: "statusMessage", classes: "status-message", allowHtml: true }
            ]
        }
    ],

    recordChanged: function () {
        if (this.record) {
            this.setBuddy(this.record);
        }
    },

    setBuddy: function (inBuddy) {
        this.buddy = inBuddy;
        this.updateContactName(inBuddy);
        this.updateUnreadCount(inBuddy.thread, inBuddy.person);
        this.updateStatus(inBuddy.personAvailability !== undefined ?
            inBuddy.personAvailability : inBuddy.availability);
        this.updateStatusMessage(inBuddy);
        this.updateContactImage(inBuddy.person);
        this.updateContactFavorite(inBuddy.person);
    },

    updateContactName: function (inBuddy) {
        this.$.contactName.setContent(
            messagingUtils.message.emojifyEscaped(this.getContactName(inBuddy)));
    },

    updateStatus: function (inAvailability) {
        this.$.status.setClasses(this.getStatus(inAvailability));
    },

    updateStatusMessage: function (inBuddy) {
        this.$.statusMessage.setContent(
            messagingUtils.message.emojifyEscaped(this.getStatusMessage(inBuddy)));
    },

    updateContactImage: function (inPerson) {
        this.$.contactImage.setAttribute("src", messagingUtils.person.getDisplayImage(inPerson));
    },

    updateContactFavorite: function (inPerson) {
        this.$.favorite.setShowing(!!(inPerson && inPerson.favorite));
    },

    updateUnreadCount: function (inThread, inPerson) {
        var count = this.getUnreadCount(inThread);
        var hasUnread = !this.isThreadSelected(inThread) && Number(count) > 0;

        this.$.contactName.setClasses(this.getContactNameClass(hasUnread, inPerson));
        this.$.unreadCount.setShowing(hasUnread);
        this.$.unreadCount.setContent(count);
    },

    isThreadSelected: function (inThread) {
        return !!(inThread && appState.selectedThread &&
            inThread._id === appState.selectedThread._id);
    },

    getContactName: function (inBuddy) {
        var displayName = inBuddy.person ?
            messagingUtils.person.getDisplayName(inBuddy.person) :
            inBuddy.displayName || inBuddy.username;
        return messagingUtils.message.removeHtml(displayName);
    },

    getStatus: function (inAvailability) {
        var statusClass = "status-" + messagingUtils.im.availabilityClasses[inAvailability];
        return "status status-buddy " + statusClass;
    },

    getStatusMessage: function (inBuddy) {
        var inStatus = inBuddy.status || "";

        if (inBuddy._kind === "com.palm.imbuddystatus.libpurple:1") {
            // The libpurple transport escapes &, ', < and > in status messages, so undo that.
            inStatus = messagingUtils.message.unescapeText(inStatus);
        }
        return messagingUtils.message.removeHtml(inStatus);
    },

    getUnreadCount: function (inThread) {
        return (inThread && inThread.unreadCount) || 0;
    },

    getContactNameClass: function (hasUnread, inPerson) {
        var isFavorite = inPerson && inPerson.favorite;
        var className = "contact-name";

        if (hasUnread && isFavorite) {
            className += " contact-name-unread-favorite";
        } else if (hasUnread) {
            className += " contact-name-unread";
        } else if (isFavorite) {
            className += " contact-name-favorite";
        }
        return className;
    }
});
