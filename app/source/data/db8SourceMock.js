enyo.kind({
    name: "db8SourceMock",
    kind: "enyo.Source",

    fetch: function(rec, opts) {
        var i;
        console.log("==> Fetch called...");
        console.log(rec);

        if (rec instanceof enyo.Model) {
            /* not sure if this if part even gets called or works properly.... */
            console.log("rec is instanceof enyo.Model");
            for (i = 0; i < this.dataArray.length; i += 1) {
                console.log("Model rec " + this.dataArray[i]);
                if (this.dataArray[i]._id === rec.attributes[rec.primaryKey]) {
                    opts.success([this.dataArray[i]]);
                    return;
                }
            }

            //I think that is what db8 does, isn't it?
            opts.success([]);
        } else if (rec instanceof enyo.Collection) {
            dbkind = rec.get("dbKind");

            if (dbkind === "com.palm.message:1") {
                threadId = rec.get("threadId");
                console.log("Collection threadId: " + threadId);
                opts.success(this.dataArray[dbkind][threadId]);
            }
            else if (dbkind === "com.palm.chatthread:1") {
                opts.success(this.dataArray[dbkind]);
            }
            else {
                opts.success([]);
            }
        } else {
            //return all dataArray here:
            console.log("return " + JSON.stringify(this.dataArray));
            opts.success(this.dataArray);
        }
    },

    commit: function(rec, opts) {
        var i;
        console.log("Storing ", rec, (rec instanceof enyo.Model), rec.get("dbKind") );

        if (rec instanceof enyo.Model) {
            dbkind = rec.get("dbKind")||rec.dbKind;

            if (dbkind === "com.palm.message:1") {
                threadId = rec.get("threadId")||opts.threadId;
                console.log("threadId: ", threadId);
                //opts.success(this.dataArray[dbkind][threadId]);
                var dataArray = this.dataArray["com.palm.message:1"][threadId];
                console.log("dataArray says", dataArray);
                for (i = 0; i < dataArray.length; i += 1) {
                    if (dataArray[i]._id === rec.attributes[rec.primaryKey]) {
                        dataArray[i] = rec.attributes;
                        opts.success({returnValue: true});
                        return;
                    }
                }
                dataArray.push(rec.attributes);
                console.log("SUCCESSWITHCOMMITT", this.dataArray);
                opts.success({returnValue: true});

            }
            else {
                opts.success([]);
            }

        } else {
            console.log("Can't store collection... still makes me headaches.");
            opts.fail();
        }
    },
    destroy: function(rec, opts) {
        var ids;

        if (rec instanceof enyo.Collection) {
            ids = [];
            rec.records.forEach(function (m) {
                var i;
                for (i = this.dataArray.length - 1; i >= 0; i -= 1) {
                    if (this.dataArray[i]._id === m.attributes[m.primaryKey]) {
                        this.dataArray.splice(i, 1);
                    }
                }
            });
        } else {
            ids = [rec.attributes[rec.primaryKey]];
        }
    },
    find: function(rec, opts) {
        console.log("No find..");
        opts.fail();
    },
    getIds: function (n, opts) {
        var ids = [], i;
        for (i = 0; i < n; i += 1) {
            ids.push(Date.now() + i);
        }
        opts.success({returnValue: true, ids: [ids]});
    },



    dataArray: {
        "com.palm.chatthread:1": [
            { _id: "0", displayName: "Person1 WithReallySuperLongName", summary: "Summary of message from Person 1",
                timestamp: 1408101740, replyAddress: "0144334456", replyService: "sms", personId: "", unreadCount: 2},
            { _id: "1", displayName: "Person 2", summary: "Summary of message from Person 2",
                timestamp: 1409610140, replyAddress: "0144334456", replyService: "sms", personId: "", unreadCount: 0},
            { _id: "2", displayName: "Person 3", summary: "Summary of messages from Person 3, for whom there are no messages " +
                "in thread. But we have a really long summary in any case to see if ellipsis works",
                timestamp: 1409610140, replyAddress: "1234334456", replyService: "sms", personId: "", unreadCount: 0}
        ],
        "com.palm.message:1": {
            "0": [
                { _id: "0", _kind: "com.palm.smsmessage:1", conversations: ["0"], folder: "inbox", 
                  from: { addr: "+491234567890" }, localTimestamp: 1408101740, messageText: "This is a small SMS test message 1 from Someone",
                  networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "successful", timestamp: 0 },
                { _id: "1", _kind: "com.palm.smsmessage:1", conversations: ["1"], folder: "sent",
                  from: { addr: "+491234567890" }, localTimestamp: 1408601740, messageText: "This is a extremely large " +
                    "SMS test message 2 TO Someone. Like I said, this is a <i>extremely</i> large message " +
                    "that also has some HTML formatting in it. <b><u>Just because we can!</u></b> Plus, we " +
                    "need to <span style='color:maroon;'>check support for auto-expansion</span> of message.",
                  networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "successful", timestamp: 0 },
                { _id: "4", _kind: "com.palm.smsmessage:1", conversations: ["1"], folder: "inbox",
                    from: { addr: "+491234567890" }, localTimestamp: 1408601740, messageText: "This is a small SMS test message 5, also from Someone",
                    networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "successful", timestamp: 0 }
            ],
            "1": [
                { _id: "2", _kind: "com.palm.smsmessage:1", conversations: ["0"], folder: "inbox",
                  from: { addr: "+491234567890" }, localTimestamp: 0, messageText: "This is a small SMS test message 3 from test2",
                  networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "successful", timestamp: 0 },
                { _id: "3", _kind: "com.palm.smsmessage:1", conversations: ["1"], folder: "inbox",
                  from: { addr: "+491234567890" }, localTimestamp: 0, messageText: "This is a small SMS test message 4, also from test2",
                  networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "successful", timestamp: 0 }
            ]
        }
    }
});
