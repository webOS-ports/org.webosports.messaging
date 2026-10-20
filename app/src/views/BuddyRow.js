/**
 * One row of the buddies list: an optional group divider plus the buddy itself.
 * A dedicated kind for the reason described in ThreadRow — repeater rows share the list's $.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    BuddyItem = require('./BuddyItem'),
    Divider = require('./widgets/Divider'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "BuddyRow",
    kind: Control,

    published: {
        model: null,
        selectedRow: false
    },

    bindings: [
        { from: ".model.selected", to: ".selectedRow" }
    ],

    components: [
        { name: "divider", kind: Divider, classes: "buddyList-Divider", showing: false },
        { name: "buddyItem", kind: BuddyItem }
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
        this.setupDivider(record);
        this.$.buddyItem.set("record", record);
        this.selectedRowChanged();
    },

    /** Offline buddies collect under one divider; the rest group by their buddy group. */
    captionFor: function (record) {
        var offlineCaption = $L("offline");
        return record.offline ? offlineCaption : (record.group || offlineCaption);
    },

    setupDivider: function (record) {
        var list = this.repeater && this.repeater.owner;
        // While searching, results are not grouped, matching the Mojo list.
        if (list && list.filterString) {
            this.$.divider.setShowing(false);
            return;
        }

        var collection = this.repeater && this.repeater.collection;
        var caption = this.captionFor(record);
        var showDivider = true;

        if (collection) {
            var index = collection.indexOf(this.model);
            if (index > 0) {
                var previous = collection.at(index - 1);
                showDivider = previous ? caption !== this.captionFor(previous.attributes) : true;
            }
        }

        this.$.divider.setCaption(String(caption).toUpperCase());
        this.$.divider.setShowing(showDivider);
        this.$.buddyItem.addRemoveClass("enyo-first", showDivider);
    },

    selectedRowChanged: function () {
        this.$.buddyItem.addRemoveClass("enyo-item-selected", !!this.selectedRow);
    }
});
