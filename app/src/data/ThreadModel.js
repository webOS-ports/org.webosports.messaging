/**  */


var kind = require('enyo/kind'),
    Model = require('enyo/Model');


module.exports = kind({
    name: "ThreadModel",
    kind: Model,
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
    },
    updateReplyInfo: function (replyAddress, isPhone, type) {
        console.log("ThreadModel.updateReplyInfo:", replyAddress, isPhone, type);
        this.set('replyAddress', replyAddress);
        if (isPhone) {
            this.set('replyService', 'sms');
        } else {
            this.set('replyService', '???');   // TODO: set to proper value, using type
        }
    }
});
