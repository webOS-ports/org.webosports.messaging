enyo.kind({
    name: "ThreadView",
    kind: "FittableRows",
    published: {
        thread: ""
    },
    bindings:[
        //{from:".app.$.globalPersonCollection", to:".$.contactsSearchList.collection"}
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
                    components:[
                        {
                            kind:"onyx.Toolbar",
                            layoutKind:"FittableColumnsLayout",
                            components:[
                                {
                                    kind: "onyx.InputDecorator",
                                    classes: "contacts-search enyo-fill",
                                    components: [
                                        // When our version of webkit supports type "search", we can get a "recent searches" dropdown for free
                                        { name: "searchInput", kind: "onyx.Input", placeholder: "Search", classes:"enyo-no-stretch", onfocus:"showContactsList" /*, type: "search", attributes: {results:6, autosave:"contactsSearch"}, style: "font-size: 16px;"*/ },
                                        { kind: "Image", src: "assets/search-input.png", style:"float:right;" }
                                    ]
                                },

                            ]
                        },
                        {
                            name:"contactsSearchList",
                            kind:"ContactsSearchList",
                            style:"border:2px solid red;"
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
                    style:"padding:0px",
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
                            style:"background-color:rgba(200,200,200,0.5); padding:12px; margin-right:1px; border-radius; 0px 3px 3px 0px",
                            components:[
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
        // this.$.contactsSearchList.set("collection", this.$.)
    },
    threadChanged: function() {
        this.log("Thread is ", this.thread, this.$.messageCollection);

        this.$.messageCollection.empty();

        this.$.messageList.refresh();

        this.$.messageCollection.threadId = this.thread.attributes._id;
        this.$.messageCollection.fetch({merge: true, success: enyo.bindSafely(this, "messageListChanged")});

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

        var message = {_kind: "com.palm.smsmessage:1", conversations: ["0"], folder: "outbox",
            from: { addr: "+491234567890" }, localTimestamp: localTimestamp.format("X"), messageText: messageText,
            networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "", timestamp: 0 };
        var message = new MessageModel(message);
        console.log("submitting", message, message.dbKind, message.get("dbKind"));
        var rec = this.$.messageCollection.at(this.$.messageCollection.add(message));
        rec.commit({threadId:this.$.messageCollection.threadId});
        this.messageListChanged();
    },

    showContactsList: function(s,e){

    }
});
