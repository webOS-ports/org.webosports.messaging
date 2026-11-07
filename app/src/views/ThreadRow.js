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
    rowModelWatch = require('../util/rowModelWatch'),
    Control = require('enyo/Control'),
    ThreadItem = require('./ThreadItem'),
    Divider = require('./widgets/Divider'),
    BucketDateFormatter = require('../util/BucketDateFormatter'),
    chatFlags = require('../util/chatFlags');

/** The divider caption of a row: "Pinned" for a pinned chat, else its date bucket. */
function captionOf(record, list) {
    return chatFlags.dividerCaption(record, !!(list && list.inArchive),
        BucketDateFormatter.getDateBucket(new Date(record.timestamp)));
}

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
        // Forced: the model merges each result into the same attributes object, so the record is
        // the same reference every time and a plain set() would see no change and not redraw.
        this.$.threadItem.set("record", record, { force: true });
        this.selectedRowChanged();
    },

    /** Show a divider only when this row opens a new date bucket. */
    setupDivider: function (record) {
        var collection = this.repeater && this.repeater.collection;
        var list = this.repeater && this.repeater.owner;
        var caption = captionOf(record, list);
        var showDivider = true;

        if (collection) {
            var index = collection.indexOf(this.model);
            if (index > 0) {
                var previous = collection.at(index - 1);
                var previousCaption = previous && captionOf(previous.attributes, list);
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
