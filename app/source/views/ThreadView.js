enyo.kind({
    name: "ThreadView",
    kind: "FittableRows",
    published: {
        thread: ""
    },
    components: [
        {
            name: "topToolbar",
            kind:"onyx.Toolbar",
            layoutKind:"FittableColumnsLayout",
            components:[
                {name:"headerText", content:"Name name"}
            ]
        },
        {
            name: "messageList",
            classes: "threads-list",
            kind: "enyo.DataList",
            fit: true,
            collection: null,
            scrollerOptions: {
                horizontal: "hidden",
                touch: true
            },
            components: [
                { kind: "MessageItem", classes: "thread-item" }
            ]
        },
        {
            name: "bottomToolbar",
            kind:"FittableColumns",
            components: [
                {
                    kind: "onyx.InputDecorator",
                    fit:true,
                    //style: "width: 100%;",
                    //flex: true,
                    alwaysLooksFocused: true,
                    layoutKind:"FittableColumnsLayout",
                    components: [
                        {
                            kind: "onyx.TextArea",
                            fit:true,
                            placeholder: "Type a new message ...",
                            classes:"enyo-selectable"
                        },
                        {
                            kind:"onyx.Icon",
                            style:"width:25px; height:25px; border:1px solid red;",
                        }
                    ]
                }
            ]
        },
        {
            name: "messageCollection",
            kind: "MessageCollection",
            threadId: "",
        }
    ],
    create: function () {
        this.inherited(arguments);
        this.log("==========> Created thread view");

        this.$.messageList.collection = this.$.messageCollection;
    },
    threadChanged: function() {
        this.log("Thread is ", this.thread);

        this.$.messageCollection.destroyAllLocal();
        this.$.messageCollection.removeAll();

        this.$.messageList.refresh();

        this.$.messageCollection.threadId = this.thread.attributes._id;
        this.$.messageCollection.fetch({strategy: "merge", success: enyo.bind(this, "messageListChanged")});

        this.$.headerText.setContent(this.thread.get("displayName")||"");
    },
    messageListChanged: function() {
        this.$.messageList.refresh();
    }
});
