/**
 * Live feeds for the Servers/Rooms tab, ported from
 * com.palm.app.messaging/app/servers/ServerService.js.
 *
 * Three services, all the same shape: subscribe to a db8 find and re-emit on watch. The records are
 * self-contained, so unlike ThreadService there is no join to do.
 *
 *   ServerService  — the imserver (guild/network) records
 *   ChannelService — the imchannel (room) records for one server
 *   UnreadService  — visible chatthreads, which carry the per-channel unread counts
 *
 * Channel/server chatthreads denormalize channelId + serverId, so a single subscribe over the same
 * flags.visible index ThreadList already uses lets the tab tally unread per channel and per server
 * without needing a new db index.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    cancelRequests = require('../util/cancelRequests'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('./mockDb');

var DB_SERVICE = 'luna://com.webos.service.db';

/** Shared plumbing: one watched find, re-emitted on change. */
var SubscribedFind = kind({
    name: "SubscribedFind",
    kind: Component,

    events: {
        onResults: "",
        onWatch: ""
    },

    /** Subkinds set the db kind they query. */
    dbKind: "",

    components: [
        {
            name: 'find', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotResults', onError: 'fail'
        }
    ],

    call: function (params) {
        var query = (params && params.query) || {};
        query.from = this.dbKind;

        if (mockDb.enabled) {
            var self = this;
            setTimeout(function () {
                self.gotResults(null, mockDb.find(query));
            }, 0);
            return;
        }
        cancelRequests(this.$.find);
        this.$.find.send({ query: query, watch: true });
    },

    cancel: function () {
        cancelRequests(this.$.find);
    },

    gotResults: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this.doWatch();
            return;
        }
        this.doResults({ results: (inResponse && inResponse.results) || [] });
    },

    fail: function (inSender, inResponse) {
        this.warn("query failed:", inResponse && (inResponse.errorText || inResponse));
        this.doResults({ results: [] });
    }
});

module.exports = {
    ServerService: kind({
        name: "ServerService",
        kind: SubscribedFind,
        dbKind: "com.palm.imserver:1"
    }),

    ChannelService: kind({
        name: "ChannelService",
        kind: SubscribedFind,
        dbKind: "com.palm.imchannel:1"
    }),

    UnreadService: kind({
        name: "UnreadService",
        kind: SubscribedFind,
        dbKind: messagingUtils.thread.dbKind
    })
};
