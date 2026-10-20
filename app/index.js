/** Lauch point for LuneOS Messaging */

// Required for its side effects, not for an export, and it has to be the package itself rather
// than one of its modules. enyo-luneos/index.js is what installs the LuneOS event plumbing: it
// loads LuneOS/LuneOS.js, which turns a keyup of keyCode 27 / keyIdentifier "Back" into a
// `backgesture` document event, and then forwards backgesture (with activate, deactivate,
// menubutton, virtualkeyboard, appshow, apphide, lowmemory) into enyo/Signals. It also requires
// enyo-webos, whose index.js forwards webOSLaunch/webOSRelaunch the same way.
//
// Requiring enyo-webos/LunaService and friends - which is all this app did - pulls in those
// modules without ever running either package index, so none of those listeners existed.
// MainView's `{kind: Signals, onbackgesture: "goBack", onwebOSRelaunch: "handleRelaunch"}`
// therefore never fired: on a phone, where selecting a thread slides the conversation over the
// list, the back swipe did nothing and there was no way out of a conversation at all.
// enyo-webos first, because it is what creates window.webOS and its platform flags, and we have
// to correct those before enyo-luneos reads them.
require('enyo-webos');

// LuneOS.js gates ALL of its event plumbing on
//
//     if (webOS.platform.legacy || webOS.platform.open || webOS.platform.luneos)
//
// and sets platform.luneos only when the user agent contains "luneos". This WAM no longer says
// that. Measured on a MindPhone:
//
//   Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko)
//   Chrome/151.0.7922.108 Safari/537.36 WebAppManager
//
// and webOS.platform comes back as {} - every flag undefined - so the guard is false and none of
// the block runs. PalmSystem is present, which is the honest test for "this is a webOS app
// container", so say so before the library asks.
//
// Without this the back gesture is dead even with enyo-luneos required: the compositor's
// CardView.onSwipeLeftGesture sends Qt.Key_Escape to the focused surface, the page really does
// receive `keyup keyCode=27 key=Escape`, and nothing turns it into the `backgesture` event
// MainView listens for. On a phone that left a conversation with no way out.
if (window.PalmSystem && window.webOS && window.webOS.platform &&
        !window.webOS.platform.legacy && !window.webOS.platform.open &&
        !window.webOS.platform.luneos) {
    window.webOS.platform.luneos = true;
}

require('enyo-luneos');

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
