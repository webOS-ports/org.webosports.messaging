/** Lauch point for LuneOS Messaging */

// Required for its side effects, not for an export, and it has to be the package itself rather
// than one of its modules. webos-lib/index.js is what installs the LuneOS event plumbing: the
// keyup -> `backgesture` emulation and the document -> Signals forwarding behind MainView's
// {kind: Signals, onbackgesture: "goBack", onwebOSRelaunch: "handleRelaunch", ...}. It also
// requires enyo-webos, whose index forwards webOSLaunch/webOSRelaunch the same way.
//
// Requiring enyo-webos/LunaService and friends - which is all this app did for a long time -
// pulls in those modules without running either package index, so none of the listeners existed:
// the bundle shipped MainView's onbackgesture handler and nothing able to fire it, and on a phone
// a conversation had no way back to the thread list.
//
// This used to be followed by a block forcing webOS.platform.luneos, because LuneOS.js gated its
// event plumbing on a user agent that current WAM no longer sends. webos-lib carries that fix
// now, and no longer gates the back gesture on platform detection at all.
require('webos-lib');

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
    var app = new MessagingApp({name: "app"});

    if (!window.PalmSystem) {
        // The packed bundle scopes every module, so there is otherwise no way to reach the running
        // app from the console. Expose it when developing in a browser (see the debugging notes in
        // README.md); on device this stays off.
        window.app = app;
    }
});
