/**  */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    Panels = require('layout/Panels'),
    Image = require('enyo/Image'),
    CardArranger = require('layout/CardArranger'),
    CollapsingArranger = require('layout/CollapsingArranger'),
    Toolbar = require('onyx/Toolbar'),
    RadioGroup = require('onyx/RadioGroup'),
    ThreadList = require('./ThreadList'),
    BuddyList = require('./BuddyList'),
    ThreadView = require('./ThreadView'),
    Signals = require('enyo/Signals'),
    utils = require('enyo/utils'),
    LunaService = require('enyo-webos/LunaService'),
    $L = require('enyo/i18n').$L,   // no-op placeholder
    showErrorBanner = require('../util/showErrorBanner'),
    ThreadModel = require('../data/ThreadModel'),
    enyoLuneos = require('enyo-luneos');


module.exports = kind({
    name: "messaging.MainView",
    kind: FittableRows,
    bindings:[
        {from:".app.$.globalThreadCollection.status", to:".globalThreadCollectionStatus"}
    ],
    launchParamsHandled: false,
    components: [
        {
            name: "main",
            kind: Panels,
            arrangerKind: CollapsingArranger,
            draggable: false,
            classes: "app-panels",
            fit: true,
            narrowFit: false, //collapses to one panel only if width < 800px
            components: [
                {
                    kind: FittableRows,
                    fit: true,
                    style: "height: 100%; width: 38.2%;",   /* golden ratio */
                    components:[
                        {
                            name: "toolbar",
                            kind: Toolbar,
                            classes: 'flex-row',
                            components: [
                                {classes: 'flex-auto'},
                                {
                                    name: "tabs",
                                    kind: RadioGroup,
                                    classes: 'flex-none',
                                    controlClasses: "onyx-tabbutton",
                                    onActivate: "paneChange",
                                    components: [
                                        { name: "conversations", content: $L("Conversations"), index: 0, active: true },
                                        { name: "buddies", content: $L("Buddies"), index: 1 }
                                    ]
                                },
                                {classes: 'flex-auto'}
                            ]
                        },
                        {
                            name:"viewPanel",
                            kind: Panels,
                            arrangerKind: CardArranger,
                            fit:true,
                            draggable:false,
                            components:[
                                { name: "threadList", kind: ThreadList,
                                        onSelectThread: "showThread", onDeleteThread:"deleteThread", onCreateThread:"createThread",
                                        style:"width:100%; width:100%;"},
                                { name: "buddyList", kind:BuddyList, onSelectThread: "showThread"}
                            ]
                        }

                    ]
                },
                {
                    name: "threadPanel",
                    kind: Panels,
                    arrangerKind: CardArranger,
                    fit: true,
                    draggable: false,
                    classes: "details",
                    components: [
                        {
                            name: "empty",
                            style: 'display: flex; flex-direction: column; justify-content: center; align-items: center',
                            components: [
                                {kind: Image, src: 'assets/notification-large-messaging-mult.png'},
                                {
                                    style: "text-align: center; color: darkGray",
                                    content: $L("Select a thread on the left to see its messages.")
                                }
                            ]
                        },
                        { name: "threadView", kind: ThreadView, onSelectThread: "showThread", onDeleteThread:"deleteThread"}
                    ]
                }
            ]
        },
        {
            kind: Signals,
            onbackgesture: "goBack",
            onwebOSRelaunch: "handleRelaunch"
        },
        {
            name: 'deleteChatthreadService', kind: LunaService,
            service: 'luna://org.webosports.service.messaging', method: 'deleteChatthread',
            mock: ! ('PalmSystem' in window),
            onError: 'deleteChatthreadErr'
        }
    ],
    create: function () {
        this.inherited(arguments);

    },
    handleRelaunch: function(inSender, inEvent) {
        this.log();
        this.launchParamsHandled = false;
        this.handleLaunchParam();
    },
    /** called after threads loaded or reloaded, and on relaunch */
    handleLaunchParam: function handleLaunchParam() {
        var callerName = handleLaunchParam.caller && (handleLaunchParam.caller.displayName || handleLaunchParam.caller.name);
        this.log("called by: “" + callerName + "”");
        setTimeout(this.processParams.bind(this), 0);
    },
    processParams: function () {
        this.log("launchParamsHandled:", this.launchParamsHandled);
        if (this.launchParamsHandled) {
            return;
        }
        this.launchParamsHandled = true;

        var params;
        try {
            if ('PalmSystem' in window && PalmSystem.launchParams) {
                params = JSON.parse(PalmSystem.launchParams);
            } else {
                return;
            }
        } catch (err) {
            this.error(err);
            showErrorBanner(err);
            return;
        }

        this.log(params);
        var threadParam;
        try {
            if (typeof(params.threadId) !== 'undefined') {
                var model = this.app.$.globalThreadCollection.find(function (candidate) {
                    return (candidate.get("_id") === params.threadId);
                });
                if (model) {
                    this.showThread({name: "Relaunch Handler"}, {thread: model});
                } else {
                    PalmSystem.addBannerMessage($L("File a detailed bug report:") + " unknown thread");
                }
            } else if (params.compose && (params.compose.ims || params.compose.messageText)) {
                // this branch is probably obsolete - DR
                threadParam = {};
                if (params.compose.ims && params.compose.ims.length > 0) {
                    threadParam.recipientName = params.compose.ims[0].value || params.compose.ims[0].addr;
                }
                if (params.compose.messageText) {
                    threadParam.messageText = params.compose.messageText;
                }
                this.createThread(this, threadParam);
            } else if (params.target) {
                var parsedUrl = this.parseUrl(params.target);
                this.log(parsedUrl);
                switch (parsedUrl.protocol) {
                    case 'im:':
                        threadParam = parsedUrl.searchParam;
                        threadParam.recipientName = parsedUrl.pathname;
                        threadParam.messageText = parsedUrl.searchParam.body;
                        this.createThread(this, threadParam);
                        break;
                    case 'sms:':
                        threadParam = parsedUrl.searchParam;
                        var numbers = parsedUrl.pathname.split(",");
                        threadParam.recipientName = numbers[0];   // TODO: use all numbers
                        threadParam.messageText = parsedUrl.searchParam.body;
                        this.createThread(this, threadParam);
                        break;
                }
            }
        } catch (err) {
            this.error(err);
        }
    },
    parseUrl: function (url) {
        var parser = document.createElement('a'),
            searchParam = {},
            pairs, split, i;
        parser.href = url;
        pairs = parser.search.replace(/^\?/, '').split('&');
        for (i = 0; i < pairs.length; i++ ) {
            split = pairs[i].split('=');
            if (split[0] && split[1]) {
                searchParam[decodeURIComponent(split[0])] = decodeURIComponent(split[1]);
            }
        }
        return {
            protocol: parser.protocol,
            host: parser.host,
            hostname: parser.hostname,
            port: parser.port,
            pathname: decodeURIComponent(parser.pathname),
            search: decodeURIComponent(parser.search),
            searchParam: searchParam,
            hash: decodeURIComponent(parser.hash)
        };
    },
    showThread: function (inSender, inEvent) {
        this.log(inSender && inSender.name, inEvent && inEvent.thread && inEvent.thread.attributes);

        if (!inEvent || !inEvent.thread) {
            this.$.threadPanel.setIndex(0);
            this.$.main.setIndex(0);
            return true;
        }

        this.$.threadView.setThread(inEvent.thread);

        if (inSender !== this.$.threadList) {
            this.$.threadList.forceSelectThread(inEvent.thread);
        }
        this.$.threadPanel.setIndex(1);
        if (Panels.isScreenNarrow()) {
            this.$.main.setIndex(1);
        }
    },

    createThread: function(s,e){
        this.log("recipientName:" + e.recipientName, "type:" + e.type,
                "personId:" + e.personId, "messageText:" + e.messageText);
        this.$.threadView.setMessageText('');
        var emptyThread = new ThreadModel();
        this.app.$.globalThreadCollection.add(emptyThread, {index: 0});
        this.showThread(this, {thread: emptyThread});
        if (e) {
            if (e.messageText) {
                this.$.threadView.setMessageText(e.messageText);
            }
            if (e.recipientName) {
                this.$.threadView.setRecipientAddr(e.recipientName);
            }
            // TODO: use personId to select an exact recipient
        }
    },

    deleteThread: function(s,e){
        var thread = e.thread|| e.originator.thread;
        this.log("thread to be deleted is", thread && thread.toJSON());
        if (thread) {
            if (thread.get('_id')) {
                this.$.deleteChatthreadService.send({threadId:thread.get('_id')});
            }
            this.app.$.globalThreadCollection.remove(thread);
            this.showThread(s, {});
        } else {
            var msg = $L("No conversation selected");
            this.warn(msg);
            if (window.PalmSystem) { PalmSystem.addBannerMessage(msg, '{ }', "icon.png", "alerts"); }
        }

    },
    deleteChatthreadErr: function (inSender, inError) {
        this.error(inError.errorText || inError);
        var msg = inError.errorText || inError.toString();
        if (window.PalmSystem) { PalmSystem.addBannerMessage(msg, '{ }', "icon.png", "alerts"); }
    },

    paneChange: function(inSender, inEvent){
        //console.log("paneChange", inSender, inEvent);
        inEvent&&inEvent.originator&&inEvent.originator.active?this.$.viewPanel.setIndex(inEvent.originator.index||0):null;
    },
    goBack: function () {
        this.log(Panels.isScreenNarrow());
        if (Panels.isScreenNarrow()) {
            this.$.main.setIndex(0);
        }
    }
});
