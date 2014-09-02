enyo.kind({
    name: "MessageItem",
    bindings: [
        { from: ".model.folder", to: ".classes", transform: function(val, dir, bind){
                return "thread-item folder " + val;
        } },
        { from: ".model.messageText", to: ".$.messageText.content" },
    ],
    components: [
        { name: "messageText", content: "Message text", classes: "message-text" },
    ]
});
