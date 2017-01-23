/**
 * Collection of messaging addresses & phone numbers (for SMS), from user's contacts.
 * Copyright © 2017 by P. Douglas Reeder under the Apache 2.0 license.
 */

var kind = require('enyo/kind'),
    Collection = require('enyo/Collection'),
    MsgAddrModel = require('./MsgAddrModel'),
    PersonCollection = require('./PersonCollection'),
    showErrorBanner = require('../util/showErrorBanner');


module.exports = kind({
    name: "MsgAddrCollection",
    kind: Collection,
    published: {
        searchText: ""
    },
    model: MsgAddrModel,
    personCollection: new PersonCollection(),
    extractSuccess: null,

    fetch: function (opts) {
        this.log(opts);
        this.extractSuccess = opts && opts.success;

        this.personCollection.fetch({
                success: this.extract.bind(this),
                error: opts && opts.error || showErrorBanner,
                modelOptions:{parse:true},
                orderBy: 'sortKey'
        });
    },

    searchTextChanged: function (oldValue, newValue, propertyChanged, opts) {
        this.log(">>"+this.get('searchText')+"<<", arguments);
        this.extract(this, opts, this.personCollection)
    },

    extract: function (sender, opts, people, sourceName) {
        this.log(people.length, "   people instanceof Array:", people instanceof Array);
        var searchText = this.searchText.trim().toLowerCase();
        var searchLength = searchText.length;
        var msgAddrData = [];
        people.forEach(function (person) {
            var allSearchTerms = person.get("allSearchTerms") || [""];
            for (i=0; i<allSearchTerms.length; ++i) {   // if any search term matches, add all addr for person
                if (allSearchTerms[i].slice(0, searchLength) === searchText) {
                    var displayName = person.get('displayName');
                    var personId = person.get('_id');
                    if (person.get('ims')) {
                        person.get('ims').forEach(function (imAddr) {
                            console.log(displayName, imAddr.value, imAddr.type);
                            msgAddrData.push({
                                displayName: displayName,
                                personId: personId,
                                value: imAddr.value,
                                isPhone: false,
                                type: imAddr.type
                            });
                        });
                    }
                    if (person.get('phoneNumbers')) {
                        person.get('phoneNumbers').forEach(function (phoneNumber) {
                            console.log(displayName, phoneNumber.value, phoneNumber.type);
                            msgAddrData.push({
                                displayName: displayName,
                                personId: personId,
                                value: phoneNumber.value,
                                isPhone: true,
                                type: phoneNumber.type
                            });
                        });
                    }
                    break;
                }
            }
        });

        this.log("replacing with " + msgAddrData.length + " models");
        var removedModels = this.empty(msgAddrData);

        if (this.extractSuccess instanceof Function) {
            this.extractSuccess(people.length, msgAddrData.length);
        }
    }
});
