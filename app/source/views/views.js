/*global GlobalThreadCollection */


enyo.kind({
    name: "messaging.MainView",
    kind: "FittableRows",
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
                    style:"width:100%; max-width:320px;",
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
                                        { name: "conversations", content: "Conversations", index: 0, active: true },
                                        { name: "buddies", content: "Buddies", index: 1 }
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
                                { name: "threadList", kind: "ThreadList", onSelected: "showThread", style:"width:100%; width:100%;"},
                                { name: "buddyList", kind:"BuddyList", onSelected: "showThread"}
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
                        { name: "threadView", kind: "ThreadView"}
                    ]
                }
            ]
        },
        {
            kind: "enyo.Signals",
            onbackbutton: "goBack"
        }
    ],
    create: function () {
        this.inherited(arguments);

        this.log("==========> Telling global list to fetch threads...");
    },
    showThread: function (inSender, inEvent) {
        console.log("showThread ", inEvent.thread);

        if (inEvent.thread) {
            this.$.threadPanel.setIndex(1);
        } else {
            this.$.threadPanel.setIndex(0);
            this.$.main.setIndex(0);
            return true;
        }

        this.$.threadView.setThread(inEvent.thread);
        if (enyo.Panels.isScreenNarrow()) {
            this.$.main.setIndex(1);
        }
    },
    paneChange: function(inSender, inEvent){
        //console.log("paneChange", inSender, inEvent);
        inEvent&&inEvent.originator&&inEvent.originator.active?this.$.viewPanel.setIndex(inEvent.originator.index||0):null;
    },
    goBack: function () {
        if (enyo.Panels.isScreenNarrow()) {
            this.$.main.setIndex(0);
        }
    },
});