/*global GlobalThreadCollection */

enyo.kind({
    name: "ThreadList",
    kind: "FittableRows",
    style: "text-align:center;",
    fit: true,
    events: {
        onSelected: ""
    },
    components: [
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
                        { name: "buddys", content: "Buddys", index: 1 }
                    ]
                }
            ]
        },
        {
            name: "main",
            description: "All",
            kind: "FittableRows",
            classes: "threads-list",
            fit: true,
            components: [
                {
                    name: "realThreadList",
                    classes: "contacts-list",
                    kind: "enyo.DataList",
                    ontap: "selectThread",
                    fit: true,
                    collection: GlobalThreadCollection,
                    scrollerOptions: {
                        horizontal: "hidden",
                        touch: true
                    },
                    components: [
                        { kind: "ThreadItem", classes: "thread-item" }
                    ]
                }
            ]
        },
        {
            name: "BottomToolbar",
            kind: "onyx.Toolbar",
            components: [
                { kind: "onyx.Button", content: "New"}
            ]
        },
    ],

   create: function () {
        this.inherited(arguments);
        this.log("==========> Created thread list");
    },

    selectThread: function (inSender, inEvent) {
        if (!inSender.selected()) {
            inSender.select(inEvent.index);
        }

        this.doSelected({thread: inSender.selected()});
    }
});
