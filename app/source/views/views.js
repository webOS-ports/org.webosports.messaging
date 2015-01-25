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

        this.$.threadView.setThread(inEvent.thread);

        if (inEvent.thread) {
            this.$.threadPanel.setIndex(1);
        } else {
            this.$.threadPanel.setIndex(0);
        }

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




enyo.kind({
    name:"SelectContact",
    kind:"onyx.Popup",
    scrim:true,
    modal:true,
    //centered:true,
    autoDismiss:false,
    //floating:true,
    style:"padding:0px; border-radius:0px; background-color:lightyellow;",
    layoutKind:"FittableRowsLayout",
    components:[
        {
            kind:"onyx.Toolbar",
            components:[
                {content:"New Message"}
            ]
        },
        {
            fit:true,
            kind:"FittableRows",
            components:[
                {
                    kind:"onyx.InputDecorator",
                    classes:"enyo-children-inline",
                    style:"width:100%;",
                    components:[
                        {content:"To: ", style:"color:black;"},
                        {kind:"onyx.Input", fit:true}
                    ]
                },
                {
                    kind:"List",
                    fit:true
                },
                {
                    kind:"onyx.InputDecorator",
                    style:"width:100%;",
                    components:[
                        {
                            kind:"onyx.Input",
                            placeholder:"send a message",

                        }
                    ]
                }
            ]
        }
    ]
});
