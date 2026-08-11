/**
 * IM login-state reads and writes.
 * Ported from com.palm.app.messaging/app/imstatus/LoginStateServices.js.
 *
 *   LoginStateFinder    — subscribed find over com.palm.imloginstate:1
 *   BaseLoginStateDB    — writes availability / custom message across ALL accounts
 *   AccountLoginStateDB — the same, scoped to a single account
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('./mockDb');

var DB_SERVICE = 'luna://com.webos.service.db';

var LoginStateFinder = kind({
    name: "LoginStateFinder",
    kind: Component,

    events: {
        onResults: ""
    },

    components: [
        {
            name: 'finder', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: 'gotResults', onError: 'fail'
        }
    ],

    call: function () {
        var query = { from: messagingUtils.imLoginState.dbKind };
        if (mockDb.enabled) {
            var self = this;
            setTimeout(function () {
                self.gotResults(null, mockDb.find(query));
            }, 0);
            return;
        }
        this.$.finder.cancel();
        this.$.finder.send({ query: query, watch: true });
    },

    cancel: function () {
        this.$.finder.cancel();
    },

    gotResults: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this.call();
            return;
        }
        this.doResults({ results: (inResponse && inResponse.results) || [] });
    },

    fail: function (inSender, inResponse) {
        this.warn("login state query failed:", inResponse && (inResponse.errorText || inResponse));
        this.doResults({ results: [] });
    }
});

/** Writes that apply to every IM account at once. */
var BaseLoginStateDB = kind({
    name: "BaseLoginStateDB",
    kind: Component,

    published: {
        loginStates: []
    },

    events: {
        onMerged: ""
    },

    components: [
        {
            name: 'stateMerger', kind: LunaService, service: DB_SERVICE, method: 'merge',
            onResponse: 'merged', onError: 'fail'
        }
    ],

    updateAvailability: function (avail) {
        this._merge(this._getAvailabilityMergeParams(avail));
    },

    updateCustomMessage: function (message) {
        var mergeItems = [];
        for (var i = 0; i < this.loginStates.length; i++) {
            var loginState = this.loginStates[i];
            var availability = messagingUtils.imLoginState.getAvailability(loginState);
            // A custom message only makes sense while reachable, so skip invisible/offline accounts.
            if (availability <= messagingUtils.im.availability.BUSY) {
                mergeItems.push({ _id: loginState._id, customMessage: message });
            }
        }
        if (mergeItems.length > 0) {
            this._merge({ objects: mergeItems });
        }
    },

    _getAvailabilityMergeParams: function (avail) {
        return {
            query: { from: messagingUtils.imLoginState.dbKind },
            props: { availability: avail }
        };
    },

    _merge: function (params) {
        if (mockDb.enabled) {
            var records = mockDb.store[messagingUtils.imLoginState.dbKind] || [];
            if (params.objects) {
                mockDb.merge(params.objects.map(function (o) {
                    o._kind = messagingUtils.imLoginState.dbKind;
                    return o;
                }));
            } else if (params.props) {
                for (var i = 0; i < records.length; i++) {
                    for (var k in params.props) {
                        if (params.props.hasOwnProperty(k)) { records[i][k] = params.props[k]; }
                    }
                }
            }
            var self = this;
            setTimeout(function () { self.merged(null, { returnValue: true, count: 1 }); }, 0);
            return;
        }
        this.$.stateMerger.send(params);
    },

    merged: function (inSender, inResponse) {
        this.doMerged({ count: (inResponse && inResponse.count) || 0 });
        return true;
    },

    fail: function (inSender, inError) {
        this.error("login state merge failed:", inError && (inError.errorText || inError));
        return true;
    }
});

/** Writes scoped to a single account. */
var AccountLoginStateDB = kind({
    name: "AccountLoginStateDB",
    kind: BaseLoginStateDB,

    published: {
        accountId: undefined
    },

    updateCustomMessage: function (message) {
        this._merge({ objects: [{ _id: this.accountId, customMessage: message }] });
    },

    _getAvailabilityMergeParams: function (avail) {
        return { objects: [{ _id: this.accountId, availability: avail }] };
    }
});

module.exports = {
    LoginStateFinder: LoginStateFinder,
    BaseLoginStateDB: BaseLoginStateDB,
    AccountLoginStateDB: AccountLoginStateDB
};
