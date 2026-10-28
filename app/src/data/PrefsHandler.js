/**
 * Messaging preferences, stored as a single com.palm.app.messagingprefs:1 record.
 * Ported from com.palm.app.messaging/app/preferences/PrefsHandler.js.
 *
 * Listeners register a callback that fires whenever the record changes, which is how the app menu's
 * show/hide-offline item and the buddy list stay in step with the stored setting.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    cancelRequests = require('../util/cancelRequests'),
    pickPrefsRecord = require('../util/prefsRecords'),
    mockDb = require('./mockDb');

var DB_SERVICE = 'luna://com.webos.service.db';
var PREFS_KIND = "com.palm.app.messagingprefs:1";

module.exports = kind({
    name: "PrefsHandler",
    kind: Component,

    published: {
        prefs: undefined
    },

    components: [
        {
            name: 'prefsGetter', kind: LunaService, service: DB_SERVICE, method: 'find',
            subscribe: true, resubscribe: true, onResponse: '_gotPrefs', onError: '_failed'
        },
        {
            name: 'prefsPutter', kind: LunaService, service: DB_SERVICE, method: 'put',
            onResponse: '_putDone', onError: '_putFailed'
        },
        { name: 'prefsMerger', kind: LunaService, service: DB_SERVICE, method: 'merge', onError: '_failed' },
        { name: 'prefsDeleter', kind: LunaService, service: DB_SERVICE, method: 'del', onError: '_failed' }
    ],

    create: function () {
        this.inherited(arguments);
        this._listeners = [];
        this._getPrefs();
    },

    getPrefs: function () {
        return this.prefs;
    },

    _getPrefs: function () {
        var query = { from: PREFS_KIND };
        if (mockDb.enabled) {
            var self = this;
            setTimeout(function () {
                self._gotPrefs(null, { returnValue: true, results: mockDb.prefs ? [mockDb.prefs] : [] });
            }, 0);
            return;
        }
        cancelRequests(this.$.prefsGetter);
        this.$.prefsGetter.send({ query: query, watch: true });
    },

    _gotPrefs: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            this._getPrefs();
            return true;
        }
        var picked = pickPrefsRecord(inResponse && inResponse.results);
        if (picked.extraIds.length > 0) {
            // There is meant to be one record; drop the others so every read and write agrees.
            this.warn("removing", picked.extraIds.length, "extra prefs record(s)");
            this.$.prefsDeleter.send({ ids: picked.extraIds });
        }
        if (!picked.keep) {
            if (this._creating) {
                // The defaults are already on their way; a second put would leave two records.
                return true;
            }
            // No record yet, so write the defaults.
            this.prefs = this._getDefaultPrefs();
            this._putPrefs();
        } else if (this._dirty && this.prefs) {
            // A change was made before the new record's id was known: write it now.
            this.prefs._id = picked.keep._id;
            this._creating = false;
            this.setPrefs(this.prefs);
            return true;
        } else {
            this.prefs = picked.keep;
            // db8 bookkeeping fields must not be written back out.
            delete this.prefs._kind;
            delete this.prefs._rev;
            delete this.prefs._sync;
        }
        this._notify();
        return true;
    },

    _getDefaultPrefs: function () {
        return {
            "_kind": PREFS_KIND,
            "enableNotification": true,
            "notificationSound": "system",
            "notifyMaxAgeMinutes": 60,
            "ringtone": {},
            "isHistoryViewSelected": true,
            "showOnlineBuddiesOnly": true,
            "useImmediateMmsRetrieval": true,
            "firstUseMode": true
        };
    },

    /** Persist the current prefs object; called by views after they mutate it. */
    setPrefs: function (prefs) {
        this.prefs = prefs;
        if (mockDb.enabled) {
            mockDb.prefs = prefs;
            this._notify();
            return;
        }
        if (!prefs._id) {
            // The defaults were never stored, or are still being: a merge needs the record's id,
            // so the change is written once there is one.
            this._dirty = true;
            if (!this._creating) {
                this._putPrefs();
            }
            this._notify();
            return;
        }
        this._dirty = false;
        var record = {};
        for (var k in prefs) {
            if (prefs.hasOwnProperty(k)) { record[k] = prefs[k]; }
        }
        record._kind = PREFS_KIND;
        this.$.prefsMerger.send({ objects: [record] });
        this._notify();
    },

    _putPrefs: function () {
        if (mockDb.enabled) {
            mockDb.prefs = this.prefs;
            return;
        }
        this._creating = true;
        var record = {};
        for (var k in this.prefs) {
            if (this.prefs.hasOwnProperty(k)) { record[k] = this.prefs[k]; }
        }
        record._kind = PREFS_KIND;
        this.$.prefsPutter.send({ objects: [record] });
    },

    _putDone: function (inSender, inResponse) {
        var stored = inResponse && inResponse.results && inResponse.results[0];
        this._creating = false;
        if (stored && stored.id && this.prefs && !this.prefs._id) {
            this.prefs._id = stored.id;
            if (this._dirty) {
                this.setPrefs(this.prefs);
            }
        }
        return true;
    },

    _putFailed: function (inSender, inError) {
        this._creating = false;
        return this._failed(inSender, inError);
    },

    _failed: function (inSender, inError) {
        this.warn("prefs service failed:", inError && (inError.errorText || inError));
        if (!this.prefs) {
            // Fall back to defaults so the app still works with no stored record.
            this.prefs = this._getDefaultPrefs();
            this._notify();
        }
        return true;
    },

    _notify: function () {
        for (var i = 0; i < this._listeners.length; i++) {
            try {
                this._listeners[i].callback(this.prefs);
            } catch (e) {
                this.error("prefs listener failed:", e);
            }
        }
    },

    register: function (listener, callback) {
        this.unregister(listener);
        this._listeners.push({ listener: listener, callback: callback });
        if (this.prefs) {
            callback(this.prefs);
        }
    },

    unregister: function (listener) {
        for (var i = this._listeners.length - 1; i >= 0; i--) {
            if (this._listeners[i].listener === listener) {
                this._listeners.splice(i, 1);
            }
        }
    }
});
