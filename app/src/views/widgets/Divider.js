/**
 * Section divider above the first row of each date bucket / buddy group.
 * Enyo 2 stand-in for Mojo's enyo.Divider.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    messagingUtils = require('../../util/messagingUtils');

module.exports = kind({
    name: "MessagingDivider",
    kind: Control,
    classes: "messaging-divider",

    published: {
        caption: "",
        /** Optional image before the caption, e.g. the service a message went out on. */
        icon: ""
    },

    create: function () {
        this.inherited(arguments);
        this.captionChanged();
    },

    captionChanged: function () {
        if (!this.icon) {
            this.set('allowHtml', false);
            this.setContent(this.caption || "");
            return;
        }
        this.set('allowHtml', true);
        this.setContent('<img class="messaging-divider-icon" alt="" src="' +
            messagingUtils.message.escapeHtml(this.icon) + '">' +
            messagingUtils.message.escapeHtml(this.caption || ""));
    },

    iconChanged: function () {
        this.captionChanged();
    }
});
