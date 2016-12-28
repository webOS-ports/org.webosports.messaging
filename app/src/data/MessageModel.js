/**  */


var kind = require('enyo/kind'),
    Model = require('enyo/Model');


module.exports = kind({
    name: "MessageModel",
    kind: Model,
    source: "db8",
    dbKind: "com.palm.message:1",
    primaryKey: "_id",
    attributes:{
        conversations: [],
        folder: "",
        localTimestamp: null,
        messageText: "",
        networkMsgId: 0,
        priority: 0,
        serviceName: "",
        smsType: 0,
        status: "",
        timestamp: 0,
        to: [],
        flags: {}
    }
});
