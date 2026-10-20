/**
 * The account selector popped from the presence bar: an "all accounts" availability block plus one
 * expandable row per account.
 * Ported from com.palm.app.messaging/app/imstatus/AccountLoginStatesPopup.js.
 */

var kind = require('enyo/kind'),
    Popup = require('onyx/Popup'),
    Scroller = require('enyo/Scroller'),
    utils = require('enyo/utils'),
    AccountStatuses = require('./AccountStatuses'),
    AccountLoginState = require('./AccountLoginState'),
    Divider = require('./widgets/Divider'),
    LoginStateServices = require('../data/LoginStateService'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "AccountLoginStatesPopup",
    kind: Popup,
    floating: true,
    autoDismiss: true,
    style: "width: 330px;",

    published: {
        loginStates: [],
        accountsState: {}
    },

    events: {
        onAvailabilitySet: "",
        onInputCustomMessage: ""
    },

    components: [
        {
            name: "scroller", kind: Scroller, horizontal: "hidden",
            style: "max-height: 400px;", components: [
                {
                    name: "allAccountsDivider", kind: Divider, caption: $L("ALL ACCOUNTS"),
                    style: "margin: 5px 0;", showing: false
                },
                {
                    name: "allAccounts", kind: AccountStatuses, classes: "all-accounts",
                    onAvailabilityChanged: "changeAccountsAvailability",
                    onInputCustomMessage: "inputAccountsCustomMessage"
                },
                {
                    name: "indAccountsDivider", kind: Divider, caption: $L("INDIVIDUAL ACCOUNTS"),
                    style: "margin: 5px 0;", showing: false
                }
            ]
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.db = this.createComponent({
            kind: LoginStateServices.BaseLoginStateDB,
            loginStates: this.loginStates
        }, { owner: this });
    },

    loginStatesChanged: function () {
        var multiple = this.loginStates.length > 1;
        this.$.allAccountsDivider.setShowing(multiple);
        this.$.indAccountsDivider.setShowing(multiple);
        this.checkInvisibilitySupport();
        this.updateAllAccountsAvailability();
        this.updateLoginStateComponents();
        this.db.set('loginStates', this.loginStates);
    },

    checkInvisibilitySupport: function () {
        this.$.allAccounts.set('invisibilitySupported',
            this.shouldShowAllAccountsInvisibleStatus(this.loginStates));
    },

    updateAllAccountsAvailability: function () {
        var availArray = [];
        for (var i = 0; i < this.loginStates.length; i++) {
            availArray[i] = require('../util/messagingUtils').imLoginState
                .getAvailability(this.loginStates[i]);
        }
        this.$.allAccounts.set('availability', availArray);
    },

    updateLoginStateComponents: function () {
        var loginStateComponents = this.getLoginStateComponents();
        var key;

        if (this.loginStates.length <= 1) {
            // With a single account there is nothing to pick between, so the all-accounts block is
            // the whole UI and the per-account rows come down.
            for (key in loginStateComponents) {
                if (loginStateComponents.hasOwnProperty(key)) {
                    this.destroyLoginStateComponent(loginStateComponents[key]);
                }
            }
            return;
        }

        var component, i;
        var stateIds = {};

        for (i = 0; i < this.loginStates.length; i++) {
            component = loginStateComponents[this.loginStates[i]._id];
            stateIds[this.loginStates[i]._id] = true;

            if (component) {
                component.set('loginState', this.loginStates[i]);
            } else {
                component = this.$.scroller.createComponent({
                    name: AccountLoginState.COMPONENT_NAME_PREFIX + this.loginStates[i]._id,
                    kind: AccountLoginState,
                    loginState: this.loginStates[i],
                    classes: "individual-account",
                    onAvailabilitySet: "changeAvailability",
                    onInputCustomMessage: "inputCustomMessage",
                    onDrawerOpened: "drawerOpened"
                }, { owner: this });
                component.render();
            }

            if (i !== 0) {
                component.applyStyle("border-top", "1px solid rgba(255,255,255,0.5)");
            }
            if (i !== this.loginStates.length - 1) {
                component.applyStyle("border-bottom", "1px solid rgba(0,0,0,0.2)");
            }
        }

        for (key in loginStateComponents) {
            if (loginStateComponents.hasOwnProperty(key) && !stateIds[key]) {
                this.destroyLoginStateComponent(loginStateComponents[key]);
            }
        }
    },

    /** Only one account drawer stays open at a time. */
    drawerOpened: function (inSender) {
        var loginStateComponents = this.getLoginStateComponents();
        for (var key in loginStateComponents) {
            if (loginStateComponents.hasOwnProperty(key) && loginStateComponents[key] !== inSender) {
                loginStateComponents[key].closeDrawer();
            }
        }
        return true;
    },

    getLoginStateComponents: function () {
        var components = {};
        utils.forEach(this.getComponents(), function (comp) {
            var name = comp.getName();
            if (name && name.indexOf(AccountLoginState.COMPONENT_NAME_PREFIX) >= 0) {
                var id = name.substring(AccountLoginState.COMPONENT_NAME_PREFIX.length);
                components[id] = comp;
            }
        });
        return components;
    },

    destroyLoginStateComponent: function (component) {
        component.setShowing(false);
        component.destroy();
    },

    changeAccountsAvailability: function (inSender, inEvent) {
        this.accountsState.availability = inEvent.availability;
        this.doAvailabilitySet({ db: this.db, loginState: this.accountsState });
        this.hide();
        return true;
    },

    changeAvailability: function (inSender, inEvent) {
        this.doAvailabilitySet({ db: inEvent.db, loginState: inEvent.loginState });
        this.hide();
        return true;
    },

    inputAccountsCustomMessage: function (inSender, inEvent) {
        this.doInputCustomMessage({ db: this.db, loginState: this.accountsState });
        this.hide();
        return true;
    },

    inputCustomMessage: function (inSender, inEvent) {
        this.doInputCustomMessage({ db: inEvent.db, loginState: inEvent.loginState });
        this.hide();
        return true;
    },

    hide: function () {
        this.inherited(arguments);
        this.drawerOpened();   // closes every drawer
    },

    shouldShowAllAccountsInvisibleStatus: function (states) {
        if (!states || states.length === 0) {
            return false;
        }
        for (var i = 0; i < states.length; i++) {
            if (!states[i].supportsInvisibleStatus) {
                return false;
            }
        }
        return true;
    }
});
