/*global GlobalThreadCollection */


enyo.kind({
    name: "messaging.MainView",
    kind: "FittableRows",
    bindings:[
        {from:".app.$.globalThreadCollection.status", to:".globalThreadCollectionStatus"},
        {from:".app.$.globalThreadCollection", to:".globalThreadCollection"}
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
                    components:[
                        {
                            name: "toolbar",
                            kind: "onyx.Toolbar",
                            components: [
                                {
                                    name: "tabs",
                                    kind: "onyx.RadioGroup",
                                    controlClasses: "onyx-tabbutton",
                                    onActivate: "paneChange",
                                    components: [
                                        { name: "conversations", content: $L("Conversations"), index: 0, active: true },
                                        { name: "buddies", content: $L("Buddies"), index: 1 }
                                    ]
                                }
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
            onbackbutton: "goBack"
        },
        {
            name: 'deleteChatthreadService', kind: 'enyo.LunaService',
            service: 'luna://org.webosports.service.messaging', method: 'deleteChatthread',
            mock: ! ('PalmSystem' in window),
            onError: 'deleteChatthreadErr'
        },
    ],
    create: function () {
        this.inherited(arguments);

        this.log("==========> Telling global list to fetch threads...");
    },

    showThread: function (inSender, inEvent) {
        this.log(inSender, inEvent.thread);

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
        var emptyThread = new ThreadModel();
        this.globalThreadCollection.add(emptyThread, 0);
    },

    deleteThread: function(s,e){
        var thread = e.thread|| e.originator.thread;
        this.log("thread to be deleted is", thread && thread.toJSON());
        if (thread) {
            if (thread.get('_id')) {
                this.$.deleteChatthreadService.send({threadId:thread.get('_id')});
            }
            this.globalThreadCollection.remove(thread);
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
    },
});