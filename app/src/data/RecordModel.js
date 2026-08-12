/**
 * A db8 record as an enyo Model.
 *
 * The only thing that matters here is the primary key: db8 records are keyed on `_id`, and the
 * collections rely on that to merge an incoming result set onto the models already on screen
 * instead of replacing them wholesale.
 */

var kind = require('enyo/kind'),
    Model = require('enyo/Model');

module.exports = kind({
    name: "RecordModel",
    kind: Model,
    primaryKey: "_id"
});
