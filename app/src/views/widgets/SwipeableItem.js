/**
 * Enyo 2 stand-in for Mojo's enyo.SwipeableItem: drag a row sideways to reveal a confirm button.
 *
 * Swipe distance bands (util/swipeAction.js), as the Mojo app's later ConversationItem had them:
 *   short right swipe            -> onReply  (only when replyEnabled)
 *   long right swipe, any left   -> reveal the confirm prompt: its confirm button fires onConfirm,
 *                                   its Cancel button or a tap beside them fires onCancel
 *   anything shorter             -> snap back and fire onCancel
 * A prompt left unanswered goes away when a finger comes down on another row, a drag starts on
 * its own row, or the list scrolls (util/swipeArm); that fires onCancel too.
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
    swipeArm = require('../../util/swipeArm'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "SwipeableItem",
    kind: Control,
    classes: "swipeable-item",

    published: {
        confirmCaption: $L("Delete"),
        cancelCaption: $L("Cancel"),
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

    statics: {
        /** Close whichever row's prompt is showing, as when the list scrolls. */
        cancelPending: function () {
            swipeArm.cancel();
        }
    },

    handlers: {
        ondown: "downHandler",
        ondragstart: "dragstartHandler",
        ondrag: "dragHandler",
        ondragfinish: "dragfinishHandler"
    },

    /** Chrome, kept off `components` so subkind component blocks cannot clobber it. */
    swipeChrome: [
        { name: "content", classes: "swipeable-item-content" },
        {
            // As the Mojo app's ScrimmedConfirmPrompt: Cancel, then the confirm button, centred.
            name: "confirm", classes: "swipeable-confirm", showing: false, ontap: "cancelTapped",
            components: [
                { name: "cancelButton", kind: Button, ontap: "cancelTapped" },
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
        this.cancelCaptionChanged();
    },

    destroy: function () {
        swipeArm.closed(this);
        this.inherited(arguments);
    },

    confirmCaptionChanged: function () {
        this.$.confirmButton.setContent(this.confirmCaption);
    },

    cancelCaptionChanged: function () {
        this.$.cancelButton.setContent(this.cancelCaption);
    },

    // --- dragging ------------------------------------------------------------------------

    /** A finger on this row closes another row's prompt; this row's own prompt answers it. */
    downHandler: function () {
        swipeArm.down(this);
        return false;
    },

    dragstartHandler: function (inSender, inEvent) {
        // A drag on a row whose prompt is showing closes the prompt, and the list scrolls.
        if (this.$.confirm.getShowing()) {
            this.cancelPending();
            return false;
        }
        if (!this.swipeable || !inEvent.horizontal) {
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
        swipeArm.shown(this);
    },

    hideConfirm: function () {
        this.$.confirm.setShowing(false);
        swipeArm.closed(this);
    },

    /** Close the prompt unanswered: the row stays as it was (swipeArm calls this). */
    cancelPending: function () {
        if (this.$.confirm.getShowing()) {
            this.hideConfirm();
            this.doCancel({ index: this.index });
        }
    },

    confirmTapped: function (inSender, inEvent) {
        this.hideConfirm();
        this.doConfirm({ index: this.index });
        inEvent.preventDefault();
        return true;
    },

    /**
     * Cancel, or a tap on the prompt beside its buttons: close it and leave the row as it was.
     * Returning true keeps the tap from reaching the row, which would open the reactions on a
     * message or the chat on a chat row.
     */
    cancelTapped: function (inSender, inEvent) {
        this.hideConfirm();
        this.doCancel({ index: this.index });
        if (inEvent && inEvent.preventDefault) {
            inEvent.preventDefault();
        }
        return true;
    }
});
