/** root Control for LuneOS Messaging */

var kind = require('enyo/kind'),
    Application = require('enyo/Application'),
    MainView = require('./views/MainView'),
    PersonCollection = require('./contactsPicker/data/PersonCollection'),
    ThreadCollection = require('./data/ThreadCollection'),
    Collection = require('enyo/Collection');

module.exports = kind({
    name: "MessagingApp",
    kind: Application,
    view: MainView,

    create: function(){
        this.inherited(arguments);

        this.log("==========> Telling global list to fetch threads...");
        this.$.globalThreadCollection.fetch({merge: true});
        //this.$.globalBuddyCollection.fetch({strategy: "merge"});
    },

    components:[
        { name:"globalThreadCollection", kind:ThreadCollection, instanceAllRecords:false},
        { name:"globalBuddyCollection", kind:Collection, instanceAllRecords:false}
    ]
});
