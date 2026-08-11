/**
 * One row of the conversations list: an optional date divider plus the thread itself.
 *
 * This has to be its own kind rather than a components block inside ThreadList. Repeater rows are
 * created with the LIST as their owner, so every row's named controls would land in the same $
 * registry and overwrite each other — leaving one real row and a pile of blanks. A separate kind
 * gives each row its own $.
 *
 * enyo/RepeaterChildSupport hands each row its `model` and a `repeater` back-reference, and
 * decorates bubbled events with model and index, so the list's handlers still know which row fired.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    ThreadItem = require('./ThreadItem'),
    Divider = require('./widgets/Divider'),
    BucketDateFormatter = require('../util/BucketDateFormatter');

module.exports = kind({
    name: "ThreadRow",
    kind: Control,

    published: {
        model: null,
        selectedRow: false
    },

    bindings: [
        { from: ".model.selected", to: ".selectedRow" }
    ],

    components: [
        { name: "divider", kind: Divider, classes: "threadList-Divider", showing: false },
        { name: "threadItem", kind: ThreadItem }
    ],

    modelChanged: function () {
        var record = this.model && this.model.attributes;
        if (!record) {
            return;
        }
        this.setupDivider(record);
        this.$.threadItem.set("record", record);
        this.selectedRowChanged();
    },

    /** Show a divider only when this row opens a new date bucket. */
    setupDivider: function (record) {
        var collection = this.repeater && this.repeater.collection;
        var caption = BucketDateFormatter.getDateBucket(new Date(record.timestamp));
        var showDivider = true;

        if (collection) {
            var index = collection.indexOf(this.model);
            if (index > 0) {
                var previous = collection.at(index - 1);
                var previousCaption = previous &&
                    BucketDateFormatter.getDateBucket(new Date(previous.attributes.timestamp));
                showDivider = caption !== previousCaption;
            }
        }

        this.$.divider.setCaption(caption);
        this.$.divider.setShowing(showDivider);
        this.$.threadItem.addRemoveClass("enyo-first", showDivider);
    },

    selectedRowChanged: function () {
        this.$.threadItem.addRemoveClass("enyo-item-selected", !!this.selectedRow);
    }
});
