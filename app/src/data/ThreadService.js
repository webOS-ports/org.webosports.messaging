/**
 * Chat threads joined with their person and buddy-status records.
 * Ported from com.palm.app.messaging/app/threads/ThreadService.js.
 *
 * Mojo used enyo.Service/enyo.Request with a DbService per query; under Enyo 2 the same three
 * queries are issued through enyo-webos LunaService and joined here. The thread query is watched,
 * and a watch fire re-runs the whole join. Off-device the queries are answered from mockDb.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('./mockDb');

var DB_SERVICE = 'luna://com.webos.service.db',
    TEMP_DB_SERVICE = 'luna://com.webos.service.tempdb';

module.exports = kind({
    name: "ThreadService",
    kind: Component,

    events: {
        onResults: "",
        onWatch: ""
    },

    components: [
        {
            name: 'threads', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotThreads', onError: 'fail'
        },
        {
            name: 'threadsSearch', kind: LunaService, service: DB_SERVICE, method: 'search',
            subscribe: true, resubscribe: true, onResponse: 'gotThreads', onError: 'fail'
        },
        {
            name: 'people', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotPeople', onError: 'gotPeople'
        },
        {
            name: 'status', kind: LunaService, service: TEMP_DB_SERVICE, method: 'find',
            onResponse: 'gotStatus', onError: 'gotStatus'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.data = { results: [] };
        this.pids = [];
    },

    /**
     * Issue a query, or answer it from the fixtures when running in a browser. The mock reply is
     * deferred so callers always see the same asynchronous behaviour as on device.
     */
    _query: function (lunaName, params, responseMethod) {
        if (mockDb.enabled) {
            var self = this;
            setTimeout(function () {
                self[responseMethod](null, mockDb.find(params.query));
            }, 0);
            return;
        }
        this.$[lunaName].cancel();
        this.$[lunaName].send(params);
    },

    /**
     * @param params {query: {...}} — a `search: true` query is routed to db8's search method, as
     *                               Mojo did, since `find` cannot do tokenized matching.
     */
    call: function (params) {
        var query = (params && params.query) || {};
        query.from = messagingUtils.thread.dbKind;

        if (query.search) {
            query.search = undefined;
            this._query('threadsSearch', { query: query, watch: true }, 'gotThreads');
        } else {
            this._query('threads', { query: query, watch: true }, 'gotThreads');
        }
    },

    cancel: function () {
        this.$.threads.cancel();
        this.$.threadsSearch.cancel();
        this.$.people.cancel();
        this.$.status.cancel();
    },

    fail: function (inSender, inResponse) {
        this.warn("thread query failed:", inResponse && (inResponse.errorText || inResponse));
        this.reply();
    },

    reply: function () {
        this.doResults({ results: (this.data && this.data.results) || [] });
    },

    gotThreads: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            // The db8 watch fired: the result set is stale, so re-run the whole join.
            this.doWatch();
            return;
        }
        if (!inResponse || !inResponse.results) {
            return;
        }
        this.data = inResponse;
        this.assembleIds();
        // Query people and status concurrently so the list updates as soon as either returns. This
        // can refresh the list twice, which is what the Mojo app did too.
        this.queryPeople();
        this.queryStatus();
    },

    assembleIds: function () {
        this.pids = [];
        for (var i = 0; i < this.data.results.length; i++) {
            var d = this.data.results[i];
            if (d.personId) {
                this.pids.push(d.personId);
            }
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
        if (inResponse && inResponse.results && inResponse.results.length > 0) {
            messagingUtils.utils.joinData(this.data, inResponse.results, "_id", "personId", "person");
        }
        this.reply();
    },

    queryStatus: function () {
        this._query('status', {
            query: {
                from: "com.palm.imbuddystatus:1",
                where: [{ prop: "personId", op: "=", val: this.pids }]
            }
        }, 'gotStatus');
    },

    gotStatus: function (inSender, inResponse) {
        if (inResponse && inResponse.results && inResponse.results.length > 0) {
            messagingUtils.utils.joinData(this.data, inResponse.results, "personId", "personId", "status");
        }
        this.reply();
    }
});
