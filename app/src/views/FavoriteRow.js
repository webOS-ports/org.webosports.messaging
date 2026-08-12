/**
 * One row of the favorites list. A dedicated kind for the reason described in ThreadRow.
 */

var kind = require('enyo/kind'),
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
        this.$.favoriteItem.set("record", record);
        this.selectedRowChanged();
    },

    selectedRowChanged: function () {
        this.$.favoriteItem.addRemoveClass("enyo-item-selected", !!this.selectedRow);
    }
});
