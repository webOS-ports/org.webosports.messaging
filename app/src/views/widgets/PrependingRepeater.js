/**
 * A DataRepeater that draws only the new rows when records are added at the start.
 *
 * DataRepeater answers every add by walking the collection and giving each existing row the model
 * at its position. Records added at index 0 shift every position, so every row was handed a new
 * model and redrawn: backfilling 30 older messages in front of 170 cost as much as drawing all 200.
 *
 * Here an add at index 0 creates rows for the new records only, puts them in front of the existing
 * rows, renumbers the rows (cheap, nothing is redrawn) and lets the old first row recompute its
 * divider, the one thing about it that depends on what now comes before it. Anything else goes to
 * DataRepeater as before.
 */

var kind = require('enyo/kind'),
    DataRepeater = require('enyo/DataRepeater');

module.exports = kind({
    name: "PrependingRepeater",
    kind: DataRepeater,

    modelsAdded: function (sender, e, props) {
        var added = props && props.models;
        var rows = this.getClientControls();
        // An add into an empty list also reports index 0; that is a plain fill, not a prepend.
        if (sender !== this.collection || !added || !added.length || props.index !== 0 ||
                !rows.length || !this.hasReset || rows.length + added.length !== this.collection.length) {
            return this.inherited(arguments);
        }

        var firstOld = rows[0];
        for (var i = 0; i < added.length; i++) {
            var row = this.createComponent({ model: added[i], index: i, addBefore: firstOld });
            if (this.generated) {
                row.render();
            }
        }

        var all = this.getClientControls();
        for (var j = 0; j < all.length; j++) {
            all[j].index = j;
        }
        if (firstOld && firstOld.setupDivider && firstOld.model) {
            firstOld.setupDivider(firstOld.model.attributes);
        }
    }
});
