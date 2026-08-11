/**
 * Preferences & Accounts.
 * Ported from com.palm.app.messaging/app/preferences/PreferencesView.js.
 *
 * The account rows come from the account service; tapping one hands off to the Accounts app, since
 * account editing lives there rather than in Messaging.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    Scroller = require('enyo/Scroller'),
    Toolbar = require('onyx/Toolbar'),
    Button = require('onyx/Button'),
    Image = require('enyo/Image'),
    ToggleButton = require('onyx/ToggleButton'),
    Picker = require('onyx/Picker'),
    PickerDecorator = require('onyx/PickerDecorator'),
    Repeater = require('enyo/Repeater'),
    LunaService = require('enyo-webos/LunaService'),
    appState = require('../util/appState'),
    $L = require('enyo/i18n').$L;

var ALERT_OPTIONS = [
    { content: $L("Vibrate"), value: "vibrate" },
    { content: $L("System Sound"), value: "system" },
    { content: $L("Ringtone"), value: "ringtone" },
    { content: $L("Mute"), value: "mute" }
];

/**
 * The transports back-fill old messages with their original send time during a history sync, so
 * notifications are limited to messages newer than this window.
 */
var NOTIFY_AGE_OPTIONS = [
    { content: $L("None (only future)"), value: 0 },
    { content: $L("Last 1 minute"), value: 1 },
    { content: $L("Last 5 minutes"), value: 5 },
    { content: $L("Last 15 minutes"), value: 15 },
    { content: $L("Last hour"), value: 60 },
    { content: $L("Last 6 hours"), value: 360 },
    { content: $L("Last day"), value: 1440 },
    { content: $L("All messages"), value: -1 }
];

module.exports = kind({
    name: "PreferencesView",
    kind: FittableRows,
    classes: "onyx-background",

    events: {
        onClosePreferences: ""
    },

    components: [
        {
            kind: Toolbar, classes: "accounts-header flex-row", components: [
                { kind: Image, src: "assets/messaging-48x48.png" },
                { content: $L("Preferences & Accounts"), style: "margin-left: 0.5rem;" }
            ]
        },
        { classes: "header-shadow" },
        {
            kind: Scroller, fit: true, horizontal: "hidden", components: [
                {
                    classes: "prefs-body", components: [
                        { classes: "prefs-group-caption", content: $L("New Message") },
                        {
                            classes: "prefs-row flex-row", components: [
                                { content: $L("Show Notifications"), classes: "flex-one" },
                                {
                                    name: "showNotification", kind: ToggleButton,
                                    onChange: "showNotificationChange"
                                }
                            ]
                        },
                        {
                            classes: "prefs-row flex-row", components: [
                                { content: $L("Alert"), classes: "flex-one" },
                                {
                                    kind: PickerDecorator, components: [
                                        {},
                                        { name: "alertPicker", kind: Picker, onSelect: "notificationTypeChange" }
                                    ]
                                }
                            ]
                        },
                        {
                            name: "ringtoneRow", classes: "prefs-row flex-row", ontap: "showRingtonePicker",
                            components: [
                                {
                                    name: "ringtoneName", classes: "flex-one",
                                    content: $L("Tap to pick a ringtone")
                                },
                                {
                                    content: $L("ringtone"),
                                    style: "color: rgb(31, 117, 191); text-transform: uppercase;"
                                }
                            ]
                        },
                        {
                            classes: "prefs-row flex-row", components: [
                                { content: $L("Past messages notification period"), classes: "flex-one" },
                                {
                                    kind: PickerDecorator, components: [
                                        {},
                                        { name: "notifyAgePicker", kind: Picker, onSelect: "notifyAgeChange" }
                                    ]
                                }
                            ]
                        },
                        {
                            classes: "prefs-row flex-row", components: [
                                { content: $L("Show Offline Buddies"), classes: "flex-one" },
                                {
                                    name: "showOffline", kind: ToggleButton,
                                    onChange: "showOfflineChange"
                                }
                            ]
                        },

                        { classes: "prefs-group-caption", content: $L("Accounts") },
                        {
                            name: "accountsList", kind: Repeater, onSetupItem: "setupAccountRow",
                            components: [
                                {
                                    name: "accountRow", classes: "contactItem flex-row",
                                    ontap: "editAccount", components: [
                                        { name: "accountIcon", kind: Image, classes: "contact-image" },
                                        {
                                            classes: "message-summary", components: [
                                                { name: "accountName", classes: "contact-name" },
                                                { name: "accountUser", classes: "message-preview" }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            kind: Button, content: $L("Add An Account"), ontap: "addAccount",
                            classes: "accounts-btn"
                        }
                    ]
                }
            ]
        },
        { classes: "footer-shadow" },
        {
            kind: Toolbar, components: [
                {
                    kind: Button, content: $L("Done"), classes: "onyx-dark",
                    ontap: "exitAccountPrefs"
                }
            ]
        },
        {
            name: 'launchApp', kind: LunaService,
            service: 'luna://com.webos.applicationManager', method: 'launch', onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.prefs = null;
        this.accounts = [];

        this.buildPicker(this.$.alertPicker, ALERT_OPTIONS);
        this.buildPicker(this.$.notifyAgePicker, NOTIFY_AGE_OPTIONS);

        if (appState.prefsHandler) {
            appState.prefsHandler.register(this, this.prefsUpdated.bind(this));
        }
        if (appState.accountService) {
            appState.accountService.register(this, this.accountsUpdated.bind(this));
            this.accountsUpdated();
        }
    },

    destroy: function () {
        if (appState.prefsHandler) {
            appState.prefsHandler.unregister(this);
        }
        if (appState.accountService) {
            appState.accountService.unregister(this);
        }
        this.inherited(arguments);
    },

    buildPicker: function (picker, options) {
        for (var i = 0; i < options.length; i++) {
            picker.createComponent({
                content: options[i].content, value: options[i].value
            }, { owner: this });
        }
    },

    // --- prefs -----------------------------------------------------------------------------

    prefsUpdated: function (prefs) {
        if (!prefs) {
            return;
        }
        this.prefs = prefs;
        this.$.showNotification.set('value', !!prefs.enableNotification);
        this.$.showOffline.set('value', !prefs.showOnlineBuddiesOnly);
        this.selectPickerValue(this.$.alertPicker, prefs.notificationSound);
        this.selectPickerValue(this.$.notifyAgePicker, prefs.notifyMaxAgeMinutes);

        if (prefs.ringtone && prefs.ringtone.name) {
            this.$.ringtoneName.setContent(prefs.ringtone.name);
        }
        // A ringtone only matters when the alert is actually set to one.
        this.$.ringtoneRow.setShowing(prefs.notificationSound === "ringtone");
    },

    selectPickerValue: function (picker, value) {
        var controls = picker.getClientControls();
        for (var i = 0; i < controls.length; i++) {
            if (controls[i].value === value) {
                picker.setSelected(controls[i]);
                return;
            }
        }
    },

    savePrefs: function () {
        if (appState.prefsHandler && this.prefs) {
            appState.prefsHandler.setPrefs(this.prefs);
        }
    },

    showNotificationChange: function (inSender) {
        if (!this.prefs) { return true; }
        this.prefs.enableNotification = !!inSender.get('value');
        this.savePrefs();
        return true;
    },

    showOfflineChange: function (inSender) {
        if (!this.prefs) { return true; }
        this.prefs.showOnlineBuddiesOnly = !inSender.get('value');
        this.savePrefs();
        return true;
    },

    notificationTypeChange: function (inSender, inEvent) {
        if (!this.prefs || !inEvent.selected) { return true; }
        this.prefs.notificationSound = inEvent.selected.value;
        this.$.ringtoneRow.setShowing(this.prefs.notificationSound === "ringtone");
        this.savePrefs();
        return true;
    },

    notifyAgeChange: function (inSender, inEvent) {
        if (!this.prefs || !inEvent.selected) { return true; }
        this.prefs.notifyMaxAgeMinutes = inEvent.selected.value;
        this.savePrefs();
        return true;
    },

    showRingtonePicker: function () {
        // Ringtone picking is a device service, so there is nothing to open off-device.
        if (!window.PalmSystem) {
            return true;
        }
        this.$.launchApp.send({
            id: "com.palm.app.musicplayer", params: { fileType: ["ringtone"] }
        });
        return true;
    },

    // --- accounts --------------------------------------------------------------------------

    accountsUpdated: function () {
        var accountService = appState.accountService;
        this.accounts = (accountService && accountService.getCleanedImAccounts()) || [];
        this.$.accountsList.setCount(this.accounts.length);
        return true;
    },

    setupAccountRow: function (inSender, inEvent) {
        var account = this.accounts[inEvent.index];
        if (!account) {
            return true;
        }
        var accountService = appState.accountService;
        var icon = accountService && accountService.getIconPath(account.serviceName);

        this.$.accountIcon.setSrc(icon || "assets/messaging-48x48.png");
        this.$.accountName.setContent(account.loc_name || account.alias || "");
        this.$.accountUser.setContent(account.username || "");
        return true;
    },

    editAccount: function (inSender, inEvent) {
        var account = this.accounts[inEvent.index];
        if (!account) {
            return true;
        }
        this.$.launchApp.send({
            id: "com.palm.app.accounts",
            params: { accountId: account.accountId, capability: "MESSAGING" }
        });
        return true;
    },

    addAccount: function () {
        this.$.launchApp.send({
            id: "com.palm.app.accounts", params: { capability: "MESSAGING", launchType: "add" }
        });
        return true;
    },

    exitAccountPrefs: function () {
        this.doClosePreferences();
        return true;
    },

    serviceErr: function (inSender, inError) {
        this.error("preferences service failed:", inError && (inError.errorText || inError));
        return true;
    }
});
