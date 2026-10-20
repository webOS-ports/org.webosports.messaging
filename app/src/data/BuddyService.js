/**
 * IM buddies joined with their person and chat-thread records.
 * Ported from com.palm.app.messaging/app/buddies/BuddyService.js.
 *
 * Buddy status lives in tempdb (com.palm.imbuddystatus:1) because it is transient presence data.
 * The buddy query is watched; a watch fire re-runs the join. Off-device the queries are answered
 * from mockDb.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    cancelRequests = require('../util/cancelRequests'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('./mockDb');

var DB_SERVICE = 'luna://com.webos.service.db',
    TEMP_DB_SERVICE = 'luna://com.webos.service.tempdb';

module.exports = kind({
    name: "BuddyService",
    kind: Component,

    events: {
        onResults: "",
        onWatch: ""
    },

    components: [
        {
            name: 'buddies', kind: LunaService, service: TEMP_DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotBuddies', onError: 'fail'
        },
        {
            name: 'buddiesSearch', kind: LunaService, service: TEMP_DB_SERVICE, method: 'search',
            subscribe: true, resubscribe: true, onResponse: 'gotBuddies', onError: 'fail'
        },
        {
            name: 'people', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotPeople', onError: 'gotPeople'
        },
        {
            name: 'threads', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotThreads', onError: 'gotThreads'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.data = { results: [] };
        this.pids = [];
    },

    _query: function (lunaName, params, responseMethod) {
        if (mockDb.enabled) {
            var self = this;
            setTimeout(function () {
                self[responseMethod](null, mockDb.find(params.query));
            }, 0);
            return;
        }
        cancelRequests(this.$[lunaName]);
        this.$[lunaName].send(params);
    },

    call: function (params) {
        var query = (params && params.query) || {};
        query.from = "com.palm.imbuddystatus:1";

        if (query.search) {
            query.search = undefined;
            this._query('buddiesSearch', { query: query, watch: true }, 'gotBuddies');
        } else {
            this._query('buddies', { query: query, watch: true }, 'gotBuddies');
        }
    },

    cancel: function () {
        cancelRequests(this.$.buddies);
        cancelRequests(this.$.buddiesSearch);
        cancelRequests(this.$.people);
        cancelRequests(this.$.threads);
    },

    fail: function (inSender, inResponse) {
        this.warn("buddy query failed:", inResponse && (inResponse.errorText || inResponse));
        this.reply();
    },

    reply: function () {
        this.doResults({ results: (this.data && this.data.results) || [] });
    },

    gotBuddies: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this.doWatch();
            return;
        }
        if (!inResponse || !inResponse.results) {
            return;
        }
        this.data = inResponse;
        this.assembleIds();
        this.queryPeople();
    },

    assembleIds: function () {
        this.pids = [];
        for (var i = 0; i < this.data.results.length; i++) {
            this.pids.push(this.data.results[i].personId);
        }
    },

    queryPeople: function () {
        this._query('people', {
            query: {
                from: "com.palm.person:1",
                where: [{ prop: "_id", op: "=", val: this.pids }],
                select: messagingUtils.person.selectAttributes
            }
        }, 'gotPeople');
    },

    gotPeople: function (inSender, inResponse) {
        if (inResponse && inResponse.results) {
            messagingUtils.utils.joinData(this.data, inResponse.results, "_id", "personId", "person");
        }
        this.queryThreads();
    },

    queryThreads: function () {
        this._query('threads', {
            query: {
                from: messagingUtils.thread.dbKind,
                where: [{ prop: "personId", op: "=", val: this.pids }],
                select: ["_id", "_kind", "personId", "normalizedAddress", "displayName", "unreadCount"]
            }
        }, 'gotThreads');
    },

    gotThreads: function (inSender, inResponse) {
        if (inResponse && inResponse.results) {
            messagingUtils.utils.joinData(this.data, inResponse.results, "personId", "personId", "thread");
        }
        this.reply();
    }
});
