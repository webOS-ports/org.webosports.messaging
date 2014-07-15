enyo.kind({
    name: "MessageItem",
    bindings: [
        { from: ".model.messageText", to: ".$.messageText.content" },
    ],
    components: [
        { name: "messageText", content: "Message text", classes: "message-text" },
    ]
});
