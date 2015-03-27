enyo.kind({
    name: "ThreadView",
    kind: "FittableRows",
    fit:true,
    published: {
        thread: ""
    },
    bindings:[
        {from:".app.$.globalPersonCollection.status", to:".globalPersonCollectionStatus"}
    ],
    events: {
        onDeleteThread:""
    },
    components: [
        {
            kind:"Panels",
            fit:true,
            components:[
                {
                    name:"existingThreadPanel",
                    kind:"FittableRows",
                    components:[
                        {
                            name: "topToolbar",
                            kind:"onyx.Toolbar",
                            layoutKind:"FittableColumnsLayout",
                            components:[
                                {name:"imStatus", style:"width:14px;", components:[{classes:"im-status unknown", kind:"onyx.Icon"}]},
                                {name:"headerText", content:"Name name", fit:true},
                                {kind: 'onyx.PickerDecorator', components: [
                                    {}, //this uses the defaultKind property of PickerDecorator to inherit from PickerButton
                                    {name:"addrSelect", kind: 'onyx.Picker', components: [   // TODO: dynamically populate
                                        {content: "206-555-1212", active: true},
                                        {content: "jdoe@gmail.com"}
                                    ]}
                                ]}
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
                            kind:"onyx.Toolbar",
                            components:[{kind:"onyx.Button", content:"Cancel", ontap:"deleteThread"}, {content:$L("New Conversation")}]
                        },
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
            classes: "onyx-toolbar-inline",
            components: [
                {
                    kind: "onyx.InputDecorator",
                    fit:true,
                    alwaysLooksFocused: true,
                    layoutKind:"FittableColumnsLayout",
                    style:"padding:0px; margin:1px;",
                    components: [
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
                            name:"attachItemIcon",
                            kind:"onyx.IconButton",
                            classes:"attachitem",
                        },
                        {
                            name:"sendMessageIcon",
                            kind:"onyx.IconButton",
                            classes:"sendmessage",
                            ontap:"sendMessage"
                        },
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
        this.log("Thread is ", this.thread.get("_id"),this.thread, this.$.messageCollection);

        this.$.messageCollection.empty();
        this.$.messageList.refresh();
        this.$.headerText.setContent(this.thread.get("displayName")||"a");

        var threadId = this.thread.get("_id");
        if (threadId){
            this.$.panels.setIndex(0);
            this.$.messageCollection.threadId = threadId;
            this.$.messageCollection.fetch({where: [{prop:"conversations",op:"=",val:threadId}],
                merge: true,
                success: enyo.bindSafely(this, "messageListChanged")});

        }else{
            this.$.panels.setIndex(1);
        }
    },
    messageListChanged: function() {
        console.log("messageListChanged", this.messageCollection);
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
        var threadId = this.thread.get("_id");

        var toArray = [];
        var message = {_kind: "com.palm.smsmessage:1", conversations: [threadId], folder: "outbox",
            localTimestamp: localTimestamp.format("X"), messageText: messageText, flags:{visible:true},
            networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "pending", timestamp: 0, to: toArray };

        var toAddress = this.thread.get("replyAddress") || this.$.contactsSearchList.get("searchText").trim();
        if (toAddress){
            toArray.push({addr: toAddress});
            message.to = toArray;
            message = new MessageModel(message);
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
            var msg = $L("Pick a recipient");
            this.log(msg, messageText);
            if (window.PalmSystem) { PalmSystem.addBannerMessage(msg, '{ }', "icon.png", "alerts"); }
        }
        this.messageListChanged();
    },

    // TODO: rework the contactspicker to select an IM address or phone number.  We shouldn't just blindly use the "primaryPhoneNumber".
    newContactSelected: function(sender,evt){
        enyo.log("contact selected", evt, this.thread);
        var personModel = evt.person;
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

    deleteThread: function(s,e){
        console.log("delete button");
        this.doDeleteThread({thread:this.get("thread")});
    },
    messageSent: function(a,b,c){
        enyo.log("message SENT", a, b, c);
        this.$.messageTextArea.setValue("");
        //this.messageListChanged();
    }
});
