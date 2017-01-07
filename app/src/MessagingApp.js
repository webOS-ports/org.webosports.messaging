/** root Control for LuneOS Messaging */

var kind = require('enyo/kind'),
    Application = require('enyo/Application'),
    MainView = require('./views/MainView'),
    ThreadCollection = require('./data/ThreadCollection'),
    Collection = require('enyo/Collection');

module.exports = kind({
    name: "MessagingApp",
    kind: Application,
    view: MainView,

    create: function(){
        this.inherited(arguments);

        //this.$.globalBuddyCollection.fetch({strategy: "merge"});
    },

    components:[
        { name:"globalThreadCollection", kind:ThreadCollection, instanceAllRecords:false},
        { name:"globalBuddyCollection", kind:Collection, instanceAllRecords:false}
    ]
});
