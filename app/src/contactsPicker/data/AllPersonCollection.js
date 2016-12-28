/**
 * Created by doug on 12/24/16.
 */


var kind = require('enyo/kind'),
    Collection = require('enyo/Collection'),
    PersonModel = require('./PersonModel'),
    PersonCollection = require('./PersonCollection');


module.exports = kind({
    name: "AllPersonCollection",
    kind: Collection,
    model: PersonModel,
    // source: "db8",
    dbKind: "com.palm.person:1",
    published: {
        searchText: ""
    },
    globalPersonCollection: new PersonCollection({options: {}}),

    reload: function (callback) {
        this.log(callback);
        this.globalPersonCollection.fetch({merge: true, parse:true, orderBy: "sortKey", modelOptions:{parse:true}, success: callback});
        // function (collection, opts, records) {
        //     console.log("loaded globalPersonCollection", collection, collection.length);
        //     // this.$.contactsSearchList.refilter();
        // }});
    },

    searchTextChanged: function () {
        // this.log("this.globalPersonCollection.length", this.globalPersonCollection.length);
        var searchText = this.searchText.trim().toLowerCase();
        var searchLength = searchText.length;
        this.empty();
        this.add(this.globalPersonCollection.filter(function(item) {
            var i, allSearchTerms, name;
            try {
                // console.log("allSearchTerms", item, item.get("allSearchTerms"))
                allSearchTerms = item.get("allSearchTerms") || [""];
                for (i=0; i<allSearchTerms.length; ++i) {
                    if (allSearchTerms[i].slice(0, searchLength) === searchText) { return true;}
                }
            } catch (err) {
                console.error(err);
            }
            return false;
        }),{parse:true, merge:true});
        this.log(this.get("length"), "records match", '"' + searchText + '"');
    }
});
