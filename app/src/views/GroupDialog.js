/**
 * Make a group, or add people to one, on a service whose plugin does it (util/chatActions).
 *
 * openCreate() asks for a name and the people; openInvite(thread) for the people to add to that
 * group. People are picked from the contacts, as New Conversation picks them, and only by an
 * address the service can take (chatActions.memberAddress). It writes the createGroup or
 * inviteToGroup imcommand; the transport does the rest, and a new group shows up as a chat once
 * the service has made it.
 */

var kind = require('enyo/kind'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    Input = require('onyx/Input'),
    InputDecorator = require('onyx/InputDecorator'),
    LunaService = require('enyo-webos/LunaService'),
    MsgAddrSearchList = require('./MsgAddrSearchList'),
    chatActions = require('../util/chatActions'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';

module.exports = kind({
    name: "GroupDialog",
    kind: Popup,
    centered: true,
    floating: true,
    modal: true,
    scrim: true,
    classes: "group-dialog",

    components: [
        { name: "title", classes: "group-dialog-title" },
        {
            name: "nameBox", kind: InputDecorator, classes: "group-dialog-name", components: [
                { name: "nameInput", kind: Input, placeholder: $L("Group name"), oninput: "updateButton" }
            ]
        },
        { name: "chosen", classes: "group-dialog-chosen" },
        {
            name: "people", kind: MsgAddrSearchList, classes: "group-dialog-people",
            label: $L("Add"), onSelected: "personPicked"
        },
        {
            classes: "flex-row", components: [
                { kind: Button, content: $L("Cancel"), ontap: "cancelTapped" },
                { classes: "flex-auto" },
                { name: "doneButton", kind: Button, classes: "onyx-affirmative", ontap: "doneTapped" }
            ]
        },
        { name: 'commandPut', kind: LunaService, service: DB_SERVICE, method: 'put', onError: 'commandFailed' }
    ],

    create: function () {
        this.inherited(arguments);
        this.members = [];
        this.mode = null;
    },

    /** The first IM account whose service makes groups, or null. */
    creatingAccount: function () {
        var accountService = appState.accountService;
        var accounts = (accountService && accountService.getImAccounts()) || [];
        for (var i = 0; i < accounts.length; i++) {
            if (chatActions.actionsFor(accounts[i].serviceName, accountService).groupCreate) {
                return accounts[i];
            }
        }
        return null;
    },

    openCreate: function () {
        var account = this.creatingAccount();
        if (!account) {
            return false;
        }
        this.open("create", account, null);
        return true;
    },

    openInvite: function (thread) {
        var accountService = appState.accountService;
        var account = thread && accountService && accountService.getAccount(thread.replyService);
        if (!account || !chatActions.actionsFor(thread.replyService, accountService).groupInvite) {
            return false;
        }
        this.open("invite", account, thread);
        return true;
    },

    open: function (mode, account, thread) {
        this.mode = mode;
        this.account = account;
        this.thread = thread;
        this.members = [];
        var service = account.loc_name || account.loc_shortName || account.serviceName;
        this.$.title.setContent(mode === "create" ?
            $L("New {service} Group").replace("{service}", service) :
            $L("Add People to {group}").replace("{group}", (thread && thread.displayName) || $L("the group")));
        this.$.nameBox.setShowing(mode === "create");
        this.$.nameInput.set('value', "");
        this.$.doneButton.setContent(mode === "create" ? $L("Create") : $L("Add"));
        var serviceName = account.serviceName;
        this.$.people.set('accept', function (entry) {
            return !!chatActions.memberAddress(entry, serviceName);
        });
        this.show();
        this.$.people.reload();
        this.renderChosen();
    },

    personPicked: function (inSender, inEvent) {
        var entry = inEvent && inEvent.msgAddr;
        var attrs = entry && (entry.attributes || entry);
        var address = chatActions.memberAddress(attrs, this.account && this.account.serviceName);
        if (address && !this.members.some(function (m) { return m.address === address; })) {
            this.members.push({ address: address, name: attrs.displayName || address });
            this.renderChosen();
        }
        this.$.people.$.searchInput.set('value', "");
        return true;
    },

    unpick: function (inSender) {
        var address = inSender.memberAddress;
        this.members = this.members.filter(function (m) { return m.address !== address; });
        this.renderChosen();
        return true;
    },

    renderChosen: function () {
        this.$.chosen.destroyClientControls();
        for (var i = 0; i < this.members.length; i++) {
            this.$.chosen.createComponent({
                classes: "group-dialog-member", memberAddress: this.members[i].address,
                ontap: "unpick", allowHtml: true,
                content: messagingUtils.message.emojifyEscaped(this.members[i].name) + " &#215;"
            }, { owner: this });
        }
        this.$.chosen.setShowing(this.members.length > 0);
        this.$.chosen.render();
        this.updateButton();
    },

    updateButton: function () {
        var named = this.mode !== "create" || !!String(this.$.nameInput.get('value') || "").trim();
        this.$.doneButton.setDisabled(!(named && this.members.length));
    },

    doneTapped: function () {
        var accountService = appState.accountService;
        if (!accountService || !this.account || !this.members.length) {
            return true;
        }
        var serviceName = this.account.serviceName;
        var kind = accountService.getImCommandKind(serviceName);
        var addresses = this.members.map(function (m) { return m.address; });
        var command = this.mode === "create" ?
            chatActions.createGroupCommand(kind, serviceName, this.account, this.$.nameInput.get('value'), addresses) :
            chatActions.inviteCommand(kind, serviceName, this.account, this.thread && this.thread.replyAddress, addresses);
        if (!command) {
            return true;
        }
        if (mockDb.enabled) {
            mockDb.imCommands.push(command);
        } else {
            this.$.commandPut.send({ objects: [command] });
        }
        this.hide();
        return true;
    },

    cancelTapped: function () {
        this.hide();
        return true;
    },

    commandFailed: function (inSender, inError) {
        this.error("group command not written:", inError && inError.errorText);
        return true;
    }
});
