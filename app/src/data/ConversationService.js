/**
 * The messages of one conversation, as a watched db8 find.
 * Ported from com.palm.app.messaging/app/conversations/ConversationService.js.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('./mockDb');

var DB_SERVICE = 'luna://com.webos.service.db';

module.exports = kind({
    name: "ConversationService",
    kind: Component,

    events: {
        onResults: "",
        onWatch: ""
    },

    components: [
        {
            name: 'messages', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotMessages', onError: 'fail'
        }
    ],

    call: function (params) {
        var query = (params && params.query) || {};
        query.from = messagingUtils.message.dbKind;

        if (mockDb.enabled) {
            var self = this;
            setTimeout(function () {
                self.gotMessages(null, mockDb.find(query));
            }, 0);
            return;
        }
        this.$.messages.cancel();
        this.$.messages.send({ query: query, watch: true });
    },

    cancel: function () {
        this.$.messages.cancel();
    },

    gotMessages: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this.doWatch();
            return;
        }
        this.doResults({ results: (inResponse && inResponse.results) || [] });
    },

    fail: function (inSender, inResponse) {
        this.warn("message query failed:", inResponse && (inResponse.errorText || inResponse));
        this.doResults({ results: [] });
    }
});
