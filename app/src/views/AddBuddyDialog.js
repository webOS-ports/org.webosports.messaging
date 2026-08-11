/**
 * Add a buddy to an IM account.
 * Ported from com.palm.app.messaging/app/AddBuddyDialog.js.
 *
 * Writes an "addBuddy" IM command for the chosen account; the transport does the actual invite, and
 * the buddy appears in the list once the network confirms it.
 */

var kind = require('enyo/kind'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    Input = require('onyx/Input'),
    InputDecorator = require('onyx/InputDecorator'),
    Picker = require('onyx/Picker'),
    PickerDecorator = require('onyx/PickerDecorator'),
    LunaService = require('enyo-webos/LunaService'),
    appState = require('../util/appState'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';

module.exports = kind({
    name: "AddBuddyDialog",
    kind: Popup,
    centered: true,
    floating: true,
    modal: true,
    style: "width: 20em;",

    components: [
        { content: $L("Add Buddy"), style: "font-weight: bold; margin-bottom: 0.75rem;" },
        {
            name: "accountRow", classes: "flex-row", style: "margin-bottom: 0.5rem;", components: [
                { content: $L("Account"), classes: "flex-one" },
                {
                    kind: PickerDecorator, components: [
                        {},
                        { name: "accountPicker", kind: Picker, onSelect: "accountSelected" }
                    ]
                }
            ]
        },
        {
            kind: InputDecorator, style: "width: 100%; margin-bottom: 0.5rem;", components: [
                {
                    name: "buddyInput", kind: Input, style: "width: 100%;",
                    placeholder: $L("Buddy's screen name")
                }
            ]
        },
        {
            name: "accountUsername", classes: "account-username-text",
            style: "margin-bottom: 0.75rem;"
        },
        {
            classes: "flex-row", components: [
                { kind: Button, content: $L("Cancel"), ontap: "cancelTapped" },
                { classes: "flex-auto" },
                {
                    name: "addButton", kind: Button, classes: "onyx-affirmative",
                    content: $L("Add"), ontap: "addTapped"
                }
            ]
        },
        {
            name: 'addBuddyCommand', kind: LunaService, service: DB_SERVICE, method: 'put',
            onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.accounts = [];
        this.selectedAccount = null;
    },

    show: function () {
        this.buildAccountList();
        this.$.buddyInput.set('value', "");
        this.inherited(arguments);
    },

    buildAccountList: function () {
        var accountService = appState.accountService;
        this.accounts = (accountService && accountService.getImAccounts()) || [];

        this.$.accountPicker.destroyClientControls();
        for (var i = 0; i < this.accounts.length; i++) {
            this.$.accountPicker.createComponent({
                content: this.accounts[i].loc_name || this.accounts[i].alias,
                accountIndex: i,
                active: i === 0
            }, { owner: this });
        }
        this.$.accountPicker.render();

        this.selectedAccount = this.accounts[0] || null;
        this.updateAccountUsername();
        // With a single account there is nothing to choose, so the picker just states which it is.
        this.$.accountRow.setShowing(this.accounts.length > 1);
        this.$.addButton.setDisabled(this.accounts.length === 0);
    },

    accountSelected: function (inSender, inEvent) {
        var selected = inEvent && inEvent.selected;
        if (selected && selected.accountIndex !== undefined) {
            this.selectedAccount = this.accounts[selected.accountIndex];
            this.updateAccountUsername();
        }
        return true;
    },

    updateAccountUsername: function () {
        this.$.accountUsername.setContent(
            this.selectedAccount ? this.selectedAccount.username || "" : $L("No IM accounts"));
    },

    addTapped: function () {
        var target = (this.$.buddyInput.get('value') || "").replace(/^\s+|\s+$/g, "");
        if (!target || !this.selectedAccount) {
            return true;
        }
        var accountService = appState.accountService;

        var command = {
            _kind: accountService ?
                accountService.getImCommandKind(this.selectedAccount.serviceName) :
                "com.palm.imcommand:1",
            command: "addBuddy",
            handler: "transport",
            targetUsername: target,
            fromUsername: this.selectedAccount.username,
            serviceName: this.selectedAccount.serviceName
        };

        if (mockDb.enabled) {
            this.log("would add buddy:", target, "on", this.selectedAccount.serviceName);
        } else {
            this.$.addBuddyCommand.send({ objects: [command] });
        }

        this.hide();
        return true;
    },

    cancelTapped: function () {
        this.hide();
        return true;
    },

    serviceErr: function (inSender, inError) {
        this.error("add buddy failed:", inError && (inError.errorText || inError));
        return true;
    }
});
