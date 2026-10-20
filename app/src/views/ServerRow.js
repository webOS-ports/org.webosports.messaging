/**
 * One row of the servers list. A dedicated kind for the reason described in ThreadRow.
 *
 * The unread total, account availability and last-activity direction are not on the imserver
 * record: ServerList derives them from the visible chatthreads and the login states, and stamps
 * them onto the model, so the row picks them up through its bindings.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    ServerItem = require('./ServerItem');

module.exports = kind({
    name: "ServerRow",
    kind: Control,

    published: {
        model: null,
        selectedRow: false,
        unread: 0,
        availability: null,
        outgoing: false
    },

    bindings: [
        { from: ".model.selected", to: ".selectedRow" },
        { from: ".model.unread", to: ".unread" },
        { from: ".model.availability", to: ".availability" },
        { from: ".model.outgoing", to: ".outgoing" }
    ],

    components: [
        { name: "serverItem", kind: ServerItem }
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
        this.$.serverItem.set("record", record);
        this.unreadChanged();
        this.availabilityChanged();
        this.outgoingChanged();
        this.selectedRowChanged();
    },

    unreadChanged: function () {
        this.$.serverItem.setUnread(this.unread || 0);
    },

    availabilityChanged: function () {
        this.$.serverItem.setStatus(
            this.availability === undefined ? null : this.availability);
    },

    outgoingChanged: function () {
        this.$.serverItem.setOutgoing(!!this.outgoing);
    },

    selectedRowChanged: function () {
        this.$.serverItem.addRemoveClass("enyo-item-selected", !!this.selectedRow);
    }
});
