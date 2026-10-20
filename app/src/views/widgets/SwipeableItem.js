/**
 * Enyo 2 stand-in for Mojo's enyo.SwipeableItem: drag a row sideways to reveal a confirm button.
 *
 * Swipe distance bands match ConversationItem's override in the Mojo app:
 *   short right swipe            -> onReact  (only when reactEnabled)
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
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "SwipeableItem",
    kind: Control,
    classes: "swipeable-item",

    published: {
        confirmCaption: $L("Delete"),
        /** Set false on rows that must not be swipe-deleted. */
        swipeable: true,
        /** When true a short right swipe fires onReact instead of arming the delete prompt. */
        reactEnabled: false,
        /** Row index, set by the owning list so handlers know which record was swiped. */
        index: -1
    },

    events: {
        onConfirm: "",
        onCancel: "",
        onReact: ""
    },

    handlers: {
        ondragstart: "dragstartHandler",
        ondrag: "dragHandler",
        ondragfinish: "dragfinishHandler"
    },

    /** Minimum right-swipe distance, in px, that counts as a react rather than a stray drag. */
    reactMinPx: 45,
    /** Fraction of the row width past which a right swipe means delete rather than react. */
    deleteRatio: 0.55,

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
        var dx = inEvent.dx || 0;
        var width = (this.getBounds && this.getBounds().width) || 0;
        var deletePx = Math.floor(width * this.deleteRatio);

        this.handlingDrag = false;
        this.resetPosition();
        if (inEvent.preventTap) {
            inEvent.preventTap();
        }

        if (dx <= -this.reactMinPx || (!this.reactEnabled && dx >= this.reactMinPx) || dx >= deletePx) {
            // A left swipe of any length, or a long right swipe, arms the delete prompt. With
            // reactions off, any right swipe past the threshold does too.
            this.showConfirm();
        } else if (this.reactEnabled && dx >= this.reactMinPx) {
            this.doReact({ index: this.index });
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
