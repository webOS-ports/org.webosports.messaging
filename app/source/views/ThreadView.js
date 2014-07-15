enyo.kind({
    name: "ThreadView",
    kind: "FittableRows",
    published: {
        thread: ""
    },
    components: [
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
            kind: "onyx.Toolbar",
            components: [
                {
                    kind: "onyx.InputDecorator",
                    style: "width: 100%;",
                    flex: true,
                    alwaysLooksFocused: true,
                    components: [
                        {
                            kind: "onyx.TextArea",
                            style: "width: 100%;",
                            placeholder: "Type a new message ..."
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
        console.log("Thread is " + this.thread);

        this.$.messageCollection.destroyAllLocal();
        this.$.messageCollection.removeAll();

        this.$.messageList.refresh();

        this.$.messageCollection.threadId = this.thread.attributes._id;
        this.$.messageCollection.fetch({strategy: "merge", success: enyo.bind(this, "messageListChanged")});
    },
    messageListChanged: function() {
        this.$.messageList.refresh();
    }
});
