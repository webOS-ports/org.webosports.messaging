/**
    Define and instantiate your enyo.Application kind in this file.  Note,
    application rendering should be deferred until DOM is ready by wrapping
    it in a call to enyo.ready().
*/
/* exported app */

enyo.kind({
    name: "messaging.Application",
    kind: "enyo.Application",
    view: "messaging.MainView",

    create: function(){
        this.inherited(arguments);
        this.$.globalThreadCollection.fetch({strategy: "merge"});
        //this.$.globalBuddyCollection.fetch({strategy: "merge"});
    },

    components:[
        { name:"globalThreadCollection", kind:"ThreadCollection", instanceAllRecords:false},
        { name:"globalBuddyCollection", kind:"Collection", instanceAllRecords:false}
    ]
});

enyo.ready(function () {
    console.log("enyo", enyo, enyo.store);
    if (window.PalmSystem) {
        window.PalmSystem.stageReady();
        //load contacts from db8:
        new db8Source({name:"db8"});
        //enyo.store.addSources({db8: "db8Source"});
    } else {
        //use mocking source:
        new db8SourceMock({name:"db8"});
        //enyo.store.addSources({db8: "db8SourceMock"});
    }
    new messaging.Application({name: "app"});
});
