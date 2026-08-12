/**
 * One row of a server's channel list. A dedicated kind for the reason described in ThreadRow.
 *
 * Unread is stamped onto the model by ChannelList, which derives it from the visible chatthreads.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    ChannelItem = require('./ChannelItem');

module.exports = kind({
    name: "ChannelRow",
    kind: Control,

    published: {
        model: null,
        selectedRow: false,
        unread: 0
    },

    bindings: [
        { from: ".model.selected", to: ".selectedRow" },
        { from: ".model.unread", to: ".unread" }
    ],

    components: [
        { name: "channelItem", kind: ChannelItem }
    ],

    create: function () {
        this.inherited(arguments);
        // DataRepeater hands the model to the row as a construction property, which does not fire
        // the changed handler (DataList assigned it afterwards, which did). Populate once up front;
        // later reassignments still come through modelChanged as normal.
        if (this.model) {
            this.populateRow();
        }
    },

    modelChanged: function () {
        this.populateRow();
    },

    /** The actual population, kept off modelChanged so create() can call it directly. */
    populateRow: function () {
        var record = this.model && this.model.attributes;
        if (!record) {
            return;
        }
        this.$.channelItem.set("record", record);
        this.unreadChanged();
        this.selectedRowChanged();
    },

    unreadChanged: function () {
        // The open channel is being read, so its badge stays hidden regardless of the count.
        this.$.channelItem.setUnread(this.selectedRow ? 0 : (this.unread || 0));
    },

    selectedRowChanged: function () {
        this.$.channelItem.addRemoveClass("enyo-item-selected", !!this.selectedRow);
        this.unreadChanged();
    }
});
