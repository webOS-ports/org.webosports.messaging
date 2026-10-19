/**
 * One account's row in the login-states popup: name, username, presence dot and custom message,
 * with a drawer holding that account's availability picker.
 * Ported from com.palm.app.messaging/app/imstatus/AccountLoginState.js.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    AccountStatuses = require('./AccountStatuses'),
    LoginStateServices = require('../data/LoginStateService'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState');

var AccountLoginState = module.exports = kind({
    name: "AccountLoginState",
    kind: Control,
    classes: "account-login-state flex-column",

    published: {
        loginState: {}
    },

    events: {
        onAvailabilitySet: "",
        onInputCustomMessage: "",
        onDrawerOpened: ""
    },

    components: [
        {
            name: "account", ontap: "toggleDrawer", style: "min-height: 30px; margin-top: 8px;",
            components: [
                {
                    name: "header", classes: "flex-row", components: [
                        {
                            name: "status", classes: "status status-buddy",
                            style: "margin: 3px 10px 0 6px;"
                        },
                        {
                            name: "accountText", classes: "flex-row flex-one", components: [
                                {
                                    name: "accountName",
                                    style: "margin-right: 5px; vertical-align: middle; font-size: 16px;"
                                },
                                {
                                    name: "username", classes: "flex-one ellipsized-line",
                                    style: "font-size: 14px; margin-top: 2px; color: grey;"
                                }
                            ]
                        },
                        { name: "arrow", classes: "menu-item-arrow" }
                    ]
                },
                {
                    name: "footer", classes: "flex-row", components: [
                        {
                            name: "customMessage", classes: "ellipsized-line",
                            style: "width: 100%; font-size: 14px; color: #333; margin: 3px 14px 0 32px; padding-bottom: 8px;"
                        }
                    ]
                }
            ]
        },
        {
            name: "drawer", showing: false, components: [
                {
                    name: "statuses", kind: AccountStatuses,
                    onAvailabilityChanged: "availabilityChanged",
                    onInputCustomMessage: "inputCustomMessage"
                }
            ]
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.showDrawer = false;

        // Set the username FIRST so the row always shows its account id even if the service-label
        // lookup below fails.
        this.$.username.setContent(this.loginState.username);
        this.$.accountName.setContent(this.getServiceLabel());
        this.loginStateChanged();

        this.db = this.createComponent({
            kind: LoginStateServices.AccountLoginStateDB,
            accountId: this.loginState._id
        }, { owner: this });
    },

    /**
     * Friendly service name for this account, resilient to accountTypeName being unset: the
     * pre-decorated value, then the account record, then the account-type template hash, and
     * finally the raw serviceName minus its "type_" prefix. The whole lookup is guarded because
     * getAccount can throw for some account types and that must never break the row.
     */
    getServiceLabel: function () {
        var ls = this.loginState || {};
        try {
            if (ls.accountTypeName) {
                return ls.accountTypeName;
            }
            var as = appState.accountService;
            if (as) {
                if (as.getAccount) {
                    var acct = as.getAccount(ls.serviceName, ls.username);
                    if (acct && acct.loc_name) {
                        return acct.loc_name;
                    }
                }
                if (as.getMyAccountTypesHash) {
                    var types = as.getMyAccountTypesHash();
                    var tmpl = types && types[ls.serviceName];
                    if (tmpl && (tmpl.loc_name || tmpl.name)) {
                        return tmpl.loc_name || tmpl.name;
                    }
                }
            }
        } catch (e) {
            this.warn("getServiceLabel failed, using serviceName fallback:", e);
        }
        var s = (ls.serviceName || "").replace(/^type_/, "");
        return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : "";
    },

    loginStateChanged: function () {
        var availability = messagingUtils.imLoginState.getAvailability(this.loginState);
        this.$.statuses.set('availability', [availability]);
        this.$.statuses.set('invisibilitySupported', this.loginState.supportsInvisibleStatus);

        // An account that failed to sign in has no custom message to show and every reason to
        // say why instead. Without this the row is a presence dot and a blank line, which is
        // all the app had to offer for "AcctMgr_Credentials_Not_Found" - signed out, no hint.
        var error = messagingUtils.imLoginState.getErrorMessage(this.loginState);
        if (error) {
            this.$.customMessage.setContent(error);
        } else if (availability <= messagingUtils.im.availability.BUSY) {
            this.$.customMessage.setContent(this.loginState.customMessage || "");
        } else {
            this.$.customMessage.setContent("");
        }
        this.$.customMessage.addRemoveClass("login-error", Boolean(error));
        this.updateStatusClass();
    },

    availabilityChanged: function (inSender, inEvent) {
        this.loginState.availability = inEvent.availability;
        this.doAvailabilitySet({ db: this.db, loginState: this.loginState });
        return true;
    },

    inputCustomMessage: function (inSender, inEvent) {
        this.doInputCustomMessage({ db: this.db, loginState: this.loginState });
        return true;
    },

    toggleDrawer: function () {
        this.showDrawer = !this.showDrawer;
        this.$.drawer.setShowing(this.showDrawer);

        if (this.showDrawer) {
            this.doDrawerOpened();
            this.$.arrow.setClasses("menu-item-arrow menu-item-arrow-open");
            this.$.account.applyStyle("border-bottom", "1px solid rgba(0,0,0,0.2)");
        } else {
            this.$.arrow.setClasses("menu-item-arrow");
            this.$.account.applyStyle("border-bottom", "none");
        }
        return true;
    },

    closeDrawer: function () {
        if (this.showDrawer) {
            this.toggleDrawer();
        }
    },

    updateStatusClass: function () {
        if (this.statusClass) {
            this.$.status.removeClass(this.statusClass);
        }
        this.statusClass = "status-" + messagingUtils.im.buddyAvailabilities[
            messagingUtils.imLoginState.getAvailability(this.loginState)];
        this.$.status.addClass(this.statusClass);
    }
});

AccountLoginState.COMPONENT_NAME_PREFIX = "loginState-";
