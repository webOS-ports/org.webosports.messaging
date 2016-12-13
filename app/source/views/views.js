enyo.kind({
    name: "messaging.MainView",
    kind: "FittableRows",
    bindings:[
        {from:".app.$.globalThreadCollection.status", to:".globalThreadCollectionStatus"}
    ],
    components: [
        {
            name: "main",
            kind: "enyo.Panels",
            arrangerKind: "enyo.CollapsingArranger",
            draggable: false,
            classes: "app-panels",
            fit: true,
            narrowFit: false, //collapses to one panel only if width < 800px
            components: [
                {
                    kind:"FittableRows",
                    style: "width: 38.2%;",   /* golden ratio */
                    components:[
                        {
                            name: "toolbar",
                            kind: "onyx.Toolbar",
                            classes: 'flex-row',
                            components: [
                                {classes: 'flex-auto'},
                                {
                                    name: "tabs",
                                    kind: "onyx.RadioGroup",
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
                            kind:"enyo.Panels",
                            arrangerKind:"CardArranger",
                            fit:true,
                            draggable:false,
                            components:[
                                { name: "threadList", kind: "ThreadList",
                                        onSelectThread: "showThread", onDeleteThread:"deleteThread", onCreateThread:"createThread",
                                        style:"width:100%; width:100%;"},
                                { name: "buddyList", kind:"BuddyList", onSelectThread: "showThread"}
                            ]
                        }

                    ]
                },
                {
                    name: "threadPanel",
                    kind: "enyo.Panels",
                    arrangerKind:"CardArranger",
                    fit: true,
                    draggable: false,
                    classes: "details",
                    components: [
                        {
                            name: "empty",
                            components: [
                                {
                                    style: "display: block; margin: 10px auto; text-align: center;",
                                    content: "Please select a thread on the left to see its messages."
                                }
                            ]
                        },
                        { name: "threadView", kind: "ThreadView", onSelectThread: "showThread", onDeleteThread:"deleteThread"}
                    ]
                }
            ]
        },
        {
            kind: "enyo.Signals",
            onbackbutton: "goBack",
            onwebOSRelaunch: "handleRelaunch"
        },
        {
            name: 'deleteChatthreadService', kind: 'enyo.LunaService',
            service: 'luna://org.webosports.service.messaging', method: 'deleteChatthread',
            mock: ! ('PalmSystem' in window),
            onError: 'deleteChatthreadErr'
        }
    ],
    create: function () {
        this.inherited(arguments);
        this.log("==========> Telling global list to fetch threads...");
    },
    handleRelaunch: function(inSender, inEvent) {
        try {
            this.log("sender:", inSender, ", event:", inEvent);
            this.log("launchParams: ", PalmSystem.launchParams);
			
            var params;
            try {
                params = JSON.parse(PalmSystem.launchParams);
            } catch (err) {
                params = {}
            }
            var threadParam, match;

            if (typeof(params.threadId) !== 'undefined') {
                var model = this.app.$.globalThreadCollection.find(function (candidate) {
                    return (candidate.get("_id") === params.threadId);
                });
                if (model) {
                    this.showThread({name: "Relaunch Handler"}, {thread: model});
                }
            } else if (params.compose && (params.compose.ims || params.compose.messageText)) {
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
                this.log(JSON.stringify(parsedUrl));
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
        if (window.PalmSystem && !window.PalmSystem.isActivated) {
            window.PalmSystem.activate();
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
    globalThreadCollectionStatusChanged: function () {
        // Handling the launchParams synchronously seems to cause issues with things not being initialized yet.
        // Handle them in the next frame.
        enyo.asyncMethod(this, function () {
            if (window.PalmSystem) {
                if(PalmSystem.launchParams !== null)
                    this.handleRelaunch();
            }
        });
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
        if (enyo.Panels.isScreenNarrow()) {
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
            enyo.warn(msg);
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
        this.log(enyo.Panels.isScreenNarrow());
        if (enyo.Panels.isScreenNarrow()) {
            this.$.main.setIndex(0);
        }
    }
});
