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
                {name:"imStatus", style:"width:14px;", components:[{classes:"im-status unknown", kind:"onyx.Icon"}]},
                {name:"headerText", content:"Name name", fit:true}
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
                    alwaysLooksFocused: true,
                    layoutKind:"FittableColumnsLayout",
                    components: [
                        {
                            name:"messageTextArea",
                            kind: "onyx.TextArea",
                            fit:true,
                            placeholder: "Type a new message ...",
                            classes:"enyo-selectable",
                            onkeyup:"messageTextAreaChanged"
                        },
                        {
                            name:"sendMessageIcon",
                            kind:"onyx.IconButton",
                            classes:"sendmessage",
                            showing:false,
                            ontap:"sendMessage"
                        },
                        {
                            name:"attachItemIcon",
                            kind:"onyx.IconButton",
                            classes:"attachitem",
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
    },
    messageTextAreaChanged: function(s,e){
        //console.log("messageTextAreaChanged", s, e);
        if (s.getValue()!=""){
            this.$.attachItemIcon.hide();
            this.$.sendMessageIcon.show();
        }else{
            this.$.attachItemIcon.show();
            this.$.sendMessageIcon.hide();
        }
    },
    sendMessage:function(s,e){
        console.log("do send message", s, e);

        var messageText = this.$.messageTextArea.getValue();
        var localTimestamp = new moment();

        var message = {_kind: "com.palm.smsmessage:1", conversations: ["0"], folder: "inbox",
            from: { addr: "+491234567890" }, localTimestamp: localTimestamp.format("X"), messageText: messageText,
            networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "", timestamp: 0 };
        var message = new MessageModel(message);
        console.log("submitting", message, message.dbKind, message.get("dbKind"));
        var rec = this.$.messageCollection.at(this.$.messageCollection.add(message));
        console.log(rec, rec.store);
        rec.commit({threadId:this.$.messageCollection.threadId});
        this.messageListChanged();
    }
});
