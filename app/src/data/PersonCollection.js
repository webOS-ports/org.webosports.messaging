/**  */


var kind = require('enyo/kind'),
    Collection = require('enyo/Collection'),
    PersonModel = require('./PersonModel');


module.exports = kind({
    name: "PersonCollection",
    kind: Collection,
    model: PersonModel,
	source: "db8",
    dbKind: "com.palm.person:1",

    fetched: function (opts, res, sourceName) {
        console.log("PersonCollection fetched:", opts, sourceName);
        this.inherited(arguments);
    }
});
