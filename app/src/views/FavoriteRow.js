/**
 * One row of the favorites list. A dedicated kind for the reason described in ThreadRow.
 */

var kind = require('enyo/kind'),
    rowModelWatch = require('../util/rowModelWatch'),
    Control = require('enyo/Control'),
    FavoriteItem = require('./FavoriteItem');

module.exports = kind({
    name: "FavoriteRow",
    kind: Control,

    published: {
        model: null,
        selectedRow: false
    },

    bindings: [
        { from: ".model.selected", to: ".selectedRow" }
    ],

    components: [
        { name: "favoriteItem", kind: FavoriteItem }
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
        this.$.favoriteItem.set("record", record, { force: true });
        this.selectedRowChanged();
    },

    selectedRowChanged: function () {
        this.$.favoriteItem.addRemoveClass("enyo-item-selected", !!this.selectedRow);
    }
});
