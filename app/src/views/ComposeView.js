/**
 * The new-message view: pick a recipient, type a message, send.
 * Ported from com.palm.app.messaging/app/compose/ComposeView.js.
 *
 * Sending from here resolves (or creates) the chatthread for the chosen address and hands it up via
 * onOpenConversation, so the conversation view takes over from the first message onwards.
 */

var kind = require('enyo/kind'),
    FittableRows = require('./widgets/FitRows'),
    Toolbar = require('onyx/Toolbar'),
    Button = require('onyx/Button'),
    IconButton = require('onyx/IconButton'),
    TextArea = require('onyx/TextArea'),
    InputDecorator = require('onyx/InputDecorator'),
    Popup = require('onyx/Popup'),
    LunaService = require('enyo-webos/LunaService'),
    MsgAddrSearchList = require('./MsgAddrSearchList'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('../data/mockDb'),
    composerEcho = require('../util/composerEcho'),
    attachments = require('../util/attachments'),
    enyoUtils = require('enyo/utils'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';
var FOLDERS = messagingUtils.message.FOLDERS;

module.exports = kind({
    name: "ComposeView",
    kind: FittableRows,
    classes: "conversationList",

    published: {
        params: null,
        loginStates: []
    },

    events: {
        onOpenConversation: "",
        onCancelCompose: ""
    },

    components: [
        {
            kind: Toolbar, classes: "conversation-header flex-row", components: [
                { kind: Button, content: $L("Cancel"), ontap: "cancelTapped" },
                {
                    classes: "conversation-header-content flex-one",
                    content: $L("New Conversation")
                }
            ]
        },
        { classes: "header-shadow" },
        {
            name: "recipientList", kind: MsgAddrSearchList, fit: true,
            classes: "threads-contactslist", onSelected: "recipientSelected"
        },
        { classes: "footer-shadow" },
        {
            // Forwarded messages' files: a chip each, sent one message per file (util/attachments).
            name: "fileChips", showing: false, classes: "attachment-chips"
        },
        {
            name: "chosenBar", showing: false, classes: "attachment-chip", components: [
                { name: "chosenLabel", classes: "attachment-chip-label" },
                {
                    name: "chosenClear", kind: IconButton, src: "assets/icon-decline.svg",
                    ontap: "clearRecipient"
                }
            ]
        },
        {
            name: "footer", kind: Toolbar, classes: "conversation-bottom flex-row", components: [
                {
                    kind: InputDecorator, classes: "flex-one", components: [
                        {
                            name: "richText", kind: TextArea,
                            placeholder: $L("Enter message here..."), onkeydown: "checkKey",
                            oninput: "composerInput"
                        }
                    ]
                },
                {
                    name: "sendButton", kind: IconButton, src: "assets/menu-icon-send.svg",
                    classes: "conversation-send-btn", ontap: "sendTapped"
                }
            ]
        },
        {
            name: "noticeDialog", kind: Popup, centered: true, floating: true, modal: true,
            components: [
                { name: "noticeTitle", style: "font-weight: bold; margin-bottom: 0.5rem;" },
                { name: "noticeMessage", style: "margin: 0.5rem 0 1rem;" },
                { kind: Button, content: $L("OK"), ontap: "closeNotice" }
            ]
        },
        {
            name: 'threadFind', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'threadFound', onError: 'serviceErr'
        },
        {
            name: 'threadPut', kind: LunaService, service: DB_SERVICE, method: 'put',
            onResponse: 'threadCreated', onError: 'serviceErr'
        },
        {
            name: 'messagePut', kind: LunaService, service: DB_SERVICE, method: 'put',
            onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.recipient = null;
        this.pendingMessageText = "";
        this.files = [];
        this.pendingFiles = [];
    },

    /** Called when the view is shown, so a stale recipient from last time is not carried over. */
    reset: function () {
        this.recipient = null;
        this.$.chosenBar.setShowing(false);
        this.clearFiles();
        this.$.richText.set('value', "");
        this.$.recipientList.reload();
    },

    /**
     * Launch parameters can pre-fill both the recipient and the body — for instance an sms: URL
     * opened from another app.
     */
    paramsChanged: function () {
        var params = this.params;
        if (!params) {
            return;
        }
        if (params.messageText) {
            this.$.richText.set('value', params.messageText);
        }
        var paths = params.filePaths || (params.filePath ? [params.filePath] : []);
        if (paths.length) {
            this.setFiles(paths);
        }

        var addr = null;
        if (params.ims && params.ims.length > 0) {
            addr = { value: params.ims[0].value || params.ims[0].addr, type: params.ims[0].type, isPhone: false };
        } else if (params.phoneNumbers && params.phoneNumbers.length > 0) {
            addr = {
                value: params.phoneNumbers[0].value || params.phoneNumbers[0].addr,
                type: params.phoneNumbers[0].type || "sms", isPhone: true
            };
        } else if (params.recipientName) {
            addr = { value: params.recipientName, type: params.type || "sms", isPhone: true };
        }

        if (addr) {
            this.setRecipient({
                displayName: params.displayName || addr.value,
                personId: params.personId,
                value: addr.value,
                isPhone: addr.isPhone,
                type: addr.type
            });
        }
    },

    // --- forwarded files ---------------------------------------------------------------------

    setFiles: function (paths) {
        this.files = attachments.add([], paths.map(function (path) {
            return { path: path, name: String(path).replace(/^.*\//, "") };
        })).list;
        this.renderFiles();
    },

    renderFiles: function () {
        var box = this.$.fileChips;
        box.destroyClientControls();
        for (var i = 0; i < this.files.length; i++) {
            box.createComponent({
                classes: "attachment-chip", components: [
                    { classes: "attachment-chip-label", content: this.files[i].name },
                    {
                        kind: IconButton, src: "assets/icon-decline.svg", fileIndex: i,
                        ontap: "removeFile"
                    }
                ]
            }, { owner: this });
        }
        box.setShowing(this.files.length > 0);
        if (box.hasNode()) {
            box.render();
        }
        this.resize();
    },

    removeFile: function (inSender) {
        this.files = attachments.remove(this.files, inSender.fileIndex);
        this.renderFiles();
        return true;
    },

    clearFiles: function () {
        this.files = [];
        this.renderFiles();
        return true;
    },

    // --- recipient -------------------------------------------------------------------------

    recipientSelected: function (inSender, inEvent) {
        var model = inEvent && inEvent.msgAddr;
        if (!model) {
            return true;
        }
        this.setRecipient({
            displayName: model.get('displayName'),
            personId: model.get('personId'),
            value: model.get('value'),
            isPhone: model.get('isPhone'),
            type: model.get('type')
        });
        return true;
    },

    setRecipient: function (recipient) {
        this.recipient = recipient;
        this.$.chosenLabel.setContent(
            messagingUtils.utils.formatAddress(recipient.value, recipient.type) +
            (recipient.displayName ? " — " + recipient.displayName : ""));
        this.$.chosenBar.setShowing(true);
        // The bar takes room from the list; refit, or the composer is pushed off the bottom.
        this.resize();
    },

    clearRecipient: function () {
        this.recipient = null;
        this.$.chosenBar.setShowing(false);
        this.resize();
        return true;
    },

    /** The service to send on: a phone number is SMS, anything else uses the address's own type. */
    serviceNameForRecipient: function () {
        if (!this.recipient) {
            return "sms";
        }
        return this.recipient.isPhone ? "sms" : this.recipient.type;
    },

    // --- sending -----------------------------------------------------------------------------

    // After a send the keyboard can write its last word back into this (now hidden) field.
    composerInput: function () {
        composerEcho.check(this.$.richText);
    },

    checkKey: function (inSender, inEvent) {
        if (inEvent.keyCode === 13 && !inEvent.shiftKey) {
            inEvent.preventDefault();
            this.sendTapped();
            return true;
        }
    },

    sendTapped: function () {
        var text = this.$.richText.get('value');

        if (!this.recipient) {
            this.showNotice($L("Pick a recipient"),
                $L("Choose who this message should go to."));
            return true;
        }
        if (!text && !this.files.length) {
            return true;
        }

        var serviceName = this.serviceNameForRecipient();
        // No MMS sending yet: an SMS cannot carry the file, so say so rather than drop it.
        if (this.files.length && messagingUtils.utils.isTextMessage(serviceName)) {
            this.showNotice($L("Attachments"),
                $L("Attachments can't be sent by SMS. Pick an IM service to send a file."));
            return true;
        }
        var accountService = appState.accountService;
        if (accountService && !accountService.getAccount(serviceName)) {
            this.showNotice($L("Unable to send"),
                messagingUtils.utils.isTextMessage(serviceName) ?
                    $L("SMS capability is required.") :
                    $L("You have not set up an IM account of this type."));
            return true;
        }

        this.pendingMessageText = text || "";
        this.pendingFiles = this.files;
        this.findOrCreateThread();
        return true;
    },

    findOrCreateThread: function () {
        var serviceName = this.serviceNameForRecipient();
        var query = {
            from: messagingUtils.thread.dbKind,
            where: [{
                prop: "normalizedAddress", op: "=",
                val: messagingUtils.utils.normalizeAddress(this.recipient.value, serviceName)
            }]
        };
        if (mockDb.enabled) {
            this.threadFound(null, mockDb.find(query));
            return;
        }
        this.$.threadFind.send({ query: query });
    },

    threadFound: function (inSender, inResponse) {
        var results = (inResponse && inResponse.results) || [];
        var serviceName = this.serviceNameForRecipient();
        var match = null;

        for (var i = 0; i < results.length; i++) {
            if (results[i].replyService === serviceName) {
                match = results[i];
                break;
            }
        }

        if (match) {
            this.sendInto(match);
        } else {
            this.createThread();
        }
        return true;
    },

    createThread: function () {
        var serviceName = this.serviceNameForRecipient();
        var thread = {
            _kind: messagingUtils.thread.dbKind,
            timestamp: Date.now(),
            personId: this.recipient.personId,
            displayName: this.recipient.displayName || this.recipient.value,
            replyAddress: this.recipient.value,
            normalizedAddress: messagingUtils.utils.normalizeAddress(this.recipient.value, serviceName),
            replyService: serviceName,
            summary: "",
            flags: { visible: true }
        };

        if (mockDb.enabled) {
            this.threadCreated(null, mockDb.merge([thread]));
            return;
        }
        this.$.threadPut.send({ objects: [thread] });
    },

    threadCreated: function (inSender, inResponse) {
        var id = inResponse && inResponse.results && inResponse.results[0] && inResponse.results[0].id;
        if (!id) {
            return true;
        }
        this.sendInto({
            _id: id,
            replyAddress: this.recipient.value,
            replyService: this.serviceNameForRecipient(),
            displayName: this.recipient.displayName || this.recipient.value
        });
        return true;
    },

    /** Write the first message into the thread, then hand the thread up to be opened. */
    sendInto: function (thread) {
        var serviceName = thread.replyService || this.serviceNameForRecipient();
        var accountService = appState.accountService;
        var account = accountService && accountService.getAccount(serviceName);

        var base = {
            _kind: messagingUtils.utils.isTextMessage(serviceName) ?
                messagingUtils.message.SMS.dbKind :
                ((account && account.dbkinds && account.dbkinds.immessage) ||
                    messagingUtils.message.dbKind),
            folder: FOLDERS.OUTBOX,
            status: "pending",
            conversations: [thread._id],
            flags: { read: true, visible: true },
            to: [{ name: thread.displayName, addr: thread.replyAddress }],
            messageText: this.pendingMessageText,
            serviceName: messagingUtils.utils.isTextMessage(serviceName) ? "sms" : serviceName,
            localTimestamp: Date.now()
        };

        if (account && account.capabilitySubtype === "IM") {
            base.from = { name: account.alias, addr: account.username };
            base.username = account.username;
        }
        // One message per forwarded file, the text on the first, a millisecond apart to keep the
        // order (util/attachments). An SMS carries none: sendTapped refuses that before here.
        var objects = attachments.messages(this.pendingMessageText, this.pendingFiles,
            !messagingUtils.utils.isTextMessage(serviceName)).map(function (part, i) {
            var m = enyoUtils.clone(base);
            m.messageText = part.text;
            m.localTimestamp = base.localTimestamp + i;
            if (part.file) {
                m.filePath = part.file.path;
            }
            return m;
        });

        if (objects.length && mockDb.enabled) {
            mockDb.merge(objects);
        } else if (objects.length) {
            this.$.messagePut.send({ objects: objects });
        }

        this.pendingMessageText = "";
        this.pendingFiles = [];
        this.clearFiles();
        this.$.richText.set('value', "");
        composerEcho.sent(this.$.richText, base.messageText);
        this.doOpenConversation({ threadId: thread._id, thread: thread });
    },

    // --- dialogs -----------------------------------------------------------------------------

    showNotice: function (title, message) {
        this.$.noticeTitle.setContent(title);
        this.$.noticeMessage.setContent(message);
        this.$.noticeDialog.show();
    },

    closeNotice: function () {
        this.$.noticeDialog.hide();
        return true;
    },

    cancelTapped: function () {
        this.doCancelCompose();
        return true;
    },

    serviceErr: function (inSender, inError) {
        this.error("compose service failed:", inError && (inError.errorText || inError));
        return true;
    },

    setLoginStates: function (states) {
        this.set('loginStates', states);
    }
});
