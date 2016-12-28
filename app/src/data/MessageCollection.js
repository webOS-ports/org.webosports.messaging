/**  */

var kind = require('enyo/kind'),
    Collection = require('enyo/Collection'),
    MessageModel = require('./MessageModel');


module.exports = kind({
    name: "MessageCollection",
    kind: Collection,
    model: MessageModel,
    source: "db8",
    dbKind: "com.palm.message:1"
    //best is to not store this collection... might break things. urgs.
});

