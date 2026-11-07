/**
 * Enyo 2 stand-in for Mojo's enyo.SwipeableItem: drag a row sideways to reveal a confirm button.
 *
 * Swipe distance bands (util/swipeAction.js), as the Mojo app's later ConversationItem had them:
 *   short right swipe            -> onReply  (only when replyEnabled)
 *   long right swipe, any left   -> reveal the confirm prompt, which fires onConfirm when tapped
 *   anything shorter             -> snap back and fire onCancel
 *
 * The sliding content and the confirm prompt are created in initComponents rather than declared in
 * a `components` block: under Enyo 2 a subkind's `components` REPLACES the base kind's, so chrome
 * declared that way would be wiped out by every row kind that subclasses this. Building it here and
 * pointing controlParent at the content control means subkinds declare their row contents normally
 * and still land inside the sliding element.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    Button = require('onyx/Button'),
    dom = require('enyo/dom'),
    swipeAction = require('../../util/swipeAction'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "SwipeableItem",
    kind: Control,
    classes: "swipeable-item",

    published: {
        confirmCaption: $L("Delete"),
        /** Set false on rows that must not be swipe-deleted. */
        swipeable: true,
        /** When true a short right swipe fires onReply instead of arming the delete prompt. */
        replyEnabled: false,
        /** Row index, set by the owning list so handlers know which record was swiped. */
        index: -1
    },

    events: {
        onConfirm: "",
        onCancel: "",
        onReply: ""
    },

    handlers: {
        ondragstart: "dragstartHandler",
        ondrag: "dragHandler",
        ondragfinish: "dragfinishHandler"
    },

    /** Chrome, kept off `components` so subkind component blocks cannot clobber it. */
    swipeChrome: [
        { name: "content", classes: "swipeable-item-content" },
        {
            name: "confirm", classes: "swipeable-confirm", showing: false, components: [
                {
                    name: "confirmButton", kind: Button, classes: "onyx-negative",
                    ontap: "confirmTapped"
                }
            ]
        }
    ],

    initComponents: function () {
        this.createChrome(this.swipeChrome);
        // Everything a subkind declares goes inside the sliding element.
        this.controlParent = this.$.content;
        this.inherited(arguments);
    },

    create: function () {
        this.inherited(arguments);
        this.handlingDrag = false;
        this.confirmCaptionChanged();
    },

    confirmCaptionChanged: function () {
        this.$.confirmButton.setContent(this.confirmCaption);
    },

    // --- dragging ------------------------------------------------------------------------

    dragstartHandler: function (inSender, inEvent) {
        if (!this.swipeable || !inEvent.horizontal) {
            return false;
        }
        // A revealed prompt swallows the drag; tapping its button or elsewhere dismisses it.
        if (this.$.confirm.getShowing()) {
            return false;
        }
        this.handlingDrag = true;
        return true;
    },

    dragHandler: function (inSender, inEvent) {
        if (!this.handlingDrag) {
            return false;
        }
        this.setPosition(inEvent.dx);
        return true;
    },

    dragfinishHandler: function (inSender, inEvent) {
        if (!this.handlingDrag) {
            return false;
        }
        var width = (this.getBounds && this.getBounds().width) || 0;
        var action = swipeAction(inEvent.dx, width, this.replyEnabled);

        this.handlingDrag = false;
        this.resetPosition();
        if (inEvent.preventTap) {
            inEvent.preventTap();
        }

        if (action === "confirm") {
            this.showConfirm();
        } else if (action === "reply") {
            this.doReply({ index: this.index });
        } else {
            this.doCancel({ index: this.index });
        }
        return true;
    },

    setPosition: function (dx) {
        dom.transformValue(this.$.content, "translateX", dx + "px");
    },

    resetPosition: function () {
        dom.transformValue(this.$.content, "translateX", "0px");
    },

    // --- confirm prompt ------------------------------------------------------------------

    showConfirm: function () {
        this.$.confirm.setShowing(true);
    },

    hideConfirm: function () {
        this.$.confirm.setShowing(false);
    },

    confirmTapped: function (inSender, inEvent) {
        this.hideConfirm();
        this.doConfirm({ index: this.index });
        inEvent.preventDefault();
        return true;
    }
});
