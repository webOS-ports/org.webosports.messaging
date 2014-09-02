enyo.kind({
    name: "db8SourceMock",
    kind: "enyo.Source",

    fetch: function(rec, opts) {
        var i;
        console.log("==> Fetch called...");
        console.log(rec);

        if (rec instanceof enyo.Model) {
            console.log("rec is instanceof enyo.Model");
            for (i = 0; i < this.dataArray.length(); i += 1) {
                console.log("rec " + this.dataArray[i]);
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
                console.log("threadId: " + threadId);
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
        console.log("Storing ", rec);

        if (rec instanceof enyo.Model) {
            for (i = 0; i < this.dataArray.length(); i += 1) {
                if (this.dataArray[i]._id === rec.attributes[rec.primaryKey]) {
                    this.dataArray[i] = rec.attributes;
                    opts.success({returnValue: true});
                    return;
                }
            }

            this.dataArray.push(rec.attributes);
            opts.success({returnValue: true});
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
            { _id: "0", displayName: "Test", summary: "Test has called you ...",
                timestamp: 1408101740, replyAddress: "0144334456", replyService: "sms", personId: "", unreadCount: 0},
            { _id: "1", displayName: "Test2", summary: "Test2 has called you ...",
                timestamp: 1409610140, replyAddress: "0144334456", replyService: "sms", personId: "", unreadCount: 0},
            { _id: "2", displayName: "Test3", summary: "Test3 has called you ...",
                timestamp: 1409610140, replyAddress: "1234334456", replyService: "sms", personId: "", unreadCount: 0}
        ],
        "com.palm.message:1": {
            "0": [
                { _id: "0", _kind: "com.palm.smsmessage:1", conversations: ["0"], folder: "inbox", 
                  from: { addr: "+491234567890" }, localTimestamp: 0, messageText: "This is a small SMS test message 1 from test",
                  networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "successful", timestamp: 0 },
                { _id: "1", _kind: "com.palm.smsmessage:1", conversations: ["1"], folder: "sent",
                  from: { addr: "+491234567890" }, localTimestamp: 0, messageText: "This is a small SMS test message 2 TO test",
                  networkMsgId: 0, priority: 0, serviceName: "sms", smsType: 0, status: "successful", timestamp: 0 },
                { _id: "4", _kind: "com.palm.smsmessage:1", conversations: ["1"], folder: "inbox",
                    from: { addr: "+491234567890" }, localTimestamp: 0, messageText: "This is a small SMS test message 5, also from test",
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
