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

// Room kept free below the list, so the popup's lower edge stays clear of the screen's.
var SCREEN_MARGIN = 10;
// Never shorter than this, even on a very short screen: a few rows to scroll through.
var MIN_LIST_HEIGHT = 120;

module.exports = kind({
    name: "AccountLoginStatesPopup",
    kind: Popup,
    // A light menu, as the other popup menus (css/palm-chrome.less): the Palm row lines in
    // css/palm-app.less were drawn for this sheet.
    classes: "light-menu",
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
            // The height comes from fitScroller(), through maxHeight: the touch scroller (which
            // the device uses) only scrolls inside its own maxHeight. A CSS max-height on this
            // control cut the list off at a fixed 400px with no way to scroll, so on a phone the
            // last accounts could not be reached to bring them online.
            name: "scroller", kind: Scroller, horizontal: "hidden", touch: true, components: [
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
        this.fitScroller();
    },

    showAtPosition: function (pos) {
        this.openedAt = pos ? utils.mixin({}, pos) : null;
        this.inherited(arguments);
    },

    showingChanged: function () {
        this.inherited(arguments);
        if (this.showing) {
            this.$.scroller.scrollToTop();
            this.fitScroller();
        }
    },

    /**
     * Lets the list grow to the room left between where the popup opens and the bottom of the
     * screen; it scrolls only when it holds more than that.
     *
     * Measured from the spot the popup was opened at, not from where it sits: enyo/Popup moves a
     * popup taller than that room up, off the top of a short screen, and rewrites targetPosition
     * as it does. The opening spot is kept apart and handed back before the popup is resized, so
     * it is placed again, with its new height, where it was opened.
     */
    fitScroller: function () {
        var node = this.hasNode(), list = this.$.scroller.hasNode();
        if (!this.showing || !node || !list) {
            return;
        }
        var anchor = node.getBoundingClientRect().top;
        if (this.openedAt && typeof this.openedAt.top === "number") {
            this.targetPosition = utils.mixin({}, this.openedAt);
            anchor = this.openedAt.top;
        }
        // What the popup adds around the list: its padding and border.
        var around = node.offsetHeight - list.offsetHeight;
        var room = window.innerHeight - anchor - around - SCREEN_MARGIN;
        this.$.scroller.set('maxHeight', Math.max(MIN_LIST_HEIGHT, Math.floor(room)) + "px");
        this.resize();
    },

    /** An account opened or closed its options: refit, and bring an opened one into view. */
    drawerToggled: function (inSender, inEvent) {
        this.fitScroller();
        if (inEvent && inEvent.open) {
            this.$.scroller.scrollToControl(inSender, false);
        }
        return true;
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
                    onDrawerOpened: "drawerOpened",
                    onDrawerToggled: "drawerToggled"
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
