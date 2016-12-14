enyo.kind({
    name: "ThreadModel",
    kind: "enyo.Model",
    source: "db8",
    dbKind: "com.palm.chatthread:1",
    primaryKey: "_id",
    attributes:{
        _id: null,
        displayName: "",
        summary: "",
        timestamp: Date.now(),
        replyAddress: "",
        replyService: "sms",
        personId: "",
        unreadCount: 0
    }
});
