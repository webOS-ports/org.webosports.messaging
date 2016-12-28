/**  */

var kind = require('enyo/kind'),
    Model = require('enyo/Model');

module.exports = kind({
    name: "ContactModel",
    kind: Model,
    defaultSource: "db8",
    dbKind: "com.palm.contact:1",
    primaryKey: "_id"
});
