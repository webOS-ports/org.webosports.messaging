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
    Spinner = require('onyx/Spinner'),
    PrependingRepeater = require('./widgets/PrependingRepeater'),
    Scroller = require('enyo/Scroller'),
    TouchScrollStrategy = require('enyo/TouchScrollStrategy'),
    Collection = require('enyo/Collection'),
    RecordModel = require('../data/RecordModel'),
    syncCollection = require('../util/syncCollection'),
    isNearBottom = require('../util/isNearBottom'),
    prependedCount = require('../util/prependedCount'),
    senderImages = require('../util/senderImages'),
    sendAccount = require('../util/sendAccount'),
    showInFiles = require('../util/showInFiles').showInFiles,
    Toolbar = require('onyx/Toolbar'),
    Button = require('onyx/Button'),
    IconButton = require('onyx/IconButton'),
    Popup = require('onyx/Popup'),
    Menu = require('onyx/Menu'),
    MenuItem = require('onyx/MenuItem'),
    TextArea = require('onyx/TextArea'),
    InputDecorator = require('onyx/InputDecorator'),
    Image = require('enyo/Image'),
    LunaService = require('enyo-webos/LunaService'),
    ServiceRequest = require('enyo-webos/ServiceRequest'),
    FilePicker = require('webos-lib/FilePicker'),
    VoiceRecorder = require('../util/voiceRecorder'),
    ConversationRow = require('./ConversationRow'),
    ConversationService = require('../data/ConversationService'),
    transportPicker = require('../util/transportPicker'),
    composerEcho = require('../util/composerEcho'),
    callRequest = require('../util/callRequest'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('../data/mockDb'),
    moment = require('moment'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';
var FOLDERS = messagingUtils.message.FOLDERS;

/**
 * A chat opens on its newest FIRST_PAGE messages, which draw in a fraction of a second, and then
 * backfills older ones BACKFILL_STEP at a time, BACKFILL_GAP_MS apart so the list stays usable in
 * between, up to MAX_MESSAGES. Drawing all 200 at once took about two seconds on a phone.
 */
var FIRST_PAGE = 20, BACKFILL_STEP = 30, MAX_MESSAGES = 200, BACKFILL_GAP_MS = 120;
// Senders asked about per person query; well under what one db8 find hands back.
var SENDER_BATCH = 50;
// How long a send waits for a re-read account list before it reports the account missing.
var ACCOUNT_RELOAD_MS = 5000;

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
                    name: "videoCallButton", kind: IconButton, src: "assets/video-call-icon.svg",
                    showing: false, ontap: "videocall", classes: "conversation-call-btn"
                },
                {
                    name: "phoneCallButton", kind: IconButton, src: "assets/phone-icon.svg",
                    showing: false, ontap: "voicecall", classes: "conversation-call-btn"
                },
                {
                    // The service a reply goes out on: its icon and name, not the address. A
                    // dropdown drawn like the availability one, not a button.
                    name: "transportButton", classes: "conversation-header-type",
                    ontap: "openTransportMenu", components: [
                        {
                            name: "transportIcon", kind: Image, classes: "conversation-header-type-icon",
                            showing: false, onerror: "transportIconFailed"
                        },
                        { name: "transportLabel", classes: "conversation-header-type-label" },
                        { name: "transportArrow", classes: "availability-arrow", showing: false }
                    ]
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
            // A Scroller around a DataRepeater rather than a DataList, for the reason given in
            // ThreadList. Message rows vary a lot in height - images, players, poll blocks - so
            // they were the worst case for a list that sizes pages from measured heights.
            name: "scroller", kind: Scroller, fit: true, horizontal: "hidden", touch: true,
            // Enyo's default on webOS (TranslateScrollStrategy) moves the list with a transform
            // while a finger is on it and swaps that for scrollTop when it stops. With a long
            // chat full of images that swap repaints everything at once and the list flashes at
            // the end of every flick. TouchScrollStrategy moves scrollTop throughout: no swap.
            strategyKind: TouchScrollStrategy,
            // Handlers sit on the scroller; row events arrive decorated with model and index.
            ontap: "handleMessageTap", onConfirm: "swipeDelete", onReact: "handleReactSwipe",
            onScrollStart: "dismissPopups", onScrollStop: "noteScrollPosition",
            onError: "showErrorDialog", onSelectSender: "senderRowSelected",
            onOpenAttachment: "openAttachment", onInviteResponse: "respondToInvite",
            components: [
                // Shown while a chat's messages load, in the empty list where they will appear.
                { name: "loadingSpinner", kind: Spinner, classes: "conversation-loading", showing: false },
                {
                    name: "list", kind: PrependingRepeater, classes: "conversation-messages",
                    components: [ { kind: ConversationRow } ]
                }
            ]
        },
        { classes: "footer-shadow" },

        // --- staged attachment ----------------------------------------------------------
        {
            name: "attachmentChip", showing: false, classes: "attachment-chip", components: [
                { name: "attachmentChipThumb", kind: Image, classes: "attachment-chip-thumb", showing: false },
                { name: "attachmentChipLabel", classes: "attachment-chip-label" },
                {
                    name: "attachmentChipRemove", kind: IconButton, src: "assets/icon-decline.svg",
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
                    name: "replyBarClose", kind: IconButton, src: "assets/icon-decline.svg",
                    classes: "reply-bar-close", ontap: "cancelReply"
                }
            ]
        },

        // --- composer -------------------------------------------------------------------
        {
            name: "footer", kind: Toolbar, classes: "conversation-bottom flex-row", components: [
                {
                    name: "attachButton", kind: IconButton, src: "assets/menu-icon-attach.svg",
                    classes: "conversation-attach-btn", ontap: "openAttachmentPicker"
                },
                {
                    name: "micButton", kind: IconButton, src: "assets/menu-icon-mic.svg",
                    classes: "conversation-mic-btn", ontap: "micButtonTapped"
                },
                { name: "vnTimer", classes: "conversation-vn-timer", showing: false },
                {
                    // The field grows with its content up to a cap, so the textarea sizes itself
                    // rather than sitting in a scroller — a scroller inside the decorator has no
                    // height of its own and collapsed the field.
                    kind: InputDecorator, classes: "conversation-input flex-one", components: [
                        {
                            name: "richText", kind: TextArea, classes: "conversation-input-text",
                            attributes: { rows: 1 },
                            placeholder: $L("Enter message here..."),
                            onkeydown: "checkKey", oninput: "composerInput"
                        }
                    ]
                },
                {
                    name: "sendButton", kind: IconButton, src: "assets/menu-icon-send.svg",
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
            onError: 'serviceErr'
        },
        {
            name: 'messageDraftPut', kind: LunaService, service: DB_SERVICE, method: 'put',
            onError: 'serviceErr'
        },
        {
            name: 'draftFind', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotDraftMessages', onError: 'serviceErr'
        },
        {
            // Group/channel senders' own photos; see util/senderImages.
            name: 'senderFind', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotSenderPersons', onError: 'serviceErr'
        },
        {
            // The open thread's person, when it came without one; see lookUpThreadPerson.
            name: 'threadPersonFind', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotThreadPerson', onError: 'serviceErr'
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
            service: 'luna://com.palm.applicationManager', method: 'open', onError: 'serviceErr'
        },
        {
            // The system picker, shown in a popup over the app. There is no com.palm.filepicker app
            // to open on LuneOS.
            // border-box: at 100% wide the popup's own border pushed it past the right edge.
            name: "attachmentPicker", kind: FilePicker, fileType: ["image", "video", "audio", "document"],
            style: "width: 100%; height: 80%; box-sizing: border-box;", onPickFile: "attachmentChosen"
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.selectedMessage = null;
        this.replyToMessage = null;
        this.outboundAttachment = null;
        this.recording = false;
        this.messages = [];
        this._followToEnd = false;
        this._revealTimers = [];

        this.collection = new Collection({ model: RecordModel });
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
        this.cancelRevealTimers();
        this.cancelBackfill();
        this.cancelVoiceNote();
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
            var follow = isNearBottom(self.$.scroller.getScrollBounds());
            self.$.list.refresh();
            if (follow) {
                self.revealListBottomSoon();
            }
        }, 120);
    },

    // --- thread lifecycle ----------------------------------------------------------------

    setChatThread: function (thread) {
        var old = this.chatThread;
        this.chatThread = thread;
        this.chatThreadChanged(old);
    },

    chatThreadChanged: function (inOldChatThread) {
        this.dismissPopups();
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
            this.setTransportButton($L("Lock"), null);
            this.runQuery();
            return;
        }

        if (this.chatThread.personId && this.chatThread.personId !== "null" && this.chatThread.person) {
            this.chatThread.personImage =
                messagingUtils.person.getDisplayImage(this.chatThread.person);
        } else if (this.chatThread.personId && this.chatThread.personId !== "null") {
            this.lookUpThreadPerson(this.chatThread.personId);
        }
        this.buildTransports();
        this.updateTransportButton();
        this.updateCallButtons();
        this.runQuery();
    },

    /**
     * Only the conversations list hands over a thread with its person joined (ThreadService).
     * A thread opened from Buddies or Favorites, from a notification or launch by id, or from a
     * group sender is the bare db8 record, so fetch the person the way ThreadService does: without
     * it the chat shows the default avatar and offers only the thread's own transport, not the
     * person's other accounts and numbers.
     */
    lookUpThreadPerson: function (personId) {
        var query = {
            from: "com.palm.person:1",
            where: [{ prop: "_id", op: "=", val: personId }],
            select: messagingUtils.person.selectAttributes
        };
        if (mockDb.enabled) {
            // Answer after the messages are in, the way the bus reply arrives on a device.
            setTimeout(this.gotThreadPerson.bind(this, null, mockDb.find(query)), 0);
        } else {
            this.$.threadPersonFind.send({ query: query });
        }
    },

    gotThreadPerson: function (inSender, inResponse) {
        var person = inResponse && inResponse.results && inResponse.results[0];
        var thread = this.chatThread;
        // Another conversation may have been opened while the answer was on its way.
        if (!person || !thread || thread.personId !== person._id || thread.person) {
            return true;
        }
        thread.person = person;
        thread.personImage = messagingUtils.person.getDisplayImage(person);
        if ((thread.flags || {}).locked) {
            return true;
        }
        this.buildTransports();
        this.updateTransportButton();
        this.updateCallButtons();
        this.applyThreadImage();
        return true;
    },

    /** Give the bubbles already drawn the thread's avatar (group senders keep their own). */
    applyThreadImage: function () {
        if (!this.collection) {
            return;
        }
        var self = this;
        this.collection.forEach(function (model) {
            var record = model.attributes;
            var image = senderImages.imageFor(record, self._senderImages || {},
                self.chatThread.personImage, messagingUtils.person.DEFAULT_IMAGE);
            if (image && image !== record.personImage) {
                model.set('personImage', image);
            }
        });
    },

    buildTransports: function () {
        if (this.chatThread.personId && this.chatThread.personId !== "null" && this.chatThread.person) {
            transportPicker.setTransportsByPerson(this.chatThread.person, this.chatThread);
        } else {
            transportPicker.setTransportsByChatThread(this.chatThread);
        }
    },

    /**
     * An account was added or removed: offer what can be sent on now. The transport in use stays
     * selected while it is still there.
     */
    accountsChanged: function () {
        if (!this.chatThread || !this.chatThread._id || (this.chatThread.flags || {}).locked) {
            return;
        }
        var kept = transportPicker.getSelectedTransport();
        this.buildTransports();
        if (kept) {
            var list = transportPicker.getTransports();
            for (var i = 0; i < list.length; i++) {
                if (list[i].serviceName === kept.serviceName && list[i].replyAddress === kept.replyAddress) {
                    transportPicker.setSelectedTransport(list[i]);
                    break;
                }
            }
        }
        this.updateTransportButton();
        this.updateCallButtons();
    },

    setupNewChatThread: function () {
        this.clearMessages();
        this.$.loadingSpinner.show();
        this._limit = FIRST_PAGE;
        this.forceSendIfOffline = false;
        this._followToEnd = true;
        this._newestIncomingId = undefined;

        // Clear the thread's unread count now that it is on screen.
        this.doClearUnreadCount({ threadId: this.chatThread._id });

        this.$.richText.set('value', "");
        this.getDraftMessage(this.chatThread._id);

        this.setHeaderName(this.chatThread.displayName);
        this.$.status.setClasses("status status-no-presence");
        this.chatThread.personImage = messagingUtils.person.getDisplayImage(null);
        // Asked afresh per conversation, so a sender who became a friend since shows up.
        this._senderImages = {};
    },

    closeConversation: function (chatThreadId, skipSaveDraft) {
        this.conversationService.cancel();
        this.cancelVoiceNote();
        this.clearMessages();

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

    /**
     * Take the previous chat's messages off screen. The new chat's query can take a second or more
     * on a long history, and until it answers the list would otherwise go on showing the old one
     * under the new chat's name.
     */
    clearMessages: function () {
        this.messages = [];
        if (this.collection && this.collection.length) {
            this.collection.empty();
        }
        this.$.listButtons.setShowing(false);
        this.$.loadingSpinner.hide();
        this.cancelBackfill();
        this.relayout();
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
                // Newest first, so the limit keeps the latest messages: ascending, a long chat
                // showed its oldest 200 and never its newest. gotMessages turns them back round.
                // Every row is rendered, so the limit also bounds how many controls a chat makes
                // (Mojo paged 20 at a time through its flyweight list).
                orderBy: "localTimestamp",
                desc: true,
                limit: this._limit || FIRST_PAGE
            }
        });
    },

    messagesWatch: function () {
        this.conversationService.cancel();
        // A new message would otherwise push the oldest shown one out of the limit, and removing a
        // row at the top makes the list redraw every row.
        this._limit = Math.max(this._limit || FIRST_PAGE, this.collection.length + 1);
        this.runQuery();
        return true;
    },

    gotMessages: function (inSender, inEvent) {
        // The query asks newest first; the list reads oldest first.
        var results = ((inEvent && inEvent.results) || []).slice().reverse();
        this.$.loadingSpinner.hide();

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

        // A 1:1 bubble uses the thread's avatar; an incoming group or channel bubble its sender's.
        this.applySenderImages(results);
        this.lookUpSenders(results);

        // Measure before the merge: the new rows are what push the bottom out of reach.
        var follow = this._followToEnd || isNearBottom(this.$.scroller.getScrollBounds());
        this._followToEnd = false;

        this.messages = results;

        // Older messages backfilled in front: add them at the top, where PrependingRepeater draws
        // only them, and move the scroll position down by what was added, so the same messages
        // stay on screen - at the bottom or wherever someone scrolled up to read.
        var shownIds = this.collection.map(function (m) { return m.attributes._id; });
        var head = prependedCount(shownIds, results.map(function (r) { return r._id; }));
        if (head) {
            var before = this.$.scroller.getScrollBounds();
            this.collection.add(results.slice(0, head), { index: 0 });
            var after = this.$.scroller.getScrollBounds();
            this.$.scroller.setScrollTop(before.top + (after.height - before.height));
        }
        syncCollection(this.collection, results);
        this.followIncomingTransport(results);
        this.updateListButtons(this.chatThread);
        this.$.listButtons.setShowing(
            results.length > 0 && !!(this.chatThread && !(this.chatThread.flags || {}).locked));
        this.relayout();
        if (follow) {
            this.revealListBottomSoon();
        }
        this.scheduleBackfill(results.length);
        return true;
    },

    // --- sender avatars ---------------------------------------------------------------------

    applySenderImages: function (records) {
        var cache = this._senderImages || (this._senderImages = {});
        var threadImage = this.chatThread && this.chatThread.personImage;
        var fallback = messagingUtils.person.DEFAULT_IMAGE;
        for (var i = 0; i < records.length; i++) {
            var image = senderImages.imageFor(records[i], cache, threadImage, fallback);
            if (image) {
                records[i].personImage = image;
            }
        }
    },

    /** Find the people behind group/channel senders not looked up yet, by their IM address. */
    lookUpSenders: function (records) {
        var cache = this._senderImages || (this._senderImages = {});
        var wanted = senderImages.addressesToLookUp(records, cache);
        var addresses = [];
        Object.keys(wanted).forEach(function (service) {
            addresses = addresses.concat(wanted[service]);
        });
        if (!addresses.length) {
            return;
        }
        senderImages.markAsked(cache, wanted);
        for (var i = 0; i < addresses.length; i += SENDER_BATCH) {
            var query = {
                from: "com.palm.person:1",
                where: [{ prop: "ims.value", op: "=", val: addresses.slice(i, i + SENDER_BATCH) }],
                select: ["_id", "ims", "photos.squarePhotoPath"]
            };
            if (mockDb.enabled) {
                // Answer after the bubbles are in, the way the bus reply arrives on a device.
                setTimeout(this.gotSenderPersons.bind(this, null, mockDb.find(query)), 0);
            } else {
                this.$.senderFind.send({ query: query });
            }
        }
    },

    gotSenderPersons: function (inSender, inResponse) {
        var found = senderImages.remember(this._senderImages || {},
            (inResponse && inResponse.results) || []);
        if (!found || !this.collection) {
            return;
        }
        // Rows follow their model, so setting the image redraws only the bubbles that changed.
        var self = this;
        this.collection.forEach(function (model) {
            var record = model.attributes;
            var image = senderImages.imageFor(record, self._senderImages,
                self.chatThread && self.chatThread.personImage, messagingUtils.person.DEFAULT_IMAGE);
            if (image && image !== record.personImage) {
                model.set('personImage', image);
            }
        });
    },

    /**
     * A message that comes in while the chat is open moves the reply onto the transport it came
     * in on, so a Signal message is not answered on WhatsApp. Only a new one does: the first
     * results only note the newest, as the thread's own reply service already chose for them, and
     * a transport picked by hand stays picked until the next message arrives.
     */
    followIncomingTransport: function (results) {
        var newest = null;
        for (var i = results.length - 1; i >= 0; i--) {
            if (results[i].folder === FOLDERS.INBOX) {
                newest = results[i];
                break;
            }
        }
        var newestId = newest ? newest._id : null;
        var seenBefore = this._newestIncomingId;
        this._newestIncomingId = newestId;
        if (seenBefore === undefined || !newest || newestId === seenBefore ||
                (this.chatThread && (this.chatThread.flags || {}).locked)) {
            return;
        }
        if (transportPicker.followMessage(newest)) {
            this.updateTransportButton();
            this.updateCallButtons();
        }
    },

    /** Ask for the next older batch once this one is on screen, while there may be more. */
    scheduleBackfill: function (count) {
        this.cancelBackfill();
        var limit = this._limit || FIRST_PAGE;
        if (count < limit || limit >= MAX_MESSAGES) {
            return;   // the chat has no older messages, or we have shown as many as we keep
        }
        var self = this;
        this._backfillTimer = setTimeout(function step() {
            self._backfillTimer = null;
            if (!self.$ || !self.chatThread) { return; }
            // Not in the middle of a flick: adding rows then would fight the scroll.
            var strategy = self.$.scroller.getStrategy();
            if (strategy && strategy.isScrolling && strategy.isScrolling()) {
                self._backfillTimer = setTimeout(step, BACKFILL_GAP_MS);
                return;
            }
            self._limit = Math.min(MAX_MESSAGES, limit + BACKFILL_STEP);
            self.conversationService.cancel();
            self.runQuery();
        }, BACKFILL_GAP_MS);
    },

    cancelBackfill: function () {
        if (this._backfillTimer) {
            clearTimeout(this._backfillTimer);
            this._backfillTimer = null;
        }
    },

    revealListBottom: function () {
        this.$.scroller.scrollToBottom();
        this._atEnd = true;
    },

    /** Whether the newest message was in view when scrolling stopped; see handleResize. */
    noteScrollPosition: function () {
        this._atEnd = isNearBottom(this.$.scroller.getScrollBounds());
    },

    /**
     * Scroll to the newest message once the rows have been laid out. The second pass is for a
     * conversation that was opened: the panel is still sliding in at the first one, so the
     * scroller has not got its final height yet.
     */
    revealListBottomSoon: function () {
        var self = this;
        this.cancelRevealTimers();
        [30, 400].forEach(function (delay) {
            self._revealTimers.push(setTimeout(function () {
                if (self.$ && self.$.scroller) {
                    self.revealListBottom();
                }
            }, delay));
        });
    },

    cancelRevealTimers: function () {
        this._revealTimers.forEach(clearTimeout);
        this._revealTimers = [];
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

    /** The service a message went out or came in on, shown on its divider as the legacy app did. */
    getDividerIcon: function (message) {
        return transportPicker.serviceIconFor(message && message.serviceName);
    },

    /** A label, escaped, after the service's icon when there is one. */
    withServiceIcon: function (serviceName, text) {
        var icon = transportPicker.serviceIconFor(serviceName);
        var label = messagingUtils.message.escapeHtml(text || "");
        return icon ? '<img class="transport-icon" alt="" src="' +
            messagingUtils.message.escapeHtml(icon) + '">' + label : label;
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
        this.setTransportButton(selected ? transportPicker.serviceNameFor(selected) : $L("."),
            transportPicker.iconFor(selected));
        var count = transportPicker.getTransports().length;
        this.$.transportButton.setShowing(count > 0);
        // The arrow only when there is something to pick from.
        this.$.transportArrow.setShowing(count > 1);
    },

    setTransportButton: function (label, icon) {
        this.$.transportLabel.setContent(label);
        if (icon) {
            this.$.transportIcon.setSrc(icon);
        }
        this.$.transportIcon.setShowing(!!icon);
    },

    /** An icon that does not load is left out; the service's name still shows. */
    transportIconFailed: function () {
        this.$.transportIcon.hide();
        return true;
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
                allowHtml: true,
                content: this.withServiceIcon(list[i].serviceName, transportPicker.labelFor(list[i])),
                transportIndex: i
            }, { owner: this });
        }
        this.$.transportMenu.render();
        // Anchored to the button, as MainView.showAppMenu does: a floating Menu opened with
        // showAtEvent() has no activatorOffset, and while it is open every resize (the back key,
        // the keyboard) throws in Menu.adjustPosition, so back stops working.
        this.$.transportMenu.requestMenuShow(this, { activator: this.$.transportButton });
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

    callOptionsFor: function (transport) {
        return callRequest.callOptions(transport, appState.accountService,
            !!(this.chatThread && this.chatThread.groupChatId));
    },

    /** The header's call buttons follow the service picked for replies. */
    updateCallButtons: function () {
        var calls = this.callOptionsFor(transportPicker.getSelectedTransport());
        this.$.phoneCallButton.setShowing(calls.voice);
        this.$.videoCallButton.setShowing(calls.video);
    },

    voicecall: function () {
        this.callOver(transportPicker.getSelectedTransport(), false);
        return true;
    },

    videocall: function () {
        this.callOver(transportPicker.getSelectedTransport(), true);
        return true;
    },

    /** Hand the call to the phone app, over this transport's service. */
    callOver: function (transport, video) {
        var calls = this.callOptionsFor(transport);
        if (!(video ? calls.video : calls.voice)) {
            return;
        }
        var request = callRequest.callRequest(transport, video);
        if (request) {
            this.$.launchApp.send(request);
        }
    },

    // --- sending -------------------------------------------------------------------------

    composerInput: function () {
        composerEcho.check(this.$.richText);
        this.growInput();
    },

    /** Grow the field with its content, up to the cap the stylesheet sets. */
    growInput: function () {
        var node = this.$.richText.hasNode();
        if (!node) {
            return;
        }
        var before = node.style.height;
        node.style.height = "auto";
        node.style.height = Math.min(node.scrollHeight, 155) + "px";
        if (node.style.height !== before) {
            this.relayout();
        }
    },

    /**
     * The message list takes the height left over by the bars around it, worked out by the fittable
     * layout only when told. Call after a bar appears, goes or changes height: without it the list
     * kept its old height and pushed the bottom bar (send, attach, mic) off the screen.
     */
    relayout: function () {
        if (this.hasNode()) {
            this.resize();
        }
    },

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

        var resolved = sendAccount(selectedTransport, appState.accountService);
        if (resolved.state === "missing") {
            this.sendOnceAccountsReload(selectedTransport);
            return;
        }
        selectedTransport.account = resolved.account;

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
        if (resolved.state === "im") {
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

    /**
     * The IM account behind this transport is not in the list the app loaded - typically one added
     * since the app started. Re-read the accounts and send once they are in; if the account is
     * still not there, say so and keep the text in the composer rather than send it some other way.
     */
    sendOnceAccountsReload: function (transport) {
        var accounts = appState.accountService;
        var self = this;
        var notSent = function () {
            self.showError($L("Unable to send"),
                $L("No account for {service} is set up on this device, so the message was not sent.")
                    .replace("{service}", transport.label || transport.serviceName));
        };
        if (!accounts || this._accountWait) {
            if (!accounts) { notSent(); }
            return;
        }
        var waiter = this._accountWait = {};
        var finish = function () {
            if (self._accountWait !== waiter) { return; }
            clearTimeout(waiter.timer);
            accounts.unregister(waiter);
            self._accountWait = null;
            var resolved = sendAccount(transport, accounts);
            if (resolved.state === "missing" || !self.chatThread) {
                notSent();
                return;
            }
            self.sendMessage();
        };
        accounts.register(waiter, finish);
        waiter.timer = setTimeout(finish, ACCOUNT_RELOAD_MS);
        accounts.getAccounts();
    },

    sendMessageHelper: function (params, dbKind) {
        this._followToEnd = true;
        params._kind = dbKind;
        params.localTimestamp = Date.now();

        if (mockDb.enabled) {
            mockDb.merge([params]);
            this.runQuery();
        } else {
            this.$.messagePut.send({ objects: [params] });
        }

        this.$.richText.set('value', "");
        composerEcho.sent(this.$.richText, params.messageText);
        this.growInput();
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

    /**
     * The TouchPad app's sound for a sent message: audios/sent.mp3 on the alerts class, through
     * PalmSystem.playSoundNotification. WAM's PalmSystem has no such method and the app ships no
     * audios/, so calling it threw a TypeError at the end of every send; until both exist this
     * plays nothing. A received message's sound comes from DashboardManager.
     */
    playSoundNotification: function (inParams) {
        var prefs = appState.prefsHandler && appState.prefsHandler.getPrefs();
        if (!prefs || !prefs.enableNotification) {
            return;
        }
        if (prefs.notificationSound !== "system" && prefs.notificationSound !== "ringtone") {
            return;
        }
        if (!window.PalmSystem || typeof window.PalmSystem.playSoundNotification !== "function") {
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
            this.growInput();
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
        // purge: false keeps a tombstone, which is what the service's delete watch fires on to
        // take the thread's summary and unread count from the messages that are left. A plain
        // del purges at once on LuneOS's db8, and the thread would keep showing a deleted message.
        this.$.dbDelete.send({ ids: ids, purge: false });
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

        // Anything else goes through the system resource handler, which picks the right viewer
        // (PDF Viewer, Documents, Explorer for an archive, ...). A local file no app is registered
        // for is shown in Explorer instead: the resource handler only answers "No handler".
        var files = showInFiles(target), self = this;
        var request = this.$.openApp.send({ target: target });
        if (files && request && request.error) {
            request.error(function () {
                self.$.launchApp.send(files);
            });
        }
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

    /**
     * Close the reaction picker and message menus. They float above the whole app, pinned where
     * they opened, so they must close whenever the message under them moves or goes away -
     * a scroll, another chat, leaving the view - not only on a tap outside them.
     */
    dismissPopups: function () {
        var popups = ["reactRow", "messageMenu", "transportMenu"];
        for (var i = 0; i < popups.length; i++) {
            var popup = this.$[popups[i]];
            if (popup && popup.showing) {
                popup.hide();
            }
        }
        this.closeAttachmentPicker();
    },

    /** Closes the file picker if it is open; true when it was. The back key uses this first. */
    closeAttachmentPicker: function () {
        var picker = this.$.attachmentPicker;
        if (!picker || !picker.showing) {
            return false;
        }
        // Unload the picker page as its own Cancel does, so it starts fresh next time.
        picker.$.CrossApp.setPath("");
        picker.hide();
        return true;
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
        // The button that opened it is in the popup just hidden, so anchor to the tap point
        // instead; without an activatorOffset the open menu throws on every resize.
        this.$.messageMenu.activatorOffset = { top: inEvent.pageY || 0, left: inEvent.pageX || 0, width: 0, height: 0 };
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
        this.relayout();
    },

    cancelReply: function () {
        this.replyToMessage = null;
        this.$.replyBar.setShowing(false);
        this.relayout();
        return true;
    },

    // --- attachments -----------------------------------------------------------------------

    openAttachmentPicker: function () {
        // The system file picker is a device service; off-device there is nothing to pick.
        if (mockDb.enabled) {
            this.showError($L("Attachments"), $L("File picking is only available on device."));
            return true;
        }
        if (this.attachmentsUnsupported()) {
            return true;
        }
        this.$.attachmentPicker.pickFile();
        return true;
    },

    /** SMS cannot carry a file (no MMS sending yet); say so instead of dropping it at send. */
    attachmentsUnsupported: function () {
        var transport = transportPicker.getSelectedTransport();
        if (transport && messagingUtils.utils.isTextMessage(transport.serviceName)) {
            this.showError($L("Attachments"), $L("Attachments can't be sent by SMS. Pick an IM service to send a file."));
            return true;
        }
        return false;
    },

    // The picker sends an array of {fullPath, attachmentType, size, ...}.
    attachmentChosen: function (inSender, inEvent) {
        var files = Array.isArray(inEvent) ? inEvent : (inEvent && inEvent.files);
        var file = files && files[0];
        if (!file || !file.fullPath) {
            return true;
        }
        this.stageAttachment({
            path: file.fullPath,
            name: file.name || file.fullPath.slice(file.fullPath.lastIndexOf("/") + 1),
            type: file.attachmentType
        });
        return true;
    },

    stageAttachment: function (attachment) {
        this.outboundAttachment = attachment;
        this.$.attachmentChipLabel.setContent(attachment.name);
        var isImage = attachment.type === "image";
        if (isImage) {
            this.$.attachmentChipThumb.setSrc("file://" + attachment.path);
        }
        this.$.attachmentChipThumb.setShowing(isImage);
        this.$.attachmentChip.setShowing(true);
        this.relayout();
    },

    clearAttachment: function () {
        this.outboundAttachment = null;
        this.$.attachmentChip.setShowing(false);
        this.$.attachmentChipThumb.setShowing(false);
        this.relayout();
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
        } else if (!this.attachmentsUnsupported()) {
            this.startVoiceNote();
        }
        return true;
    },

    /** One mediarecorder request, as voiceRecorder wants it: done(error, response). */
    recorderCall: function (method, params, done) {
        var request = new ServiceRequest({ service: "luna://com.webos.service.mediarecorder", method: method });
        request.response(function (inSender, inResponse) { done(null, inResponse); });
        request.error(function (inSender, inError) {
            done((inError && (inError.errorText || inError.errorMessage)) || "service error", inError);
        });
        request.go(params);
    },

    startVoiceNote: function () {
        var self = this;
        if (!this.voiceRecorder) {
            this.voiceRecorder = new VoiceRecorder(this.bindSafely("recorderCall"));
        }
        if (this.voiceRecorder.isBusy()) {
            return;
        }
        this.setRecordingUi(true);
        this.voiceRecorder.start(function (error) {
            if (error) {
                self.setRecordingUi(false);
                if (error !== "cancelled" && !self.destroyed) {
                    self.showError($L("Voice message"), $L("Could not start recording: ") + error);
                }
            }
        });
    },

    stopVoiceNote: function () {
        var self = this, seconds = this._vnElapsed || 0;
        this.setRecordingUi(false);
        if (!this.voiceRecorder || this.voiceRecorder.state !== "recording") {
            // Still opening: drop it rather than wait.
            this.cancelVoiceNote();
            return;
        }
        this.voiceRecorder.stop(function (error, path) {
            if (self.destroyed) {
                return;
            }
            if (error) {
                self.showError($L("Voice message"), $L("Recording failed: ") + error);
                return;
            }
            self.stageAttachment({
                path: path,
                name: $L("Voice message") + " " + messagingUtils.message.audioFmt(seconds),
                type: "audio"
            });
        });
    },

    /** Leaving the chat or closing the app: stop and throw the recording away. */
    cancelVoiceNote: function () {
        if (this.voiceRecorder) {
            this.voiceRecorder.cancel();
        }
        if (this.recording) {
            this.setRecordingUi(false);
        }
    },

    setRecordingUi: function (on) {
        this.recording = on;
        this.$.micButton.setSrc(on ? "assets/menu-icon-mic-rec.svg" : "assets/menu-icon-mic.svg");
        this.$.micButton.addRemoveClass("recording", on);
        this.$.vnTimer.setShowing(on);
        if (on) {
            this.startVoiceNoteTimer();
        } else {
            this.stopVoiceNoteTimer();
        }
    },

    startVoiceNoteTimer: function () {
        var self = this;
        this.stopVoiceNoteTimer();
        this._vnElapsed = 0;
        this.$.vnTimer.setContent(messagingUtils.message.audioFmt(0));
        this._vnTimer = setInterval(function () {
            self._vnElapsed += 1;
            self.$.vnTimer.setContent(messagingUtils.message.audioFmt(self._vnElapsed));
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

    /**
     * The on-screen keyboard resizes the window rather than covering it, so the message list loses
     * its bottom part and the newest messages ended up under the keyboard. Keep the end in view when
     * it was in view before, or when the keyboard came up for typing a reply.
     *
     * handleResize, not resize: resize() sends the onresize waterfall; this is the end receiving it.
     */
    handleResize: function () {
        this.inherited(arguments);
        if (!this.$.scroller || !this.collection || !this.collection.length) {
            return;
        }
        var typing = this.$.richText.hasNode() && document.activeElement === this.$.richText.hasNode();
        if (this._atEnd || typing) {
            this.revealListBottomSoon();
        }
    },

    windowHiddenHandler: function () {
        this.dismissPopups();
        if (this.chatThread && this.chatThread._id) {
            this.saveMessageToDraft(this.$.richText.get('value'), this.chatThread._id);
        }
    }
});
