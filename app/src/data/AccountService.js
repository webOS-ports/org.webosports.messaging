/**
 * Messaging accounts, ported from com.palm.app.messaging/data/accountService.js.
 *
 * Reads the MESSAGING capability providers off the user's accounts and exposes the lookups the
 * views need: per-service icons, db kinds, reaction policy, auth pseudo-contacts, and voice/video
 * capability. Listeners register a callback that fires whenever the account set changes.
 *
 * listAccounts answers once: the accounts service ignores subscribe, so on its own the app would
 * never hear of an account added or removed while it runs (and Messaging stays resident). Every
 * IM account has a com.palm.imloginstate record, so the list is re-read whenever the account ids
 * behind those records change.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('./mockDb');

module.exports = kind({
    name: "AccountService",
    kind: Component,

    components: [
        {
            name: 'listAccounts', kind: LunaService,
            service: 'luna://com.webos.service.accounts', method: 'listAccounts',
            subscribe: true, resubscribe: true,
            onResponse: 'gotAccounts', onError: 'accountsError'
        },
        {
            name: 'loginWatch', kind: LunaService,
            service: 'luna://com.webos.service.db', method: 'find',
            subscribe: true, resubscribe: true,
            onResponse: 'gotLoginStates', onError: 'loginWatchError'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.data = [];
        this._cleanedImAccounts = undefined;
        this._accountTypes = undefined;
        this._accountTemplates = undefined;
        this._listeners = [];
        // True once the first listAccounts answer (or error) is in, so callers can tell
        // "no accounts" apart from "not loaded yet".
        this.loaded = false;
        // Account ids seen in imloginstate at the last watch answer; null before the first one.
        this._loginAccountIds = null;
        this._watchingLogins = false;
    },

    // --- fetching ------------------------------------------------------------------------

    getAccounts: function () {
        if (mockDb.enabled) {
            var self = this;
            setTimeout(function () {
                self.gotAccounts(null, mockDb.listAccounts());
            }, 0);
            return;
        }
        this.$.listAccounts.send({ capability: "MESSAGING" });
        this.watchLoginStates();
    },

    watchLoginStates: function () {
        if (this._watchingLogins) {
            return;
        }
        this._watchingLogins = true;
        this.$.loginWatch.send({
            query: { from: messagingUtils.imLoginState.dbKind, select: ["accountId"] },
            watch: true
        });
    },

    gotLoginStates: function (inSender, inResponse) {
        if (inResponse && inResponse.fired) {
            // A watch fires once; ask again for the new set and a fresh watch.
            this._watchingLogins = false;
            this.watchLoginStates();
            return;
        }
        var ids = {};
        ((inResponse && inResponse.results) || []).forEach(function (r) {
            if (r && r.accountId) { ids[r.accountId] = true; }
        });
        var previous = this._loginAccountIds;
        this._loginAccountIds = ids;
        if (this.accountsDiffer(previous, ids)) {
            this.$.listAccounts.send({ capability: "MESSAGING" });
        }
    },

    loginWatchError: function (inSender, inError) {
        this.warn("imloginstate watch failed:", inError && (inError.errorText || inError));
        this._watchingLogins = false;
    },

    /**
     * Whether the accounts behind the login states changed enough to re-read the list. Against the
     * previous answer: any id added or gone. On the first answer there is nothing to compare
     * with, so only an id the loaded list does not have yet counts - an account created between
     * listAccounts and the watch. Comparing against the list itself every time would re-read it
     * on every presence change if an IM account ever had no login state.
     */
    accountsDiffer: function (previous, ids) {
        var id;
        if (previous) {
            for (id in ids) {
                if (ids.hasOwnProperty(id) && !previous[id]) { return true; }
            }
            for (id in previous) {
                if (previous.hasOwnProperty(id) && !ids[id]) { return true; }
            }
            return false;
        }
        if (!this.loaded) {
            return false;   // the first listAccounts answer is still on its way
        }
        var known = {};
        (this.data || []).forEach(function (a) { known[a._id] = true; });
        for (id in ids) {
            if (ids.hasOwnProperty(id) && !known[id]) { return true; }
        }
        return false;
    },

    gotAccounts: function (inSender, inResponse) {
        var accounts = inResponse && (inResponse.accounts || inResponse.results);
        if (accounts && accounts.length > 0) {
            this.data = accounts;
            this._cleanedImAccounts = undefined;
            this._accountTypes = undefined;
            this.getCleanedImAccounts();
        }
        if (inResponse && inResponse.templates) {
            this._accountTemplates = inResponse.templates;
        }
        this.loaded = true;
        this.notifyListeners();
    },

    accountsError: function (inSender, inError) {
        this.warn("listAccounts failed:", inError && (inError.errorText || inError));
        this.loaded = true;
        this.notifyListeners();
    },

    // --- marshalling ---------------------------------------------------------------------

    getCleanedImAccounts: function () {
        this.marshallCleanedImAccounts();
        return this._cleanedImAccounts;
    },

    marshallCleanedImAccounts: function () {
        if (this._cleanedImAccounts) {
            return;
        }
        if (!this.data || this.data.length === 0) {
            return;   // accounts have not loaded yet
        }
        this._cleanedImAccounts = [];
        this._accountTypes = {};
        for (var i = 0; i < this.data.length; i++) {
            this.cleanAccount(this.data[i]);
        }
    },

    cleanAccount: function (account) {
        var providers = account.capabilityProviders || [];
        for (var i = 0; i < providers.length; i++) {
            if (providers[i].capability === "MESSAGING") {
                this.cleanCapability(account, providers[i]);
                break;
            }
        }
    },

    cleanCapability: function (account, cap) {
        cap.accountId = account._id;
        cap.templateId = account.templateId;
        cap.username = account.username;
        cap.alias = account.alias;
        if (!cap.loc_name) {
            cap.loc_name = account.loc_name || "";
        }
        if (cap.loc_shortName === undefined) {
            cap.loc_shortName = cap.loc_name.substr(0, 5);
        }
        this._cleanedImAccounts.push(cap);

        if (cap.capabilitySubtype === "SMS") {
            cap.serviceName = "sms";
            this._accountTypes.sms = cap;
            this._accountTypes.mms = cap;   // MMS rides the same capability
        } else if (cap.serviceName !== undefined && this._accountTypes[cap.accountId] === undefined) {
            if (this._accountTypes[cap.serviceName] === undefined) {
                // generic per-service info, e.g. icons
                this._accountTypes[cap.serviceName] = cap;
            }
            this._accountTypes[cap.accountId] = cap;
        }
    },

    getMyAccountTypesHash: function () {
        this.marshallCleanedImAccounts();
        return this._accountTypes;
    },

    // --- lookups -------------------------------------------------------------------------

    getAccount: function (serviceName, username) {
        if (!this._cleanedImAccounts) {
            this.marshallCleanedImAccounts();
        }
        if (this._cleanedImAccounts) {
            // Phone numbers carry several service names; normalize them all to "sms".
            if (messagingUtils.utils.isTextMessage(serviceName)) {
                serviceName = "sms";
            }
            for (var i = 0; i < this._cleanedImAccounts.length; i++) {
                var a = this._cleanedImAccounts[i];
                if (serviceName === a.serviceName &&
                        (username === undefined || username === a.username)) {
                    return a;
                }
            }
        }
        return undefined;
    },

    getImAccounts: function () {
        var accounts = this.getCleanedImAccounts();
        var ims = [];
        if (accounts) {
            for (var i = 0; i < accounts.length; i++) {
                if (accounts[i].capabilitySubtype === "IM") {
                    ims.push(accounts[i]);
                }
            }
        }
        return ims;
    },

    getIcons: function (serviceName) {
        var accountTypes = this.getMyAccountTypesHash();
        if (!accountTypes) { return null; }
        var account = accountTypes[serviceName];
        return (account && account.icon) || null;
    },

    /**
     * The 48x48 (or 32x32) icon path for a service, or null.
     *
     * This is the accounts service's own absolute path, e.g.
     * /usr/palm/public/accounts/com.palm.whatsapp/images/whatsapp-48x48.png. WAM only lets an
     * app read a file:// outside its own directory when the app is trusted, which appinfo.json
     * now declares - without it every one of these came back ERR_BLOCKED_BY_CLIENT and every
     * service badge rendered blank. Callers still handle null, for a service with no icon.
     */
    getIconPath: function (serviceName) {
        var icon = this.getIcons(serviceName);
        if (!icon) { return null; }
        if (typeof icon === "string") { return icon; }
        return icon.loc_48x48 || icon.loc_32x32 || null;
    },

    getDbKinds: function (serviceName) {
        var accountTypes = this.getMyAccountTypesHash();
        if (!accountTypes) { return null; }
        var account = accountTypes[serviceName];
        if (account === undefined || account.dbkinds === undefined) {
            return {};
        }
        return account.dbkinds;
    },

    getImCommandKind: function (serviceName) {
        var dbkinds = this.getDbKinds(serviceName) || {};
        return dbkinds.imcommand || "com.palm.imcommand:1";
    },

    getChatWithNonBuddies: function (serviceName) {
        var accountTypes = this.getMyAccountTypesHash();
        if (!accountTypes) { return null; }
        var account = accountTypes[serviceName];
        return account ? account.chatWithNonBuddies : null;
    },

    getAccountTemplates: function () {
        return this._accountTemplates;
    },

    /**
     * A MESSAGING or PHONE provider's field for a service, from the live account templates when
     * there are any, else from the account records. LuneOS's listAccounts sends no templates, so
     * without the records every lookup came back empty: no IM service could call, and the
     * reaction and auth-contact settings were never read. The records carry each provider as it
     * was when the account was made.
     *
     * The provider has to name the service: the profile's PHONE provider names none, and taking
     * that as "any service" would offer a call on every IM service. Cellular calling is
     * hasVoiceCapability's own case.
     */
    _fromTemplates: function (capability, serviceName, field) {
        var sources = [this.getAccountTemplates(), this.data];
        for (var s = 0; s < sources.length; s++) {
            var list = sources[s] || [];
            for (var i = 0; i < list.length; i++) {
                var caps = (list[i] && list[i].capabilityProviders) || [];
                for (var j = 0; j < caps.length; j++) {
                    var c = caps[j];
                    if (c && c.capability === capability && c.serviceName === serviceName &&
                            c[field] !== undefined) {
                        return c[field];
                    }
                }
            }
        }
        return undefined;
    },

    /**
     * Per-service reaction policy (the MESSAGING provider's optional "reactions" descriptor).
     * Read from the LIVE template first so template edits take effect without re-adding the
     * account, since the stored account record snapshots capabilities at create time.
     */
    getReactions: function (serviceName) {
        var fromTemplate = this._fromTemplates("MESSAGING", serviceName, "reactions");
        if (fromTemplate) { return fromTemplate; }
        var types = this.getMyAccountTypesHash();
        var acct = types && types[serviceName];
        return (acct && acct.reactions) || null;
    },

    /**
     * Usernames of the non-buddy pseudo-contacts a connector surfaces its interactive login
     * challenge through (Telegram's "Telegram" chat, Facebook's login/2FA chat). They have no
     * presence record, so the "recipient is offline" nag would falsely fire on them mid-login.
     */
    getAuthContacts: function (serviceName) {
        return this._fromTemplates("MESSAGING", serviceName, "authContacts") || [];
    },

    isAuthContact: function (serviceName, address) {
        if (!address) { return false; }
        var list = this.getAuthContacts(serviceName);
        var addr = ("" + address).toLowerCase();
        for (var i = 0; i < list.length; i++) {
            if (("" + list[i]).toLowerCase() === addr) { return true; }
        }
        return false;
    },

    /**
     * Can this service place a voice call through the phone app? Cellular SMS/MMS always can; an IM
     * service can when its template or account has a PHONE provider for it.
     */
    hasVoiceCapability: function (serviceName) {
        if (messagingUtils.utils.isTextMessage(serviceName)) { return true; }
        return this._fromTemplates("PHONE", serviceName, "capability") !== undefined;
    },

    /**
     * Video calling needs the same PHONE provider plus a "videoFormat" other than "none" (the field
     * describes supported orientations, so any value but absent/"none" means video works). Cellular
     * SMS/MMS is voice-capable but never video-capable, so it gets no free pass here.
     */
    hasVideoCapability: function (serviceName) {
        var fmt = this._fromTemplates("PHONE", serviceName, "videoFormat");
        return !!(fmt && fmt !== "none");
    },

    // --- listener plumbing ---------------------------------------------------------------

    /**
     * Named notifyListeners rather than notify: Enyo's ObserverSupport already defines notify(),
     * and overriding it breaks every property notification on this component — including the one
     * addComponent fires while the kind is still being constructed.
     */
    notifyListeners: function () {
        for (var i = 0; i < this._listeners.length; i++) {
            try {
                this._listeners[i].callback();
            } catch (e) {
                this.error("account listener failed:", e);
            }
        }
    },

    register: function (listener, callback) {
        this.unregister(listener);
        this._listeners.push({ listener: listener, callback: callback });
    },

    unregister: function (listener) {
        for (var i = this._listeners.length - 1; i >= 0; i--) {
            if (this._listeners[i].listener === listener) {
                this._listeners.splice(i, 1);
            }
        }
    }
});
