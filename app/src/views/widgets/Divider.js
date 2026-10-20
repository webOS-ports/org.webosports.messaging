/**
 * Section divider above the first row of each date bucket / buddy group.
 * Enyo 2 stand-in for Mojo's enyo.Divider.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control');

module.exports = kind({
    name: "MessagingDivider",
    kind: Control,
    classes: "messaging-divider",

    published: {
        caption: ""
    },

    create: function () {
        this.inherited(arguments);
        this.captionChanged();
    },

    captionChanged: function () {
        this.setContent(this.caption || "");
    }
});
