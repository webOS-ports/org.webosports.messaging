/**
 * One row of a conversation: an optional divider plus the message bubble.
 * A dedicated kind for the reason described in ThreadRow.
 */

var kind = require('enyo/kind'),
    rowModelWatch = require('../util/rowModelWatch'),
    Control = require('enyo/Control'),
    ConversationItem = require('./ConversationItem'),
    Divider = require('./widgets/Divider'),
    messagingUtils = require('../util/messagingUtils');

/** SMS and MMS are one transport. */
function sameService(a, b) {
    var utils = messagingUtils.utils;
    return a === b || (utils.isTextMessage(a) && utils.isTextMessage(b));
}

module.exports = kind({
    name: "ConversationRow",
    kind: Control,

    published: {
        model: null
    },

    // Nothing to bind — the bubble is populated imperatively in modelChanged. The array still has
    // to be declared: RepeaterChildSupport.modelChanged calls syncBindings(), which walks
    // this.bindings, and the repeater assigns the model during construction, before BindingSupport
    // would otherwise create it.
    bindings: [],

    components: [
        { name: "divider", kind: Divider, classes: "conversationDivider", showing: false },
        // "N unread messages", above the first message that was unread when the chat opened
        // (ConversationList.unreadLineCaption, util/unreadMarker).
        { name: "unreadLine", classes: "conversation-unread-line", showing: false },
        { name: "conversationItem", kind: ConversationItem }
    ],

    create: function () {
        this.inherited(arguments);
        // DataRepeater hands the model to the row as a construction property, which does not fire
        // the changed handler (DataList assigned it afterwards, which did). Populate once up front;
        // later reassignments still come through modelChanged as normal.
        if (this.model) {
            rowModelWatch.show(this);
        }
    },

    destroy: function () {
        rowModelWatch.stop(this);
        this.inherited(arguments);
    },

    modelChanged: function () {
        rowModelWatch.show(this);
    },

    /** The actual population, kept off modelChanged so create() can call it directly. */
    populateRow: function () {
        var record = this.model && this.model.attributes;
        if (!record) {
            return;
        }
        this.setupDivider(record);
        this.setupUnreadLine(record);
        this.$.conversationItem.setMessage(record);
    },

    setupUnreadLine: function (record) {
        var list = this.repeater && this.repeater.owner;
        var caption = list && list.unreadLineCaption ? list.unreadLineCaption(record) : "";
        if (caption) {
            this.$.unreadLine.setContent(caption);
        }
        this.$.unreadLine.setShowing(!!caption);
    },

    /**
     * The divider repeats whenever the correspondent, the transport or the day changes, so a
     * conversation that switched transport mid-thread shows where it switched.
     */
    setupDivider: function (record) {
        var list = this.repeater && this.repeater.owner;
        var collection = this.repeater && this.repeater.collection;
        if (!list || !list.getDividerCaption) {
            this.$.divider.setShowing(false);
            return;
        }

        var caption = list.getDividerCaption(record);
        var showDivider = true;

        if (collection) {
            var index = collection.indexOf(this.model);
            if (index > 0) {
                var previous = collection.at(index - 1);
                // The service counts too: Signal and WhatsApp share the phone number, so a switch
                // between them left the caption the same and showed no divider at all.
                showDivider = previous ?
                    caption !== list.getDividerCaption(previous.attributes) ||
                    !sameService(record.serviceName, previous.attributes.serviceName) : true;
            }
        }

        this.$.divider.set('icon', list.getDividerIcon ? list.getDividerIcon(record) || "" : "");
        this.$.divider.setCaption(caption);
        this.$.divider.setShowing(showDivider);
    }
});
