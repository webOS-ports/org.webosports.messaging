/**
 * The availability picker: Available / Busy / Invisible / Offline plus "Set custom status".
 * Ported from com.palm.app.messaging/app/imstatus/AccountStatuses.js.
 *
 * Used both for the all-accounts block and for each individual account's drawer, so it takes an
 * array of availabilities and check-marks every one that is present.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    messagingUtils = require('../util/messagingUtils'),
    $L = require('enyo/i18n').$L;

/** A single check-markable availability row. */
var Availability = kind({
    name: "Availability",
    kind: Control,
    classes: "availability onyx-menu-item flex-row",

    published: {
        caption: "",
        value: 0,
        checked: false
    },

    components: [
        { name: "status", classes: "av-status" },
        { name: "caption", classes: "av-caption flex-one" },
        { name: "arrow", classes: "av-arrow" }
    ],

    create: function () {
        this.inherited(arguments);
        this.$.caption.setContent(this.caption);

        if (this.value === messagingUtils.im.availability.BUSY) {
            this.$.status.addClass("status status-buddy status-away");
        } else {
            this.$.status.addClass("status status-buddy status-" +
                messagingUtils.im.buddyAvailabilities[this.value]);
        }
        this.checkedChanged();
    },

    checkedChanged: function () {
        this.$.arrow.addRemoveClass("av-arrow-checked", this.checked);
        this.addRemoveClass("availability-checked", this.checked);
    }
});

module.exports = kind({
    name: "AccountStatuses",
    kind: Control,
    classes: "flex-column",

    published: {
        availability: [],
        invisibilitySupported: false,
        accountId: undefined
    },

    events: {
        onAvailabilityChanged: "",
        onInputCustomMessage: ""
    },

    components: [
        {
            name: "availabilities", classes: "availabilities", components: [
                {
                    name: "available", kind: Availability, caption: $L("Available"),
                    value: 0, ontap: "updateAvailability", classes: "enyo-first available-status"
                },
                {
                    name: "busy", kind: Availability, caption: $L("Busy"),
                    value: 2, ontap: "updateAvailability"
                },
                {
                    name: "invisible", kind: Availability, showing: false, caption: $L("Invisible"),
                    value: 3, ontap: "updateAvailability"
                },
                {
                    name: "offline", kind: Availability, caption: $L("Offline"),
                    value: 4, ontap: "updateAvailability"
                },
                {
                    name: "customStatus", classes: "onyx-menu-item custom-status",
                    content: $L("Set custom status"), ontap: "setCustomMessage"
                }
            ]
        }
    ],

    availabilityChanged: function () {
        this.resetAvailabilities();

        var showCustomStatus = false;
        for (var i = 0; i < this.availability.length; i++) {
            this.setAvailabilityCheckMark(this.availability[i]);
            if (this.availability[i] <= messagingUtils.im.availability.BUSY) {
                showCustomStatus = true;
            }
        }
        this.$.customStatus.setShowing(showCustomStatus);
        this.$.customStatus.addRemoveClass("enyo-last", showCustomStatus);
        this.$.offline.addRemoveClass("enyo-last", !showCustomStatus);
    },

    setAvailabilityCheckMark: function (availability) {
        if (availability === messagingUtils.im.availability.AVAILABLE) {
            this.$.available.set('checked', true);
        } else if (availability === messagingUtils.im.availability.BUSY) {
            this.$.busy.set('checked', true);
        } else if (availability === messagingUtils.im.availability.INVISIBLE) {
            this.$.invisible.set('checked', true);
        } else if (availability === messagingUtils.im.availability.OFFLINE) {
            this.$.offline.set('checked', true);
        }
    },

    invisibilitySupportedChanged: function () {
        this.$.invisible.setShowing(this.invisibilitySupported);
    },

    resetAvailabilities: function () {
        this.$.available.set('checked', false);
        this.$.busy.set('checked', false);
        this.$.invisible.set('checked', false);
        this.$.offline.set('checked', false);
    },

    updateAvailability: function (inSender, inEvent) {
        this.availability = inSender.value;
        this.doAvailabilityChanged({ availability: this.availability });
        return true;
    },

    setCustomMessage: function (inSender, inEvent) {
        this.doInputCustomMessage({ accountId: this.accountId });
        return true;
    }
});
