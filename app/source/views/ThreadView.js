enyo.kind({
    name: "ThreadView",
    kind: "FittableRows",
    published: {
        thread: ""
    },
    bindings:[
        {from:".app.$.globalPersonCollection.status", to:".globalPersonCollectionStatus"}
    ],
    components: [
        {
            kind:"Panels",
            fit:true,
            components:[
                {
                    name:"existingThreadPanel",
                    components:[
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


                    ]
                },
                {
                    name:"newThreadPanel",
                    kind:"FittableRows",
                    classes:"threads-contactslist",
                    components:[
                        {
                            name:"contactsSearchList",
                            kind:"ContactsSearchList",
                            classes:"threads-contactslist",
                            fit:true,
                            onSelected:"newContactSelected"
                        }

                    ]
                },
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
                    style:"padding:0px; margin:1px;",
                    components: [
                        {
                            style:"background-color:rgba(200,200,200,0.5); padding:12px; margin-right:1px; border-radius; 0px 3px 3px 0px",
                            components:[
                                {
                                    name:"attachItemIcon",
                                    kind:"onyx.IconButton",
                                    classes:"attachitem",
                                },
                            ]
                        },
                        {
                            name:"messageTextArea",
                            kind: "onyx.TextArea",
                            fit:true,
                            placeholder: "Type a new message ...",
                            classes:"enyo-selectable",
                            onkeyup:"messageTextAreaChanged",
                            style:"padding:8px;"
                        },
                        {
                            style:"background-color:rgba(200,200,200,0.5); padding:12px; margin-right:1px; border-radius; 0px 3px 3px 0px",
                            components:[
                                {
                                    name:"sendMessageIcon",
                                    kind:"onyx.IconButton",
                                    classes:"sendmessage",
                                    ontap:"sendMessage"
                                },

                            ]
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

        this.$.messageList.set("collection", this.$.messageCollection);
    },

    globalPersonCollectionStatusChanged: function(){
        this.$.contactsSearchList.refilter();
    },
    threadChanged: function() {
        this.log("Thread is ", this.thread, this.$.messageCollection);

        this.$.messageCollection.empty();
        this.$.messageList.refresh();
        this.$.headerText.setContent(this.thread.get("displayName")||"a");

        var threadId = this.thread.get("_id");
        if (threadId){
            this.$.panels.setIndex(0);
            this.$.messageCollection.threadId = threadId;
            this.$.messageCollection.fetch({merge: true, success: enyo.bindSafely(this, "messageListChanged")});

        }else{
            this.$.panels.setIndex(1);
        }
    },
    messageListChanged: function() {
        this.$.messageList.refresh();
    },
    messageTextAreaChanged: function(s,e){
        //console.log("messageTextAreaChanged", s, e);
        if (s.getValue()!=""){
            //this.$.attachItemIcon.hide();
            this.$.sendMessageIcon.show();
        }else{
            //this.$.attachItemIcon.show();
            this.$.sendMessageIcon.show();
        }
    },
    sendMessage:function(s,e){
        enyo.log("do send message", s, e);

        var messageText = this.$.messageTextArea.getValue();
        var localTimestamp = new moment();

        var toArray = [];
        var message = {_kind: "com.palm.smsmessage:1", conversations: ["0"], folder: "outbox",
            localTimestamp: localTimestamp.format("X"), messageText: messageText,
            networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "", timestamp: 0, to: toArray };

        if (this.thread.get("replyAddress")){
            toArray.push({addr: this.thread.get("replyAddress")});
            message.to = toArray;
            var message = new MessageModel(message);
            enyo.log("submitting message", message.raw(), message.dbKind);

            var rec = this.$.messageCollection.add(message)[0];

            if (!this.$.messageCollection.threadId){
                enyo.log("message not sent - no threadId");
            }else{
                this.thread.set("summary", messageText);
                rec.commit({threadId:this.$.messageCollection.threadId, success:enyo.bind(this, this.messageSent)});
            }
        }else{
            //TODO: no reply address, give warning to user.
            enyo.log("message not sent - no reply address found", messageText)
        }
        this.messageListChanged();
    },

    newContactSelected: function(s,e){
        enyo.log("contact selected", s, e, this.thread);
        var personModel = e.person;
        this.thread.set("displayName", personModel.get("displayName"));
        this.thread.set("personId", personModel.get("_id"));
        this.thread.set("replyAddress", personModel.get("primaryPhoneNumber").value);
       // this.threadChanged();
        this.thread.commit({success:enyo.bind(this, this.newThreadCreated)});
    },

    newThreadCreated: function(rec, opts){
        enyo.log("new thread created", rec, opts);
        this.set("thread", rec, true);
    },

    messageSent: function(a,b,c){
        enyo.log("message SENT", a, b, c);
    }
});
