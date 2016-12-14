enyo.kind({
    name: "MessageItem",
    //kind:"FittableRows",
    bindings: [
        { from: ".model.folder", to: ".classes", transform: function(val, dir, bind){
                return "thread-item folder " + val;
        } },
        { from: ".model.messageText", to: ".$.messageText.content" },
        { from: ".model.localTimestamp", to: ".$.timeStamp.content",
                transform: function(val, dir, bind){
                    console.log("timestampe", val);
                    return val?new moment(val).format("llll"):"";
                }
        },
    ],
    components: [
        { name: "messageText", content: "Message text", classes: "message-text", allowHtml:true, fit:true},
        {
            classes:"message-timestamp-container",
            components:[
                { name: "timeStamp", content: "Timestamp", classes: "message-timestamp" },
            ]
        }
    ]
});
