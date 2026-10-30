/**
 * A single row in the favorites list.
 * Ported from com.palm.app.messaging/app/favorites/FavoriteItem.js.
 */

var kind = require('enyo/kind'),
    Image = require('enyo/Image'),
    SwipeableItem = require('./widgets/SwipeableItem'),
    messagingUtils = require('../util/messagingUtils'),
    $L = require('enyo/i18n').$L;

var NO_IM_ACCOUNTS_MESSAGE = $L("Tap here to add contact info");

module.exports = kind({
    name: "FavoriteItem",
    kind: SwipeableItem,
    confirmCaption: $L("Remove"),
    classes: "contactItem flex-row",

    published: {
        /** The raw joined person record this row renders. */
        record: null
    },

    components: [
        {
            name: "imageContainer", style: "display: inline-block;", components: [
                { classes: "contact-image-border" },
                {
                    name: "contactImage", kind: Image, classes: "contact-image",
                    // Plain HTML, because an <img> error event does not bubble to Enyo.
                    attributes: { onerror: "window.__messagingAvatarFailed(this)" }
                }
            ]
        },
        { name: "status", classes: "status status-buddy" },
        {
            classes: "message-summary", components: [
                { name: "contactName", classes: "contact-name-box contact-name" },
                { name: "statusMessage", classes: "status-message" },
                { name: "contactMessage", classes: "contact-message" }
            ]
        }
    ],

    recordChanged: function () {
        if (this.record) {
            this.setFavorite(this.record);
        }
    },

    setFavorite: function (inFavorite) {
        this.favorite = inFavorite;
        this.updateContactName(inFavorite);
        this.updateContactImage(inFavorite);
        this.updateAccounts(inFavorite);
        this.updateStatus(inFavorite.ims);
    },

    updateContactName: function (inFavorite) {
        var displayName = messagingUtils.person.getDisplayName(inFavorite);
        this.$.contactName.setContent(messagingUtils.message.removeHtml(displayName));
    },

    updateContactImage: function (inPerson) {
        this.$.contactImage.setAttribute("src", messagingUtils.person.getDisplayImage(inPerson));
    },

    updateStatus: function (ims) {
        var bestAvailability = this.getBestAvailability(ims);
        var statusClass = "";

        if (bestAvailability !== undefined) {
            statusClass = "status-" + messagingUtils.im.availabilityClasses[bestAvailability];
        }
        this.$.status.setClasses("status status-buddy " + statusClass);
        this.$.statusMessage.setContent(
            messagingUtils.message.removeHtml(this.getStatusMessage(ims)));
    },

    updateAccounts: function (inFavorite) {
        if (messagingUtils.person.hasMessagingAccounts(inFavorite) ||
                messagingUtils.person.hasSMSAccounts(inFavorite)) {
            this.$.contactMessage.setContent("");
            this.$.contactName.setClasses("contact-name-box contact-name");
        } else {
            // With no IM/SMS address there is nothing to message, so prompt to add contact info.
            this.$.contactMessage.setContent(NO_IM_ACCOUNTS_MESSAGE);
            this.$.statusMessage.setContent("");
            this.$.contactName.setClasses(
                "contact-name-box contact-name contact-name-no-messaging-account");
        }
    },

    getBestAvailabilityImsIndex: function (ims) {
        var index, bestAvailability;
        for (var i = 0; ims && i < ims.length; i++) {
            if (bestAvailability === undefined || ims[i].availability < bestAvailability) {
                index = i;
                bestAvailability = ims[i].availability;
            }
        }
        return index;
    },

    getBestAvailability: function (ims) {
        if (!ims) { return undefined; }
        var index = this.getBestAvailabilityImsIndex(ims);
        return index !== undefined ? ims[index].availability : undefined;
    },

    getStatusMessage: function (ims) {
        var statusMessage = "";
        if (ims) {
            var index = this.getBestAvailabilityImsIndex(ims);
            if (index !== undefined) {
                statusMessage = ims[index].status || "";
                if (ims[index]._kind === "com.palm.imbuddystatus.libpurple:1") {
                    statusMessage = messagingUtils.message.unescapeText(statusMessage);
                }
            }
        }
        return statusMessage;
    }
});
