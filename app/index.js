/** Lauch point for LuneOS Messaging */

var
	ready = require('enyo/ready'),
    db8Source = require('./src/data/db8Source'),
    db8SourceMock = require('./src/data/db8SourceMock'),
    LunaSource = require('enyo-webos/LunaSource'),
    MessagingApp = require('./src/MessagingApp');

ready(function () {
    // console.log("enyo", enyo, enyo.store);
    if (window.PalmSystem) {
        // window.PalmSystem.stageReady();
        //load contacts from db8:
        new db8Source({name:"db8"});
        //enyo.store.addSources({db8: "db8Source"});
    } else {
        //use mocking source:
        new db8SourceMock({name:"db8"});
        //enyo.store.addSources({db8: "db8SourceMock"});
    }
    new LunaSource({name: 'lunaSource'});
    new MessagingApp({name: "app"});
});
