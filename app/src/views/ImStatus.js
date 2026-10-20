/**
 * The presence bar at the top of the left pane: aggregated availability, a spinner while signing
 * in, and an inline editor for the custom status message.
 * Ported from com.palm.app.messaging/app/imstatus/ImStatus.js.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    Input = require('onyx/Input'),
    InputDecorator = require('onyx/InputDecorator'),
    Button = require('onyx/Button'),
    Spinner = require('onyx/Spinner'),
    AccountLoginStatesPopup = require('./AccountLoginStatesPopup'),
    LoginStateServices = require('../data/LoginStateService'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    $L = require('enyo/i18n').$L;

/** How long an account may sit in "logging on" before the spinner is abandoned. */
var LOGIN_TIMEOUT_MS = 90000;

module.exports = kind({
    name: "ImStatus",
    kind: Control,
    classes: "messaging-availability flex-row",

    events: {
        onLoginStatesChange: "",
        onAddAccount: ""
    },

    components: [
        {
            name: "availabilityContainer", classes: "flex-one", components: [
                {
                    classes: "flex-row", ontap: "availabilityTapped", components: [
                        {
                            name: "status", classes: "status status-buddy",
                            style: "margin-top: -1px; margin-left: 0;"
                        },
                        {
                            name: "spinner", kind: Spinner, classes: "status-spinner",
                            style: "margin-left: -10px;", showing: false
                        },
                        {
                            name: "availability", content: $L("Offline"),
                            classes: "availability-text ellipsized-line"
                        },
                        { name: "arrow", classes: "menu-item-arrow" }
                    ]
                }
            ]
        },
        {
            name: "customStatusContainer", classes: "flex-one", showing: false, components: [
                {
                    kind: InputDecorator, classes: "flex-row", components: [
                        {
                            name: "customMessageStatus", classes: "status status-buddy",
                            style: "margin-top: 2px;"
                        },
                        {
                            name: "customMessage", kind: Input, classes: "flex-one custom-status-input",
                            style: "vertical-align: middle;",
                            onblur: "customMessageBlurred", onchange: "customMessageChanged"
                        }
                    ]
                },
                {
                    classes: "flex-row", style: "padding: 0 10px;", components: [
                        {
                            name: "cancelButton", kind: Button, classes: "flex-one",
                            content: $L("Cancel"), ontap: "cancelButtonTapped"
                        },
                        {
                            name: "setButton", kind: Button, classes: "flex-one onyx-dark",
                            content: $L("Set Status"), ontap: "setButtonTapped"
                        }
                    ]
                }
            ]
        },
        {
            name: "accounts", kind: AccountLoginStatesPopup,
            onAvailabilitySet: "availabilitySet", onInputCustomMessage: "inputCustomMessage"
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.loginStates = [];
        this.accountsState = undefined;
        this.statusClass = null;
        this.customMessageStatusClass = null;
        this.loginTimer = undefined;
        this.db = undefined;

        this.finder = this.createComponent({
            kind: LoginStateServices.LoginStateFinder,
            onResults: "gotLoginStates"
        }, { owner: this });

        this.fetchLoginStates();
    },

    destroy: function () {
        this.stopLoginTimer();
        if (this.finder) {
            this.finder.cancel();
        }
        this.inherited(arguments);
    },

    // --- login states --------------------------------------------------------------------

    fetchLoginStates: function () {
        this.finder.cancel();
        this.finder.call();
    },

    gotLoginStates: function (inSender, inEvent) {
        this.loginStates = this.decorateLoginStates((inEvent && inEvent.results) || []);
        this.doLoginStatesChange({ loginStates: this.loginStates });

        this.accountsState = messagingUtils.imLoginState.getAggregatedLoginState(this.loginStates);
        this.setStatusIndicator(this.accountsState);
        this.$.accounts.set('loginStates', this.loginStates);
        this.$.accounts.set('accountsState', this.accountsState || {});
        return true;
    },

    decorateLoginStates: function (loginStates) {
        for (var i = 0; i < loginStates.length; i++) {
            loginStates[i].accountTypeName = this.getAccountTypeName(loginStates[i]);
            loginStates[i].supportsInvisibleStatus = this.supportsInvisibleStatus(loginStates[i]);
        }
        loginStates.sort(function (a, b) {
            if (a.accountTypeName !== b.accountTypeName) {
                return a.accountTypeName > b.accountTypeName ? 1 : -1;
            }
            if (a.username === b.username) { return 0; }
            return a.username > b.username ? 1 : -1;
        });
        return loginStates;
    },

    getAccountTypeName: function (loginState) {
        var accountService = appState.accountService;
        var account = accountService &&
            accountService.getAccount(loginState.serviceName, loginState.username);
        return account ? account.loc_name : "";
    },

    supportsInvisibleStatus: function (loginState) {
        var accountService = appState.accountService;
        var account = accountService &&
            accountService.getAccount(loginState.serviceName, loginState.username);
        return !!(account && account.supportsInvisibleStatus);
    },

    // --- indicator -----------------------------------------------------------------------

    showHideStatusSpinner: function (inShow) {
        this.$.status.setShowing(!inShow);
        this.$.spinner.setShowing(inShow);
        this.$.availability.addRemoveClass("adjust-text-for-no-spinner", !inShow);
    },

    setStatusIndicator: function (accountsState) {
        if (!accountsState) {
            this.setStatusNoAccount();
        } else {
            this.setAllAccountsStatus(accountsState);
        }
    },

    setStatusNoAccount: function () {
        this.status = messagingUtils.im.availabilityCaptions["offline"];
        this.showHideStatusSpinner(false);
        this.updateStatusClass("status-offline");
        this.$.availability.setContent(this.status);
    },

    setAllAccountsStatus: function (accountsState) {
        var currentStatus = messagingUtils.im.availabilityClasses[accountsState.bestAvailability];
        this.status = messagingUtils.im.availabilityCaptions[currentStatus];

        if (accountsState.hasPending) {
            this.setStatusPendingAccount();
        } else {
            this.setStatusHaveAccount(accountsState, currentStatus);
        }
    },

    setStatusPendingAccount: function () {
        this.showHideStatusSpinner(true);
        this.$.availability.setContent(this.getSignInCaption());
        this.startLoginTimer();

        if (this.$.accounts.getShowing()) {
            this.$.accounts.hide();
        }
    },

    getSignInCaption: function () {
        var accountName;
        for (var i = 0; i < this.loginStates.length; i++) {
            var state = this.loginStates[i].state;
            if (state === messagingUtils.imLoginState.TRANSPORT_STATE.LOGGING_ON ||
                    state === messagingUtils.imLoginState.TRANSPORT_STATE.RETRIEVING_DATA) {
                if (accountName === undefined) {
                    accountName = this.loginStates[i].accountTypeName;
                } else {
                    return $L("Signing into all accounts...");
                }
            }
        }
        if (accountName === undefined) {
            return $L("Signing in...");
        }
        return $L("Signing into") + " " + accountName + "...";
    },

    setStatusHaveAccount: function (accountsState, currentStatus) {
        this.showHideStatusSpinner(false);
        this.updateStatusClass(this.getStatusClass(currentStatus));

        if (accountsState.bestAvailability === messagingUtils.im.availability.OFFLINE) {
            this.$.availability.setContent(this.status);
        } else if (!accountsState.identicalAvailabilities || !accountsState.identicalStates ||
                !accountsState.identicalCustomMessages) {
            this.$.availability.setContent($L("Custom Availability"));
        } else if (accountsState.customMessage) {
            this.$.availability.setContent(accountsState.customMessage);
        } else {
            this.$.availability.setContent(this.status);
        }
        this.stopLoginTimer();
    },

    updateStatusClass: function (newStatusClass) {
        if (this.statusClass) {
            this.$.status.removeClass(this.statusClass);
        }
        this.statusClass = newStatusClass;
        this.$.status.addClass(this.statusClass);
    },

    getStatusClass: function (value) {
        return value && value !== "offline" ? "status-" + value : "status-offline";
    },

    /**
     * Fallback for an account genuinely stuck in LOGGING_ON. This deliberately does NOT write to
     * the db: the Mojo original forced availability=OFFLINE on every account, which both lied about
     * accounts that were actually online and made the transport log them off, since an availability
     * of OFFLINE is what triggers a logoff. Just drop the spinner and re-read the real state.
     */
    startLoginTimer: function () {
        if (this.loginTimer) {
            return;
        }
        var self = this;
        this.loginTimer = setTimeout(function () {
            self.loginTimer = undefined;
            self.showHideStatusSpinner(false);
            self.fetchLoginStates();
        }, LOGIN_TIMEOUT_MS);
    },

    stopLoginTimer: function () {
        if (this.loginTimer) {
            clearTimeout(this.loginTimer);
            this.loginTimer = undefined;
        }
    },

    // --- interaction ---------------------------------------------------------------------

    availabilityTapped: function (inSender, inEvent) {
        if (this.loginStates.length === 0) {
            this.doAddAccount();
            return true;
        }
        // Open the selector even while an account is still signing in: gating on the spinner meant
        // one slow or looping sign-in blocked managing any other account.
        this.$.accounts.set('loginStates', this.loginStates);
        this.$.accounts.set('accountsState', this.accountsState || {});
        this.$.accounts.showAtEvent(inEvent);
        return true;
    },

    availabilitySet: function (inSender, inEvent) {
        inEvent.db.updateAvailability(inEvent.loginState.availability);
        this.fetchLoginStates();
        return true;
    },

    inputCustomMessage: function (inSender, inEvent) {
        var loginState = inEvent.loginState;
        this.db = inEvent.db;

        if (loginState._id === undefined) {
            var status = messagingUtils.im.availabilityClasses[loginState.bestAvailability];
            this.updateCustomMessageStatusClass(this.getStatusClass(status));
        } else {
            this.updateCustomMessageStatusClass(this.getStatusClass(
                messagingUtils.im.buddyAvailabilities[
                    messagingUtils.imLoginState.getAvailability(loginState)]));
        }

        var existing = (this.accountsState && this.accountsState.customMessage) ||
            loginState.customMessage || "";
        this.$.customMessage.set('value', existing);
        this.showCustomMessageInput(true);
        this.$.customMessage.focus();
        return true;
    },

    updateCustomMessageStatusClass: function (newStatusClass) {
        if (this.customMessageStatusClass) {
            this.$.customMessageStatus.removeClass(this.customMessageStatusClass);
        }
        this.customMessageStatusClass = newStatusClass;
        this.$.customMessageStatus.addClass(this.customMessageStatusClass);
    },

    saveCustomMessage: function () {
        if (this.db) {
            this.db.updateCustomMessage(this.$.customMessage.get('value'));
        }
        this.finishCustomMessage();
        this.fetchLoginStates();
    },

    customMessageBlurred: function () {
        // Blur alone does not commit; the Set Status button or Enter does.
        return true;
    },

    customMessageChanged: function () {
        this.saveCustomMessage();
        return true;
    },

    cancelButtonTapped: function () {
        this.finishCustomMessage();
        return true;
    },

    setButtonTapped: function () {
        this.saveCustomMessage();
        return true;
    },

    finishCustomMessage: function () {
        this.$.customMessage.set('value', "");
        if (this.$.customMessage.hasNode()) {
            this.$.customMessage.blur();
        }
        this.db = undefined;
        this.showCustomMessageInput(false);
    },

    showCustomMessageInput: function (show) {
        this.$.availabilityContainer.setShowing(!show);
        this.$.customStatusContainer.setShowing(show);
    },

    windowHiddenHandler: function () {
        if (this.$.customStatusContainer.getShowing()) {
            this.finishCustomMessage();
        }
    }
});
