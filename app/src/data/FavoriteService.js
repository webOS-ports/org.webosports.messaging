/**
 * Favorite contacts joined with their chat-thread and buddy-status records.
 * Ported from com.palm.app.messaging/app/favorites/FavoriteService.js.
 *
 * A person record stores only username + serviceName for each IM address, so buddy presence is
 * merged back onto the matching entry of person.ims rather than onto the person itself.
 * Off-device the queries are answered from mockDb.
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
    name: "FavoriteService",
    kind: Component,

    events: {
        onResults: "",
        onWatch: ""
    },

    components: [
        {
            name: 'people', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotPeople', onError: 'fail'
        },
        {
            name: 'peopleSearch', kind: LunaService, service: DB_SERVICE, method: 'search',
            subscribe: true, resubscribe: true, onResponse: 'gotPeople', onError: 'fail'
        },
        {
            name: 'threads', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotThreads', onError: 'gotThreads'
        },
        {
            name: 'buddy', kind: LunaService, service: TEMP_DB_SERVICE, method: 'find',
            onResponse: 'gotBuddies', onError: 'gotBuddies'
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
        query.from = "com.palm.person:1";

        if (query.search) {
            query.search = undefined;
            this._query('peopleSearch', { query: query, watch: true }, 'gotPeople');
        } else {
            this._query('people', { query: query, watch: true }, 'gotPeople');
        }
    },

    cancel: function () {
        cancelRequests(this.$.people);
        cancelRequests(this.$.peopleSearch);
        cancelRequests(this.$.threads);
        cancelRequests(this.$.buddy);
    },

    fail: function (inSender, inResponse) {
        this.warn("favorite query failed:", inResponse && (inResponse.errorText || inResponse));
        this.reply();
    },

    reply: function () {
        this.doResults({ results: (this.data && this.data.results) || [] });
    },

    gotPeople: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this.doWatch();
            return;
        }
        if (!inResponse || !inResponse.results) {
            return;
        }
        this.data = inResponse;
        this.assembleIds();
        this.queryThreads();
    },

    assembleIds: function () {
        this.pids = [];
        for (var i = 0; i < this.data.results.length; i++) {
            this.pids.push(this.data.results[i]._id);
        }
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
            messagingUtils.utils.joinData(this.data, inResponse.results, "personId", "_id", "thread");
        }
        this.queryBuddies();
    },

    queryBuddies: function () {
        this._query('buddy', {
            query: {
                from: "com.palm.imbuddystatus:1",
                where: [{ prop: "personId", op: "=", val: this.pids }],
                select: ["_id", "_kind", "personId", "username", "serviceName", "availability", "status"]
            }
        }, 'gotBuddies');
    },

    gotBuddies: function (inSender, inResponse) {
        var favorites = (this.data && this.data.results) || [];
        var buddies = (inResponse && inResponse.results) || [];
        var lookup = {};
        var i, j;

        for (i = 0; i < favorites.length; i++) {
            lookup[favorites[i]._id] = favorites[i].ims;
        }

        // Reverse-look-up: match each buddy's username/serviceName against the person's ims entries
        // and copy the presence onto that entry.
        for (i = 0; i < buddies.length; i++) {
            var ims = lookup[buddies[i].personId];
            if (!ims) { continue; }
            for (j = 0; j < ims.length; j++) {
                if (buddies[i].serviceName === ims[j].type && buddies[i].username === ims[j].value) {
                    ims[j].availability = buddies[i].availability;
                    ims[j].status = buddies[i].status;
                    ims[j]._kind = buddies[i]._kind;
                }
            }
        }

        this.reply();
    }
});
