/** root Control for LuneOS Messaging */

var kind = require('enyo/kind'),
    Application = require('enyo/Application'),
    MainView = require('./views/MainView'),
    showErrorBanner = require('./util/showErrorBanner'),
    ThreadCollection = require('./data/ThreadCollection'),
    Collection = require('enyo/Collection'),
    AccountCapabilityCollection = require('./data/AccountCapabilityCollection');

module.exports = kind({
    name: "MessagingApp",
    kind: Application,
    view: MainView,

    create: function(){
        this.inherited(arguments);

        this.log("==========> Telling global list to fetch threads...");
        this.$.globalThreadCollection.fetch({ merge: true,
            success: this.$.mainView.handleLaunchParam.bind(this.$.mainView), error: showErrorBanner });

        //this.$.globalBuddyCollection.fetch({strategy: "merge"});

        var app = this;
        this.$.globalAccountCapabilityCollection.fetch({
            success: function (collection, param, foo, sourceName) {
                console.log("accountCapabilites fetched", collection);
                app.providerSet = {};
                collection.forEach(function (model, index, array) {
                    console.log(index, model.get('loc_name'), model.get('username'), model.get('capabilitySubtype'),
                        model.attributes);
                    if (model.get('serviceName')) {
                        app.providerSet[model.get('serviceName')] = true;
                    } else if (model.get('capabilitySubtype') === 'SMS') {
                        app.providerSet['type_sms'] = true;
                    } else {
                        console.error("can't figure out type of ", model);
                    }
                });
                console.log("providerSet:", app.providerSet);
            },
            error: showErrorBanner
        });
    },

    components:[
        { name:"globalThreadCollection", kind:ThreadCollection, instanceAllRecords:false},
        { name:"globalBuddyCollection", kind:Collection, instanceAllRecords:false},
        { name: 'globalAccountCapabilityCollection', kind: AccountCapabilityCollection}
    ]
});
