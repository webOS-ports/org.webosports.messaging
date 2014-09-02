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
                    kind:"FittableColumns",
                    style:"width:100%; max-width:320px;",
                    components:[
                        { name: "threadList", kind: "ThreadList", onSelected: "showThread", style:"width:100%; width:100%;"},
                    ]
                },
                {
                    kind: "enyo.Panels",
                    arrangerKind:"CardArranger",
                    fit: true,
                    name: "threadPanel",
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
        GlobalThreadCollection.fetch({strategy: "merge"});
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
    goBack: function () {
        if (enyo.Panels.isScreenNarrow()) {
            this.$.main.setIndex(0);
        }
    }
});
