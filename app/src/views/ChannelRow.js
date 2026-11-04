/**
 * One row of a server's channel list. A dedicated kind for the reason described in ThreadRow.
 *
 * Unread is stamped onto the model by ChannelList, which derives it from the visible chatthreads.
 */

var kind = require('enyo/kind'),
    rowModelWatch = require('../util/rowModelWatch'),
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
        // Forced: the model merges each result into the same attributes object, so the record is
        // the same reference every time and a plain set() would see no change and not redraw.
        this.$.channelItem.set("record", record, { force: true });
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
