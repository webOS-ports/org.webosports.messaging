/**
 * The conversation view: the message list for one chat thread, plus its header and composer.
 * Ported from com.palm.app.messaging/app/conversations/ConversationList.js.
 *
 * Covers the header (presence dot, name, call buttons, transport picker), the block/delete bar at
 * the top of the list, date/transport dividers, the message bubbles, the composer with attachment,
 * voice-note and send affordances, the reply bar, the reaction picker, poll voting, draft
 * save/restore, and the retry-on-failure dialog.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    DataList = require('enyo/DataList'),
    Collection = require('enyo/Collection'),
    Toolbar = require('onyx/Toolbar'),
    Button = require('onyx/Button'),
    IconButton = require('onyx/IconButton'),
    Popup = require('onyx/Popup'),
    Menu = require('onyx/Menu'),
    MenuItem = require('onyx/MenuItem'),
    TextArea = require('onyx/TextArea'),
    InputDecorator = require('onyx/InputDecorator'),
    Image = require('enyo/Image'),
    Scroller = require('enyo/Scroller'),
    LunaService = require('enyo-webos/LunaService'),
    ConversationRow = require('./ConversationRow'),
    ConversationService = require('../data/ConversationService'),
    transportPicker = require('../util/transportPicker'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('../data/mockDb'),
    moment = require('moment'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';
var FOLDERS = messagingUtils.message.FOLDERS;

/** The quick-reaction row, stored as HTML numeric entities so they survive the db8/JS round-trip. */
var QUICK_REACTIONS = ["&#10084;&#65039;", "&#128077;", "&#128518;", "&#128558;", "&#128546;", "&#128591;"];

module.exports = kind({
    name: "ConversationList",
    kind: FittableRows,
    classes: "conversationList",

    events: {
        onSelectThread: "",
        onClearUnreadCount: "",
        onCloseConversationList: "",
        onOpenComposeView: "",
        onSelectSender: ""
    },

    published: {
        chatThread: null,
        params: null,
        loginStates: []
    },

    components: [
        // --- header ---------------------------------------------------------------------
        {
            name: "headerBar", kind: Toolbar, classes: "conversation-header flex-row", components: [
                { name: "status", classes: "status" },
                {
                    name: "header", classes: "conversation-header-content flex-one",
                    allowHtml: true, ontap: "handleHeaderTap"
                },
                {
                    name: "videoCallButton", kind: IconButton, src: "assets/video-call-icon.png",
                    showing: false, ontap: "videocall", classes: "conversation-call-btn"
                },
                {
                    name: "phoneCallButton", kind: IconButton, src: "assets/phone-icon.png",
                    showing: false, ontap: "voicecall", classes: "conversation-call-btn"
                },
                {
                    name: "transportButton", kind: Button, classes: "conversation-header-type",
                    ontap: "openTransportMenu"
                }
            ]
        },
        { classes: "header-shadow" },

        // --- messages -------------------------------------------------------------------
        {
            name: "listButtons", classes: "block-delete-box", showing: false, components: [
                {
                    name: "blockButton", kind: Button, content: $L("Block Sender"),
                    classes: "blocksender-bt flex-one", ontap: "promptBlock"
                },
                {
                    name: "deleteButton", kind: Button, content: $L("Delete Conversation"),
                    classes: "deleteconversation-bt flex-one", ontap: "promptDelete"
                }
            ]
        },
        {
            name: "list", kind: DataList, fit: true,
            scrollerOptions: { horizontal: "hidden", touch: true },
            // Handlers sit on the list; row events arrive decorated with their model and index.
            ontap: "handleMessageTap", onConfirm: "swipeDelete", onReact: "handleReactSwipe",
            onError: "showErrorDialog", onSelectSender: "senderRowSelected",
            onOpenAttachment: "openAttachment", onInviteResponse: "respondToInvite",
            components: [
                { kind: ConversationRow }
            ]
        },
        { classes: "footer-shadow" },

        // --- staged attachment ----------------------------------------------------------
        {
            name: "attachmentChip", showing: false, classes: "attachment-chip", components: [
                { name: "attachmentChipThumb", kind: Image, classes: "attachment-chip-thumb", showing: false },
                { name: "attachmentChipLabel", classes: "attachment-chip-label" },
                {
                    name: "attachmentChipRemove", kind: IconButton, src: "assets/icon-decline.png",
                    ontap: "clearAttachment"
                }
            ]
        },

        // --- reply bar ------------------------------------------------------------------
        {
            name: "replyBar", showing: false, classes: "reply-bar", components: [
                { classes: "reply-bar-accent" },
                { name: "replyBarText", classes: "reply-bar-text flex-one", allowHtml: true },
                {
                    name: "replyBarClose", kind: IconButton, src: "assets/icon-decline.png",
                    classes: "reply-bar-close", ontap: "cancelReply"
                }
            ]
        },

        // --- composer -------------------------------------------------------------------
        {
            name: "footer", kind: Toolbar, classes: "conversation-bottom flex-row", components: [
                {
                    name: "attachButton", kind: IconButton, src: "assets/menu-icon-attach.png",
                    classes: "conversation-attach-btn", ontap: "openAttachmentPicker"
                },
                {
                    name: "micButton", kind: IconButton, src: "assets/menu-icon-mic.png",
                    classes: "conversation-mic-btn", ontap: "micButtonTapped"
                },
                { name: "vnTimer", classes: "conversation-vn-timer", showing: false },
                {
                    kind: InputDecorator, classes: "flex-one", components: [
                        {
                            name: "scroller", kind: Scroller, horizontal: "hidden",
                            style: "max-height: 155px;", components: [
                                {
                                    name: "richText", kind: TextArea,
                                    placeholder: $L("Enter message here..."),
                                    onkeydown: "checkKey"
                                }
                            ]
                        }
                    ]
                },
                {
                    name: "sendButton", kind: IconButton, src: "assets/menu-icon-send.png",
                    classes: "conversation-send-btn", ontap: "sendButtonTapped"
                }
            ]
        },

        // --- popups ---------------------------------------------------------------------
        {
            name: "transportMenu", kind: Menu, floating: true, onSelect: "transportChosen"
        },
        {
            name: "reactRow", kind: Popup, floating: true, autoDismiss: true,
            classes: "reaction-picker-popup", components: [
                { name: "reactRowBox", classes: "reaction-row-box" }
            ]
        },
        {
            name: "messageMenu", kind: Menu, floating: true, components: [
                { kind: MenuItem, content: $L("Reply"), ontap: "menuReply" },
                { kind: MenuItem, content: $L("Copy Text"), ontap: "menuCopy" },
                { classes: "onyx-menu-divider" },
                { kind: MenuItem, content: $L("Delete"), ontap: "menuDelete" }
            ]
        },
        {
            name: "errorDialog", kind: Popup, centered: true, floating: true, modal: true,
            components: [
                { name: "errorDialogTitle", style: "font-weight: bold; margin-bottom: 0.5rem;" },
                { name: "errorDialogMessage", style: "margin: 0.5rem 0 1rem;" },
                {
                    classes: "flex-row", components: [
                        { kind: Button, content: $L("OK"), ontap: "closeErrorDialog" },
                        { classes: "flex-auto" },
                        {
                            name: "errorRetryButton", kind: Button, content: $L("Retry"),
                            ontap: "retryMessage"
                        }
                    ]
                }
            ]
        },
        {
            name: "confirmDialog", kind: Popup, centered: true, floating: true, modal: true,
            components: [
                { name: "confirmDialogTitle", style: "font-weight: bold; margin-bottom: 0.5rem;" },
                { name: "confirmDialogMessage", style: "margin: 0.5rem 0 1rem;" },
                {
                    classes: "flex-row", components: [
                        { kind: Button, content: $L("Cancel"), ontap: "closeConfirmDialog" },
                        { classes: "flex-auto" },
                        {
                            name: "confirmAcceptButton", kind: Button, classes: "onyx-negative",
                            ontap: "confirmAccepted"
                        }
                    ]
                }
            ]
        },

        // --- services -------------------------------------------------------------------
        {
            name: 'messagePut', kind: LunaService, service: DB_SERVICE, method: 'put',
            onResponse: 'revealListBottom', onError: 'serviceErr'
        },
        {
            name: 'messageDraftPut', kind: LunaService, service: DB_SERVICE, method: 'put',
            onError: 'serviceErr'
        },
        {
            name: 'draftFind', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotDraftMessages', onError: 'serviceErr'
        },
        { name: 'dbDelete', kind: LunaService, service: DB_SERVICE, method: 'del', onError: 'serviceErr' },
        { name: 'dbMerge', kind: LunaService, service: DB_SERVICE, method: 'merge', onError: 'serviceErr' },
        {
            name: 'reactionCommand', kind: LunaService, service: DB_SERVICE, method: 'put',
            onError: 'serviceErr'
        },
        {
            name: 'threadMerge', kind: LunaService, service: DB_SERVICE, method: 'merge',
            onError: 'serviceErr'
        },
        {
            name: 'deleteThreadService', kind: LunaService,
            service: 'luna://org.webosports.service.messaging', method: 'deleteChatthread',
            onError: 'serviceErr'
        },
        {
            name: 'launchApp', kind: LunaService,
            service: 'luna://com.webos.applicationManager', method: 'launch', onError: 'serviceErr'
        },
        {
            name: 'openApp', kind: LunaService,
            service: 'luna://com.webos.applicationManager', method: 'open', onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.selectedMessage = null;
        this.replyToMessage = null;
        this.outboundAttachment = null;
        this.recording = false;
        this.messages = [];

        this.collection = new Collection();
        this.$.list.set("collection", this.collection);

        this.conversationService = this.createComponent({
            kind: ConversationService,
            onResults: "gotMessages", onWatch: "messagesWatch"
        }, { owner: this });

        // Register as the active conversation list so inline-image onload callbacks, which run from
        // raw HTML outside any control, can reach us to re-measure once images have loaded.
        appState.activeConversationList = this;
        messagingUtils.activeConversationList = this;

        this.buildReactionRow();
    },

    destroy: function () {
        if (appState.activeConversationList === this) {
            appState.activeConversationList = null;
            messagingUtils.activeConversationList = null;
        }
        if (this._imgRelayoutTimer) {
            clearTimeout(this._imgRelayoutTimer);
            this._imgRelayoutTimer = null;
        }
        this.stopVoiceNoteTimer();
        if (this.conversationService) {
            this.conversationService.cancel();
        }
        if (this.collection) {
            this.collection.destroy();
            this.collection = null;
        }
        this.inherited(arguments);
    },

    /**
     * An inline image finished loading. The row was measured at text height before the image had a
     * real size, so re-measure. Debounced so a burst of images causes one relayout, and only snaps
     * to the bottom when already near it, so re-measuring never yanks someone reading history.
     */
    noteInlineImageLoaded: function () {
        var self = this;
        if (this._imgRelayoutTimer) {
            clearTimeout(this._imgRelayoutTimer);
        }
        this._imgRelayoutTimer = setTimeout(function () {
            self._imgRelayoutTimer = null;
            if (!self.$ || !self.$.list) { return; }
            self.$.list.refresh();
        }, 120);
    },

    // --- thread lifecycle ----------------------------------------------------------------

    setChatThread: function (thread) {
        var old = this.chatThread;
        this.chatThread = thread;
        this.chatThreadChanged(old);
    },

    chatThreadChanged: function (inOldChatThread) {
        if (!inOldChatThread && this.chatThread && this.chatThread._id) {
            this.setupNewChatThread();
        } else if (inOldChatThread && inOldChatThread._id && !this.chatThread) {
            this.closeConversation(inOldChatThread._id);
        } else if (inOldChatThread && inOldChatThread._id && this.chatThread &&
                inOldChatThread._id !== this.chatThread._id) {
            this.closeConversation(inOldChatThread._id);
            this.setupNewChatThread();
        }

        if (!this.chatThread || !this.chatThread._id) {
            return;
        }

        var flags = this.chatThread.flags || {};
        this.lockConversationList(flags.locked);

        if (flags.locked) {
            this.$.transportButton.setContent($L("Lock"));
            this.runQuery();
            return;
        }

        if (this.chatThread.personId && this.chatThread.personId !== "null" && this.chatThread.person) {
            this.chatThread.personImage =
                messagingUtils.person.getDisplayImage(this.chatThread.person);
            transportPicker.setTransportsByPerson(this.chatThread.person, this.chatThread);
        } else {
            transportPicker.setTransportsByChatThread(this.chatThread);
        }
        this.updateTransportButton();
        this.updateCallButtons();
        this.runQuery();
    },

    setupNewChatThread: function () {
        this.forceSendIfOffline = false;

        // Clear the thread's unread count now that it is on screen.
        this.doClearUnreadCount({ threadId: this.chatThread._id });

        this.$.richText.set('value', "");
        this.getDraftMessage(this.chatThread._id);

        this.setHeaderName(this.chatThread.displayName);
        this.$.status.setClasses("status status-no-presence");
        this.chatThread.personImage = messagingUtils.person.getDisplayImage(null);
    },

    closeConversation: function (chatThreadId, skipSaveDraft) {
        this.conversationService.cancel();

        if (!chatThreadId) {
            return;
        }
        if (!skipSaveDraft) {
            this.saveMessageToDraft(this.$.richText.get('value'), chatThreadId);
        }
        this.$.richText.set('value', "");

        // Clear the unread count only when the app is foregrounded: if it is carded, an unread
        // thread should keep its badge.
        if (appState.getAppDeactivated() === false) {
            this.doClearUnreadCount({ threadId: chatThreadId });
        }
        this.cancelReply();
        this.clearAttachment();
    },

    lockConversationList: function (locked) {
        this.$.richText.setDisabled(!!locked);
        this.$.sendButton.setShowing(!locked);
        this.$.attachButton.setShowing(!locked);
        this.$.micButton.setShowing(!locked);
    },

    threadLocked: function (inThread) {
        this.chatThread = inThread;
        this.lockConversationList(inThread.flags && inThread.flags.locked);
    },

    setDeletedChatThread: function (inThread) {
        if (this.chatThread && inThread && this.chatThread._id === inThread._id) {
            this.chatThread = null;
            this.collection.empty([]);
            this.doCloseConversationList();
        }
    },

    setHeaderName: function (inName) {
        this.$.header.setContent(messagingUtils.message.emojifyEscaped(inName || ""));
    },

    // --- messages ------------------------------------------------------------------------

    runQuery: function () {
        if (!this.chatThread || !this.chatThread._id) {
            return;
        }
        this.conversationService.call({
            query: {
                where: [
                    { prop: "conversations", op: "=", val: this.chatThread._id },
                    { prop: "flags.visible", op: "=", val: true },
                    { prop: "localTimestamp", op: ">", val: 0 }
                ],
                orderBy: "localTimestamp"
            }
        });
    },

    messagesWatch: function () {
        this.conversationService.cancel();
        this.runQuery();
        return true;
    },

    gotMessages: function (inSender, inEvent) {
        var results = (inEvent && inEvent.results) || [];

        // Carry any optimistic poll vote across the re-query, so a vote that has not yet round-
        // tripped through the db is not silently reverted by an unrelated watch fire.
        if (this._pendingPollVotes) {
            for (var i = 0; i < results.length; i++) {
                var pending = results[i]._id && this._pendingPollVotes[results[i]._id];
                if (pending) {
                    results[i].myPollVote = pending;
                }
            }
        }

        // Every bubble uses the thread's avatar; group chats show it per message via from.name.
        if (this.chatThread && this.chatThread.personImage) {
            for (var j = 0; j < results.length; j++) {
                results[j].personImage = this.chatThread.personImage;
            }
        }

        this.messages = results;
        this.collection.empty(results);
        this.updateListButtons(this.chatThread);
        this.$.listButtons.setShowing(
            results.length > 0 && !!(this.chatThread && !(this.chatThread.flags || {}).locked));
        return true;
    },

    revealListBottom: function () {
        this.$.list.scrollToBottom && this.$.list.scrollToBottom();
        return true;
    },

    updateListButtons: function (thread) {
        this.$.blockButton.setShowing(!this.shouldHideBlockButton(thread));
    },

    /**
     * Blocking only makes sense for an IM sender who is not already a buddy, and never for a group
     * chat or when the user has no IM account at all.
     */
    shouldHideBlockButton: function (thread) {
        var list = transportPicker.getTransports();
        var haveIMAccount = false;
        for (var i = 0; i < list.length; i++) {
            if (list[i].account && list[i].account.capabilitySubtype === "IM") {
                haveIMAccount = true;
            }
        }
        return !!(thread && ((thread.personId && this.isIMBuddy) || thread.groupChatId || !haveIMAccount));
    },

    // --- rendering -----------------------------------------------------------------------

    /**
     * The divider carries who the message was with and when, and repeats whenever any of those
     * change — so a conversation that switches transport mid-thread shows where it switched.
     */
    getDividerCaption: function (message) {
        var username = "";
        if (message.folder === FOLDERS.INBOX && message.from) {
            username = message.from.addr;
        } else if (message.folder === FOLDERS.OUTBOX && message.to && message.to[0]) {
            username = message.to[0].addr;
        }
        if (messagingUtils.utils.isTextMessage(message.serviceName)) {
            username = messagingUtils.utils.formatAddress(username, message.serviceName);
        }

        var when = message.localTimestamp ? moment(message.localTimestamp).format("lll") : "";
        return (username ? username + ", " : "") + when;
    },

    // --- header interaction --------------------------------------------------------------

    handleHeaderTap: function () {
        // Open the linked contact where there is one; otherwise there is nothing to show.
        if (this.chatThread && this.chatThread.personId) {
            this.$.launchApp.send({
                id: "com.palm.app.contacts",
                params: { personId: this.chatThread.personId }
            });
        }
        return true;
    },

    updateTransportButton: function () {
        var selected = transportPicker.getSelectedTransport();
        this.$.transportButton.setContent(
            selected ? transportPicker.labelFor(selected) : $L("."));
        this.$.transportButton.setShowing(transportPicker.getTransports().length > 0);
    },

    openTransportMenu: function (inSender, inEvent) {
        var list = transportPicker.getTransports();
        if (list.length < 2) {
            return true;   // nothing to choose between
        }
        this.$.transportMenu.destroyClientControls();
        for (var i = 0; i < list.length; i++) {
            this.$.transportMenu.createComponent({
                kind: MenuItem,
                content: transportPicker.labelFor(list[i]),
                transportIndex: i
            }, { owner: this });
        }
        this.$.transportMenu.render();
        this.$.transportMenu.showAtEvent(inEvent);
        return true;
    },

    transportChosen: function (inSender, inEvent) {
        var selected = inEvent && inEvent.originator;
        if (!selected || selected.transportIndex === undefined) {
            return true;
        }
        var transport = transportPicker.getTransports()[selected.transportIndex];
        transportPicker.setSelectedTransport(transport);
        this.updateTransportButton();
        this.updateCallButtons();

        // Persist the choice so the thread reopens on the same address.
        if (this.chatThread && this.chatThread._id && transport) {
            this.mergeThread({
                _id: this.chatThread._id,
                replyAddress: transport.replyAddress,
                replyService: transport.serviceName,
                normalizedAddress: messagingUtils.utils.normalizeAddress(
                    transport.replyAddress, transport.serviceName)
            });
        }
        return true;
    },

    updateCallButtons: function () {
        var selected = transportPicker.getSelectedTransport();
        var serviceName = selected && selected.serviceName;
        var accountService = appState.accountService;

        this.$.phoneCallButton.setShowing(!!(accountService && serviceName &&
            accountService.hasVoiceCapability(serviceName)));
        this.$.videoCallButton.setShowing(!!(accountService && serviceName &&
            accountService.hasVideoCapability(serviceName)));
    },

    currentCallTarget: function () {
        var selected = transportPicker.getSelectedTransport();
        return selected ? selected.replyAddress : (this.chatThread && this.chatThread.replyAddress);
    },

    voicecall: function () {
        var target = this.currentCallTarget();
        if (target) {
            this.$.openApp.send({ target: "tel:" + target });
        }
        return true;
    },

    videocall: function () {
        var target = this.currentCallTarget();
        var selected = transportPicker.getSelectedTransport();
        if (target) {
            this.$.launchApp.send({
                id: "com.palm.app.phone",
                params: {
                    videoCall: true, number: target,
                    serviceName: selected && selected.serviceName
                }
            });
        }
        return true;
    },

    // --- sending -------------------------------------------------------------------------

    checkKey: function (inSender, inEvent) {
        // Enter sends; Shift+Enter inserts a newline.
        if (inEvent.keyCode === 13 && !inEvent.shiftKey) {
            inEvent.preventDefault();
            var messageText = this.$.richText.get('value');
            if (messageText || (this.outboundAttachment && this.outboundAttachment.path)) {
                this.sendMessage();
            }
            return true;
        }
    },

    sendButtonTapped: function () {
        var messageText = this.$.richText.get('value');
        if (messageText || (this.outboundAttachment && this.outboundAttachment.path)) {
            this.sendMessage();
        }
        return true;
    },

    sendMessage: function () {
        if (!this.chatThread || !this.chatThread._id) {
            return;
        }
        // Safety net in case the app is killed before the thread is re-read.
        this.doClearUnreadCount({ threadId: this.chatThread._id });

        var selectedTransport = transportPicker.getSelectedTransport();
        if (!selectedTransport) {
            this.showError($L("Unable to send"), $L("No account can send to this recipient."));
            return;
        }

        var recipient = {
            name: selectedTransport.displayName,
            addr: selectedTransport.replyAddress
        };

        // If a contact holds a partial number but the thread carries the full one, prefer the
        // thread's address — otherwise sending on a different transport in the same chat loses the
        // number that was working.
        if (messagingUtils.utils.isTextMessage(selectedTransport.serviceName) &&
                messagingUtils.utils.isTextMessage(this.chatThread.replyService) &&
                this.chatThread.replyAddress) {
            var chatNum = messagingUtils.utils.cleanPhoneNumber(this.chatThread.replyAddress, "phone");
            var transportNum = messagingUtils.utils.cleanPhoneNumber(recipient.addr, "phone");
            if (transportNum.length >= 7 && chatNum.length > transportNum.length &&
                    chatNum.slice(-transportNum.length) === transportNum) {
                recipient.addr = this.chatThread.replyAddress;
            }
        }

        var params = {
            folder: FOLDERS.OUTBOX,
            status: "pending",
            conversations: [this.chatThread._id],
            flags: { read: true, visible: true, deliveryReport: false },
            to: [recipient],
            messageText: this.$.richText.get('value'),
            serviceName: selectedTransport.serviceName
        };

        // Native reply: stamp the quote metadata from the message being replied to. quotedMessageId
        // is the original's serviceMessageId, which the transport hands to the network so OTHER
        // clients thread the reply too; the fields also render the local echo's quote card.
        if (this.replyToMessage) {
            var qsrc = messagingUtils.message.unescapeText(this.replyToMessage.messageText || "")
                .replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
            params.quotedText = qsrc;
            params.quotedFrom = (this.replyToMessage.from && this.replyToMessage.from.name) ?
                this.replyToMessage.from.name : "";
            params.quotedMessageId = this.replyToMessage.serviceMessageId || "";
        }

        // For IM accounts the account username is our own screen name, so it becomes the from
        // address. SMS goes through the profile account and has no such username.
        if (selectedTransport.account && selectedTransport.account.capabilitySubtype === "IM") {
            params.from = {
                name: selectedTransport.account.alias,
                addr: selectedTransport.account.username
            };
            params.username = selectedTransport.account.username;
        }

        var dbKind;
        if (!messagingUtils.utils.isTextMessage(params.serviceName) && selectedTransport.account) {
            dbKind = (selectedTransport.account.dbkinds || {}).immessage ||
                messagingUtils.message.dbKind;
        } else {
            dbKind = messagingUtils.message.SMS.dbKind;
            params.serviceName = "sms";
        }

        // Only IM transports can carry an attachment path; SMS/MMS ignores it, so never stamp it on
        // a text-message record.
        if (this.outboundAttachment && this.outboundAttachment.path &&
                !messagingUtils.utils.isTextMessage(params.serviceName)) {
            params.filePath = this.outboundAttachment.path;
        }

        // Update the thread record directly rather than waiting on the chatthreader, which is too
        // slow to keep the list in step with a just-sent message.
        var updated = messagingUtils.thread.updateFromNewMessage(
            { _id: this.chatThread._id, _kind: messagingUtils.thread.dbKind }, params, recipient);
        this.mergeThread(updated);

        this.sendMessageHelper(params, dbKind);
    },

    sendMessageHelper: function (params, dbKind) {
        params._kind = dbKind;
        params.localTimestamp = Date.now();

        if (mockDb.enabled) {
            mockDb.merge([params]);
            this.runQuery();
        } else {
            this.$.messagePut.send({ objects: [params] });
        }

        this.$.richText.set('value', "");
        this.cancelReply();
        if (this.outboundAttachment) {
            this.clearAttachment();
        }
        this.playSoundNotification({ isSent: true });
    },

    mergeThread: function (thread) {
        if (mockDb.enabled) {
            thread._kind = thread._kind || messagingUtils.thread.dbKind;
            mockDb.merge([thread]);
            return;
        }
        this.$.threadMerge.send({ objects: [thread] });
    },

    playSoundNotification: function (inParams) {
        var prefs = appState.prefsHandler && appState.prefsHandler.getPrefs();
        if (!prefs || !prefs.enableNotification) {
            return;
        }
        if (prefs.notificationSound !== "system" && prefs.notificationSound !== "ringtone") {
            return;
        }
        if (!window.PalmSystem) {
            return;
        }
        var soundPath = inParams.isSent ?
            messagingUtils.message.SOUND_PATHS.SENT : messagingUtils.message.SOUND_PATHS.RECEIVED;
        window.PalmSystem.playSoundNotification(
            messagingUtils.message.SOUND_CLASSES.RINGTON, soundPath);
    },

    // --- drafts --------------------------------------------------------------------------

    getDraftMessage: function (chatThreadId) {
        var query = {
            from: messagingUtils.message.dbKind,
            where: [
                { prop: "conversations", op: "=", val: chatThreadId },
                { prop: "folder", op: "=", val: FOLDERS.DRAFTS }
            ]
        };
        if (mockDb.enabled) {
            this.gotDraftMessages(null, mockDb.find(query));
            return;
        }
        this.$.draftFind.send({ query: query });
    },

    gotDraftMessages: function (inSender, inResponse) {
        var results = (inResponse && inResponse.results) || [];
        if (results.length > 0 && results[0].messageText) {
            this.$.richText.set('value', results[0].messageText);
        }
        // The draft has been restored into the composer, so drop the stored copies.
        var ids = [];
        for (var i = 0; i < results.length; i++) {
            ids.push(results[i]._id);
        }
        if (ids.length > 0) {
            this.deleteRecords(ids);
        }
        return true;
    },

    saveMessageToDraft: function (message, chatThreadId) {
        if (!message || !chatThreadId) {
            return;
        }
        var draft = {
            _kind: messagingUtils.message.dbKind,
            folder: FOLDERS.DRAFTS,
            conversations: [chatThreadId],
            messageText: message,
            localTimestamp: Date.now(),
            flags: { visible: false, read: true }
        };
        if (mockDb.enabled) {
            mockDb.merge([draft]);
            return;
        }
        this.$.messageDraftPut.send({ objects: [draft] });
    },

    deleteRecords: function (ids) {
        if (mockDb.enabled) {
            mockDb.del(ids);
            return;
        }
        this.$.dbDelete.send({ ids: ids });
    },

    // --- message interaction ---------------------------------------------------------------

    messageFor: function (inEvent) {
        var model = (inEvent && inEvent.model) ||
            (inEvent && inEvent.index !== undefined && this.collection.at(inEvent.index));
        return model && model.attributes;
    },

    handleMessageTap: function (inSender, inEvent) {
        var message = this.messageFor(inEvent);
        if (!message) {
            return true;
        }
        this.selectedMessage = message;

        // A tap on a poll option votes; a tap on one of my reaction badges removes it.
        var node = inEvent && (inEvent.target || (inEvent.domEvent && inEvent.domEvent.target));
        var option = this.pollOptionAt(node);
        if (option) {
            this.togglePollOption(message, option.name, option.max, option.node);
            return true;
        }
        var reaction = this.reactionBadgeAt(node);
        if (reaction) {
            this.toggleMyReaction(message, reaction);
            return true;
        }

        this.openReactRow(inEvent);
        return true;
    },

    swipeDelete: function (inSender, inEvent) {
        var message = this.messageFor(inEvent);
        if (message && message._id) {
            this.deleteRecords([message._id]);
            if (mockDb.enabled) {
                this.runQuery();
            }
        }
        return true;
    },

    senderRowSelected: function (inSender, inEvent) {
        var message = inEvent && inEvent.message;
        if (!message || !message.from || !message.from.addr) {
            return true;
        }
        this.doSelectSender({
            person: {
                username: message.from.addr,
                serviceName: message.serviceName,
                displayName: message.from.name || message.from.addr
            }
        });
        return true;
    },

    respondToInvite: function (inSender, inEvent) {
        var message = inEvent && inEvent.message;
        if (!message) {
            return true;
        }
        this.mergeRecord({
            _id: message._id,
            _kind: message._kind,
            accepted: inEvent.accepted ? "accepted" : "declined"
        });
        return true;
    },

    mergeRecord: function (record) {
        if (mockDb.enabled) {
            mockDb.merge([record]);
            this.runQuery();
            return;
        }
        this.$.dbMerge.send({ objects: [record] });
    },

    /** Open an attachment, location or event in whichever app handles it. */
    openAttachment: function (inSender, inEvent) {
        var target = inEvent && inEvent.target;
        var attachmentKind = inEvent && inEvent.kind;
        if (!target) {
            return true;
        }

        if (attachmentKind === "location") {
            var parts = String(target).split(",");
            this.$.launchApp.send({
                id: "com.palm.app.maps",
                params: { latitude: parts[0], longitude: parts[1] }
            });
            return true;
        }

        if (attachmentKind === "event") {
            var payload;
            try {
                var b64 = target.replace(/-/g, "+").replace(/_/g, "/");
                while (b64.length % 4) { b64 += "="; }
                payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
            } catch (e) {
                this.warn("could not decode event token");
                return true;
            }
            this.$.launchApp.send({ id: "com.palm.app.calendar", params: payload });
            return true;
        }

        if (attachmentKind === "contact") {
            this.$.launchApp.send({
                id: "com.palm.app.contacts", params: { vcard: target, launchType: "importVCard" }
            });
            return true;
        }

        if (attachmentKind === "image") {
            this.$.launchApp.send({ id: "com.palm.app.photos", params: { target: target } });
            return true;
        }

        // Anything else goes through the system resource handler, which picks the right viewer.
        this.$.openApp.send({ target: target });
        return true;
    },

    // --- polls -----------------------------------------------------------------------------

    /** Find the poll option label a tap landed inside, if any. */
    pollOptionAt: function (node) {
        var root = this.hasNode();
        while (node && node !== root) {
            if (node.getAttribute && node.getAttribute("data-poll-option") !== null &&
                    node.getAttribute("data-poll-option") !== undefined) {
                var name = node.getAttribute("data-poll-option");
                if (name !== null) {
                    return {
                        name: name,
                        max: parseInt(node.getAttribute("data-poll-max"), 10) || 0,
                        node: node
                    };
                }
            }
            node = node.parentNode;
        }
        return null;
    },

    /**
     * Record a vote optimistically on the row and send the command. The optimistic value is also
     * kept in _pendingPollVotes so a re-query triggered by an unrelated watch fire, arriving before
     * the merge lands, does not revert the tick.
     */
    togglePollOption: function (message, option, max, optionNode) {
        var current = (message.myPollVote || []).slice();
        var idx = current.indexOf(option);

        if (max === 1) {
            current = (idx >= 0) ? [] : [option];
        } else if (idx >= 0) {
            current.splice(idx, 1);
        } else if (max === 0 || current.length < max) {
            current.push(option);
        } else {
            return;   // already at the allowed maximum
        }

        message.myPollVote = current;
        if (!this._pendingPollVotes) {
            this._pendingPollVotes = {};
        }
        this._pendingPollVotes[message._id] = current;

        this.mergeRecord({ _id: message._id, _kind: message._kind, myPollVote: current });
        this.sendPollVoteCommand(message, current);
        this.$.list.refresh();
    },

    sendPollVoteCommand: function (message, selected) {
        var accountService = appState.accountService;
        if (!accountService || mockDb.enabled) {
            return;
        }
        this.$.reactionCommand.send({
            objects: [{
                _kind: accountService.getImCommandKind(message.serviceName),
                command: "sendPollVote",
                handler: "transport",
                serviceName: message.serviceName,
                messageId: message.serviceMessageId,
                options: selected
            }]
        });
    },

    // --- reactions ---------------------------------------------------------------------------

    buildReactionRow: function () {
        for (var i = 0; i < QUICK_REACTIONS.length; i++) {
            this.$.reactRowBox.createComponent({
                classes: "reaction-pick", allowHtml: true,
                content: messagingUtils.message.emojify(QUICK_REACTIONS[i]),
                reactionValue: QUICK_REACTIONS[i],
                ontap: "reactPicked"
            }, { owner: this });
        }
        this.$.reactRowBox.createComponent({
            classes: "reaction-pick reaction-more", allowHtml: true, content: "&#8226;&#8226;&#8226;",
            ontap: "reactMore"
        }, { owner: this });
    },

    /** Find a reaction badge a tap landed on, returning the exact stored emoji. */
    reactionBadgeAt: function (node) {
        var root = this.hasNode();
        while (node && node !== root) {
            if (node.getAttribute) {
                var value = node.getAttribute("data-reaction");
                if (value) {
                    return value;
                }
            }
            node = node.parentNode;
        }
        return null;
    },

    handleReactSwipe: function (inSender, inEvent) {
        var message = this.messageFor(inEvent);
        if (message) {
            this.selectedMessage = message;
            this.openReactRow(inEvent);
        }
        return true;
    },

    openReactRow: function (inEvent) {
        this.$.reactRow.showAtEvent(inEvent);
    },

    reactPicked: function (inSender) {
        this.$.reactRow.hide();
        if (this.selectedMessage && inSender.reactionValue) {
            this.toggleMyReaction(this.selectedMessage, inSender.reactionValue);
        }
        return true;
    },

    reactMore: function (inSender, inEvent) {
        this.$.reactRow.hide();
        this.$.messageMenu.showAtEvent(inEvent);
        return true;
    },

    /** Add or remove my reaction optimistically, then tell the transport. */
    toggleMyReaction: function (message, emoji) {
        var reactions = (message.reactions || []).slice();
        var removed = false;

        for (var i = reactions.length - 1; i >= 0; i--) {
            if (reactions[i].emoji === emoji && (reactions[i].sender === "me" || reactions[i].mine)) {
                reactions.splice(i, 1);
                removed = true;
                break;
            }
        }
        if (!removed) {
            reactions.push({ emoji: emoji, sender: "me", count: 1 });
        }

        message.reactions = reactions;
        this.mergeRecord({ _id: message._id, _kind: message._kind, reactions: reactions });
        this.sendReactionCommand(message, emoji, removed);
        this.$.list.refresh();
    },

    sendReactionCommand: function (message, emoji, remove) {
        var accountService = appState.accountService;
        if (!accountService || mockDb.enabled) {
            return;
        }
        this.$.reactionCommand.send({
            objects: [{
                _kind: accountService.getImCommandKind(message.serviceName),
                command: "sendReaction",
                handler: "transport",
                serviceName: message.serviceName,
                messageId: message.serviceMessageId,
                emoji: this.mapReactionForNetwork(emoji, message.serviceName),
                remove: !!remove
            }]
        });
    },

    /**
     * Some networks only accept a fixed reaction set, so the account template can declare a mapping
     * from the emoji we show to the one the network takes.
     */
    mapReactionForNetwork: function (emoji, serviceName) {
        var accountService = appState.accountService;
        var policy = accountService && accountService.getReactions(serviceName);
        if (policy && policy.map && policy.map[emoji]) {
            return policy.map[emoji];
        }
        return emoji;
    },

    // --- message menu --------------------------------------------------------------------

    menuReply: function () {
        if (this.selectedMessage) {
            this.enterReply(this.selectedMessage);
        }
        return true;
    },

    menuCopy: function () {
        if (this.selectedMessage) {
            var text = messagingUtils.message.removeHtml(this.selectedMessage.messageText || "");
            this.$.richText.set('value', (this.$.richText.get('value') || "") + text);
        }
        return true;
    },

    menuDelete: function () {
        if (this.selectedMessage && this.selectedMessage._id) {
            this.deleteRecords([this.selectedMessage._id]);
            if (mockDb.enabled) {
                this.runQuery();
            }
        }
        return true;
    },

    enterReply: function (message) {
        this.replyToMessage = message;
        var from = (message.from && message.from.name) ? message.from.name : $L("You");
        var text = messagingUtils.message.removeHtml(message.messageText || "")
            .replace(/[\r\n]+/g, " ");
        this.$.replyBarText.setContent(
            "<b>" + messagingUtils.message.emojifyEscaped(from) + "</b><br>" +
            messagingUtils.message.emojifyEscaped(text));
        this.$.replyBar.setShowing(true);
    },

    cancelReply: function () {
        this.replyToMessage = null;
        this.$.replyBar.setShowing(false);
        return true;
    },

    // --- attachments -----------------------------------------------------------------------

    openAttachmentPicker: function () {
        // The system file picker is a device service; off-device there is nothing to pick.
        if (mockDb.enabled) {
            this.showError($L("Attachments"), $L("File picking is only available on device."));
            return true;
        }
        this.$.openApp.send({
            target: "palm://com.palm.filepicker",
            params: { fileType: ["image", "video", "document"] }
        });
        return true;
    },

    attachmentChosen: function (inSender, inEvent) {
        var file = inEvent && inEvent.files && inEvent.files[0];
        if (!file) {
            return true;
        }
        this.outboundAttachment = { path: file.fullPath, name: file.name };
        this.$.attachmentChipLabel.setContent(file.name);
        this.$.attachmentChip.setShowing(true);
        return true;
    },

    clearAttachment: function () {
        this.outboundAttachment = null;
        this.$.attachmentChip.setShowing(false);
        this.$.attachmentChipThumb.setShowing(false);
        return true;
    },

    // --- voice notes -----------------------------------------------------------------------

    micButtonTapped: function () {
        if (mockDb.enabled) {
            this.showError($L("Voice message"), $L("Recording is only available on device."));
            return true;
        }
        if (this.recording) {
            this.stopVoiceNote();
        } else {
            this.startVoiceNote();
        }
        return true;
    },

    startVoiceNote: function () {
        this.recording = true;
        this.$.micButton.setSrc("assets/menu-icon-mic-rec.png");
        this.$.micButton.addClass("recording");
        this.$.vnTimer.setShowing(true);
        this.startVoiceNoteTimer();
    },

    stopVoiceNote: function () {
        this.recording = false;
        this.$.micButton.setSrc("assets/menu-icon-mic.png");
        this.$.micButton.removeClass("recording");
        this.$.vnTimer.setShowing(false);
        this.stopVoiceNoteTimer();
    },

    startVoiceNoteTimer: function () {
        var self = this, elapsed = 0;
        this.$.vnTimer.setContent(messagingUtils.message.audioFmt(0));
        this._vnTimer = setInterval(function () {
            elapsed += 1;
            self.$.vnTimer.setContent(messagingUtils.message.audioFmt(elapsed));
        }, 1000);
    },

    stopVoiceNoteTimer: function () {
        if (this._vnTimer) {
            clearInterval(this._vnTimer);
            this._vnTimer = null;
        }
    },

    // --- dialogs ---------------------------------------------------------------------------

    showError: function (title, message, showRetry) {
        this.$.errorDialogTitle.setContent(title);
        this.$.errorDialogMessage.setContent(message);
        this.$.errorRetryButton.setShowing(!!showRetry);
        this.$.errorDialog.show();
    },

    showErrorDialog: function (inSender, inEvent) {
        var message = inEvent && inEvent.message;
        if (!message) {
            return true;
        }
        this.errorMessage = message;
        this.showError(
            $L("Message not sent"),
            messagingUtils.message.getMessageErrorFromCode(message.errorCategory, message),
            true);
        return true;
    },

    closeErrorDialog: function () {
        this.$.errorDialog.hide();
        return true;
    },

    retryMessage: function () {
        this.$.errorDialog.hide();
        if (this.errorMessage && this.errorMessage._id) {
            this.mergeRecord({
                _id: this.errorMessage._id, _kind: this.errorMessage._kind,
                status: "pending", errorCategory: null
            });
        }
        return true;
    },

    promptDelete: function () {
        this.confirmAction = "delete";
        this.$.confirmDialogTitle.setContent($L("Delete Conversation"));
        this.$.confirmDialogMessage.setContent(
            $L("Are you sure you want to delete this conversation?"));
        this.$.confirmAcceptButton.setContent($L("Delete"));
        this.$.confirmDialog.show();
        return true;
    },

    promptBlock: function () {
        this.confirmAction = "block";
        this.$.confirmDialogTitle.setContent($L("Block Sender"));
        this.$.confirmDialogMessage.setContent(
            $L("Are you sure you want to block this sender?"));
        this.$.confirmAcceptButton.setContent($L("Block"));
        this.$.confirmDialog.show();
        return true;
    },

    closeConfirmDialog: function () {
        this.$.confirmDialog.hide();
        this.confirmAction = null;
        return true;
    },

    confirmAccepted: function () {
        this.$.confirmDialog.hide();
        if (this.confirmAction === "delete") {
            this.deleteConversation();
        } else if (this.confirmAction === "block") {
            this.blockSender();
        }
        this.confirmAction = null;
        return true;
    },

    deleteConversation: function () {
        if (!this.chatThread || !this.chatThread._id) {
            return;
        }
        var threadId = this.chatThread._id;
        if (mockDb.enabled) {
            mockDb.del([threadId]);
        } else {
            this.$.deleteThreadService.send({ threadId: threadId });
        }
        this.closeConversation(threadId, true);
        this.chatThread = null;
        this.collection.empty([]);
        this.doCloseConversationList();
    },

    blockSender: function () {
        var selected = transportPicker.getSelectedTransport();
        var accountService = appState.accountService;
        if (!selected || !accountService || mockDb.enabled) {
            return;
        }
        this.$.reactionCommand.send({
            objects: [{
                _kind: accountService.getImCommandKind(selected.serviceName),
                command: "blockBuddy",
                handler: "transport",
                serviceName: selected.serviceName,
                targetUsername: selected.replyAddress,
                fromUsername: selected.account && selected.account.username
            }]
        });
    },

    serviceErr: function (inSender, inError) {
        this.error("conversation service failed:", inError && (inError.errorText || inError));
        return true;
    },

    // --- shell plumbing ---------------------------------------------------------------------

    setLoginStates: function (states) {
        this.set('loginStates', states);
    },

    resize: function () {
        this.inherited(arguments);
    },

    windowHiddenHandler: function () {
        if (this.chatThread && this.chatThread._id) {
            this.saveMessageToDraft(this.$.richText.get('value'), this.chatThread._id);
        }
    }
});
