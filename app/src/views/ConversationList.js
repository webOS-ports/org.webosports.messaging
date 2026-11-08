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
    FittableRows = require('./widgets/FitRows'),
    Spinner = require('onyx/Spinner'),
    PrependingRepeater = require('./widgets/PrependingRepeater'),
    Scroller = require('enyo/Scroller'),
    TouchScrollStrategy = require('enyo/TouchScrollStrategy'),
    Collection = require('enyo/Collection'),
    RecordModel = require('../data/RecordModel'),
    syncCollection = require('../util/syncCollection'),
    isNearBottom = require('../util/isNearBottom'),
    bubbleHit = require('../util/bubbleHit'),
    SwipeableItem = require('./widgets/SwipeableItem'),
    prependedCount = require('../util/prependedCount'),
    senderImages = require('../util/senderImages'),
    sendAccount = require('../util/sendAccount'),
    showInFiles = require('../util/showInFiles').showInFiles,
    cameraCapture = require('../util/cameraCapture'),
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
    quoteJump = require('../util/quoteJump'),
    chatSearch = require('../util/chatSearch'),
    SearchInput = require('./widgets/SearchInput'),
    forward = require('../util/forward'),
    attachments = require('../util/attachments'),
    fileCarrier = require('../util/fileCarrier'),
    stickers = require('../util/stickers'),
    enyoUtils = require('enyo/utils'),
    messageState = require('../util/messageState'),
    selection = require('../util/selection'),
    composerEcho = require('../util/composerEcho'),
    callRequest = require('../util/callRequest'),
    chatPresence = require('../util/chatPresence'),
    chatFlags = require('../util/chatFlags'),
    unreadMarker = require('../util/unreadMarker'),
    chatActions = require('../util/chatActions'),
    deviceLocation = require('../util/deviceLocation'),
    launchTargets = require('../util/launchTargets'),
    sentExtras = require('../util/sentExtras'),
    remoteCard = require('../util/remoteCard'),
    GroupDialog = require('./GroupDialog'),
    GroupInfo = require('./GroupInfo'),
    groupInfo = require('../util/groupInfo'),
    MsgAddrSearchList = require('./MsgAddrSearchList'),
    Signals = require('enyo/Signals'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('../data/mockDb'),
    moment = require('moment'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';

/** How long a press on a message is before it is a hold (handleMessageHold). */
var HOLD_MS = 500;
var FOLDERS = messagingUtils.message.FOLDERS;

/**
 * A chat opens on its newest FIRST_PAGE messages, which draw in a fraction of a second, and then
 * backfills older ones BACKFILL_STEP at a time, BACKFILL_GAP_MS apart so the list stays usable in
 * between, up to MAX_MESSAGES. Drawing all 200 at once took about two seconds on a phone.
 */
var FIRST_PAGE = 20, BACKFILL_STEP = 30, MAX_MESSAGES = 200, BACKFILL_GAP_MS = 120;
// How long the message a quote was tapped for stays lit after it is scrolled to.
var QUOTE_FLASH_MS = 1500;
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
                    // Find in Chat, next to the name and before the call buttons: opens the search bar
                    // under the header, or closes it.
                    name: "searchButton", kind: IconButton, src: "assets/find-in-chat-icon.svg",
                    ontap: "toggleSearch", classes: "conversation-call-btn"
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

        // --- Find in Chat (openSearch) --------------------------------------------------
        {
            name: "searchBar", showing: false, classes: "conversation-search flex-row", components: [
                {
                    name: "searchInput", kind: SearchInput, classes: "flex-one",
                    placeholder: $L("Find in Chat"), onSearchChange: "searchChanged",
                    onSearchCancel: "searchChanged"
                },
                { name: "searchCount", classes: "conversation-search-count" },
                {
                    name: "searchOlder", kind: IconButton, src: "assets/menu-arrow.svg",
                    classes: "conversation-search-older", ontap: "searchOlder"
                },
                {
                    name: "searchNewer", kind: IconButton, src: "assets/menu-arrow.svg",
                    classes: "conversation-search-newer", ontap: "searchNewer"
                },
                { kind: Button, content: $L("Done"), classes: "conversation-search-done", ontap: "closeSearch" }
            ]
        },

        // --- messages -------------------------------------------------------------------
        {
            // A group's Add People and Leave Group. Blocking a sender and deleting a chat are in the
            // chat list: Block Sender on a long tap, Delete by swiping the row.
            name: "listButtons", classes: "block-delete-box", showing: false, components: [
                // A group on a service that manages them (util/chatActions).
                {
                    name: "groupAddButton", kind: Button, content: $L("Add People"), showing: false,
                    classes: "group-bt", ontap: "openGroupInvite"
                },
                {
                    name: "groupLeaveButton", kind: Button, content: $L("Leave Group"), showing: false,
                    classes: "group-bt danger-bt", ontap: "promptLeaveGroup"
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
            // A tap reacts; a hold selects (startSelection), as press & hold enters a list's edit
            // mode in HP's TouchPad guidelines.
            ondown: "messageDown", onhold: "handleMessageHold",
            ontap: "handleMessageTap", onConfirm: "swipeDelete", onReply: "handleReplySwipe",
            onScrollStart: "dismissPopups", onScrollStop: "noteScrollPosition", onScroll: "listScrolled",
            onError: "showErrorDialog", onSelectSender: "senderRowSelected",
            onOpenAttachment: "openAttachment", onInviteResponse: "respondToInvite",
            components: [
                // Shown while a chat's messages load, in the empty list where they will appear.
                { name: "loadingSpinner", kind: Spinner, classes: "conversation-loading", showing: false },
                {
                    name: "list", kind: PrependingRepeater, classes: "conversation-messages",
                    components: [ { kind: ConversationRow } ]
                },
                // The buddy is typing to us: three dots under the last message, as WhatsApp draws
                // it (showTypingBubble), in a received message's row - their picture, then the
                // bubble with its tail - built as ConversationItem builds one.
                {
                    name: "typingBubble", classes: "chat-balloon conversation-typing-row", showing: false, components: [
                        {
                            classes: "conversationContactImage", components: [
                                { classes: "contact-image-border" },
                                {
                                    name: "typingImage", kind: Image, classes: "contact-image",
                                    attributes: { onerror: "window.__messagingAvatarFailed(this)" }
                                }
                            ]
                        },
                        {
                            classes: "flex-one", components: [
                                {
                                    classes: "chat-balloon-received conversation-typing-bubble", allowHtml: true,
                                    content: "<span></span><span></span><span></span>"
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        // Back to the newest message, while the reader is further up; with how many came in
        // since (updateJumpButton). Out of the rows' flow: it sits over the list's bottom right.
        {
            name: "jumpButton", classes: "conversation-jump", showing: false, ontap: "jumpToBottom", components: [
                { classes: "conversation-jump-arrow" },
                { name: "jumpCount", classes: "conversation-jump-count", showing: false }
            ]
        },
        { classes: "footer-shadow" },

        // --- staged attachments: one chip per file (renderAttachmentChips) ----------------
        { name: "attachmentChips", showing: false, classes: "attachment-chips" },

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
                    classes: "conversation-attach-btn", ontap: "openAttachMenu"
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

        // --- selecting messages (startSelection): takes the composer's place --------------
        {
            name: "selectionBar", kind: Toolbar, showing: false,
            classes: "conversation-selection flex-row", components: [
                { name: "selectionCount", classes: "conversation-selection-count flex-one" },
                { name: "selectionCopy", kind: Button, content: $L("Copy"), ontap: "copySelected" },
                { name: "selectionForward", kind: Button, content: $L("Forward"), ontap: "forwardSelected" },
                {
                    name: "selectionDelete", kind: Button, content: $L("Delete"),
                    classes: "onyx-negative", ontap: "promptDeleteSelected"
                },
                { kind: Button, content: $L("Cancel"), ontap: "endSelection" }
            ]
        },

        // --- popups ---------------------------------------------------------------------
        {
            name: "transportMenu", kind: Menu, floating: true, scrolling: false, onSelect: "transportChosen"
        },
        {
            // What the paperclip sends: a file, a photo taken now, a sticker where the service has
            // them, where we are, or a contact's card.
            name: "attachMenu", kind: Menu, floating: true, scrolling: false, components: [
                { kind: MenuItem, content: $L("File"), ontap: "openAttachmentPicker" },
                { name: "takePhotoItem", kind: MenuItem, content: $L("Take Photo"), ontap: "takePhoto" },
                { name: "stickerMenuItem", kind: MenuItem, content: $L("Sticker"), ontap: "openStickerPicker" },
                { kind: MenuItem, content: $L("My Location"), ontap: "promptShareLocation" },
                { kind: MenuItem, content: $L("Contact"), ontap: "openContactPicker" }
            ]
        },
        // Who an "@" being typed in a group may be (updateMentionMenu).
        { name: "mentionMenu", kind: Menu, floating: true, scrolling: false, onSelect: "mentionPicked" },
        {
            name: "contactPicker", kind: Popup, centered: true, floating: true, modal: true, scrim: true,
            classes: "contact-picker-popup", components: [
                {
                    name: "contactList", kind: MsgAddrSearchList, label: $L("Share"),
                    classes: "contact-picker-list", onSelected: "contactPicked"
                },
                { kind: Button, content: $L("Cancel"), classes: "contact-picker-cancel", ontap: "closeContactPicker" }
            ]
        },
        {
            // The stickers on this device (util/stickers), newest first, a tap sends one.
            name: "stickerPicker", kind: Popup, centered: true, floating: true, modal: true, scrim: true,
            classes: "sticker-picker-popup", components: [
                { classes: "sticker-picker-title", content: $L("Stickers") },
                {
                    name: "stickerScroller", kind: Scroller, classes: "sticker-picker-scroller",
                    horizontal: "hidden", touch: true, components: [
                        { name: "stickerGrid", classes: "sticker-picker-grid" },
                        {
                            name: "stickerEmpty", classes: "sticker-picker-empty", showing: false,
                            content: $L("No stickers on this device yet. A sticker is a .webp file: one you sent or received, or one copied to the device.")
                        }
                    ]
                },
                { kind: Button, content: $L("Cancel"), classes: "sticker-picker-cancel", ontap: "closeStickerPicker" }
            ]
        },
        { name: "groupDialog", kind: GroupDialog },
        {
            name: "groupInfo", kind: GroupInfo, onMemberChat: "groupMemberChat",
            onMemberContact: "groupMemberContact", onAddPeople: "openGroupInvite", onLeaveGroup: "promptLeaveGroup",
            onRemoveMember: "groupRemoveMember", onRenameGroup: "groupRename"
        },
        {
            name: "reactRow", kind: Popup, floating: true, autoDismiss: true,
            classes: "reaction-picker-popup", components: [
                { name: "reactRowBox", classes: "reaction-row-box" }
            ]
        },
        {
            name: "messageMenu", kind: Menu, floating: true, scrolling: false, components: [
                { kind: MenuItem, content: $L("Reply"), ontap: "menuReply" },
                { kind: MenuItem, content: $L("Forward"), ontap: "menuForward" },
                { kind: MenuItem, content: $L("Forward Via Email"), ontap: "menuForwardEmail" },
                { kind: MenuItem, content: $L("Copy Text"), ontap: "menuCopy" },
                { name: "menuEditItem", kind: MenuItem, content: $L("Edit"), ontap: "menuEdit" },
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
            // Delete, from the message menu or the selection bar: for everyone when the service
            // can, for this device, or not at all. Stacked full width, as webOS's alert dialogs.
            name: "deleteDialog", kind: Popup, centered: true, floating: true, modal: true,
            classes: "delete-dialog", components: [
                { name: "deleteDialogTitle", classes: "delete-dialog-title" },
                { name: "deleteDialogMessage", classes: "delete-dialog-message" },
                {
                    name: "deleteEveryoneButton", kind: Button, content: $L("Delete for Everyone"),
                    classes: "onyx-negative", ontap: "deleteChosenForEveryone"
                },
                {
                    name: "deleteMeButton", kind: Button, content: $L("Delete for Me"),
                    classes: "onyx-negative", ontap: "deleteChosenForMe"
                },
                { kind: Button, content: $L("Cancel"), ontap: "closeDeleteDialog" }
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
        {
            // The newest pictures in the media index, for the .webp files among them (util/stickers).
            name: 'stickerFind', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotStickerIndex', onError: 'stickerIndexFailed'
        },
        { name: 'dbDelete', kind: LunaService, service: DB_SERVICE, method: 'del', onError: 'serviceErr' },
        // The server of a channel's chat, whose name tells a group (chatActions.isChannelGroup).
        { name: 'serverGet', kind: LunaService, service: DB_SERVICE, method: 'get', onResponse: 'gotChatServer', onError: 'serviceErr' },
        { name: 'dbMerge', kind: LunaService, service: DB_SERVICE, method: 'merge', onError: 'serviceErr' },
        {
            name: 'reactionCommand', kind: LunaService, service: DB_SERVICE, method: 'put',
            onError: 'serviceErr'
        },
        // Typing and reading (util/chatPresence). A transport that cannot be reached loses only
        // these, so their errors are not shown.
        {
            name: 'typingSender', kind: LunaService, service: 'luna://com.palm.imlibpurple',
            method: 'sendTyping', onError: 'presenceFailed'
        },
        {
            name: 'readMarker', kind: LunaService, service: 'luna://com.palm.imlibpurple',
            method: 'markRead', onError: 'presenceFailed'
        },
        // onactivate: back in front, as from the Camera app after Take Photo.
        { kind: Signals, onTypingChanged: "showTyping", onactivate: "cameraReturned" },
        {
            name: 'threadMerge', kind: LunaService, service: DB_SERVICE, method: 'merge',
            onError: 'serviceErr'
        },
        {
            name: 'launchApp', kind: LunaService,
            service: 'luna://com.webos.applicationManager', method: 'launch', onError: 'serviceErr'
        },
        {
            // A contact card that came as a link is fetched before Contacts opens it (util/remoteCard).
            name: 'cardDownload', kind: LunaService, service: 'luna://com.webos.service.downloadmanager',
            method: 'download', subscribe: true, onResponse: 'cardDownloadReply', onError: 'cardDownloadFailed'
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
            allowMultiSelect: true,
            style: "width: 100%; height: 80%; box-sizing: border-box;", onPickFile: "attachmentChosen"
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.selectedMessage = null;
        this.replyToMessage = null;
        this.outboundAttachments = [];
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
        this.stopTyping();
        this.cancelLocating();
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
        this.cancelQuoteJump();
        this.cancelVoiceNote();
        this.cancelTakePhoto();
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
        this.cancelQuoteJump();
        this.closeSearch();
        this.endSelection();
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
        this.lookUpChatServer(this.chatThread);
        this.runQuery();
    },

    /** The server of a channel's chat, for its name (updateListButtons). */
    lookUpChatServer: function (thread) {
        if (!thread.serverId) {
            // No server: not the name of the last chat's.
            this._serverId = undefined;
            this._serverName = undefined;
            return;
        }
        if (thread.serverId === this._serverId) {
            return;
        }
        this._serverId = thread.serverId;
        this._serverName = undefined;
        if (mockDb.enabled) {
            setTimeout(this.gotChatServer.bind(this, null, mockDb.get([thread.serverId])), 0);
        } else {
            this.$.serverGet.send({ ids: [thread.serverId] });
        }
    },

    gotChatServer: function (inSender, inResponse) {
        var server = inResponse && inResponse.results && inResponse.results[0];
        if (!server || server._id !== this._serverId) {
            return true;
        }
        this._serverName = server.name || server.displayName;
        if (this.chatThread && this.chatThread.serverId === server._id) {
            this.updateListButtons(this.chatThread);
            this.showListButtons(this.collection && this.collection.length > 0);
            this.relayout();
        }
        return true;
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

    /** The typing row's picture: the one a received message in this 1:1 chat has. */
    showTypingImage: function () {
        var image = (this.chatThread && this.chatThread.personImage) || messagingUtils.person.DEFAULT_IMAGE;
        if (this.$.typingImage.getAttribute("src") !== image) {
            this.$.typingImage.setAttribute("src", image);
        }
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
        this.showTypingImage();
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

        // What was unread as it opened, for the "N unread messages" line (util/unreadMarker);
        // clearing the count below does not change it.
        this._unreadAtOpen = Number(this.chatThread.unreadCount) || 0;
        this._unreadLine = null;
        this._seenIncomingId = null;
        this._jumpNew = 0;
        this.$.jumpButton.hide();

        // Clear the thread's unread count now that it is on screen, and say it was read.
        this.doClearUnreadCount({ threadId: this.chatThread._id });
        this.markChatRead(true);

        this.$.richText.set('value', "");
        this.getDraftMessage(this.chatThread._id);

        this.setHeaderName(this.chatThread.displayName);
        this.$.status.setClasses("status status-no-presence");
        this.chatThread.personImage = messagingUtils.person.getDisplayImage(null);
        // Asked afresh per conversation, so a sender who became a friend since shows up.
        this._senderImages = {};
    },

    closeConversation: function (chatThreadId, skipSaveDraft) {
        this.stopTyping();
        this.conversationService.cancel();
        this.cancelVoiceNote();
        this.clearMessages();

        if (!chatThreadId) {
            return;
        }
        // An edit's text is the old message's, not a draft.
        if (!skipSaveDraft && !this.editingMessage) {
            this.saveMessageToDraft(this.$.richText.get('value'), chatThreadId);
        }
        this.$.richText.set('value', "");
        this.pickedMentions = [];
        this.cancelLocating();

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

    /**
     * The transport tied the open chat to a channel or server after it was opened (ThreadList):
     * take the new ids, so a group shows its Add People and Leave Group.
     */
    threadLinked: function (inThread) {
        if (!inThread || !this.chatThread || inThread._id !== this.chatThread._id) {
            return;
        }
        this.chatThread.channelId = inThread.channelId;
        this.chatThread.serverId = inThread.serverId;
        this.lookUpChatServer(this.chatThread);
        this.updateListButtons(this.chatThread);
        this.showListButtons(this.collection && this.collection.length > 0);
        this.relayout();
    },

    setDeletedChatThread: function (inThread) {
        if (this.chatThread && inThread && this.chatThread._id === inThread._id) {
            this.chatThread = null;
            this.collection.empty([]);
            this.doCloseConversationList();
        }
    },

    setHeaderName: function (inName) {
        this._headerName = inName || "";
        this.renderHeader();
    },

    /** The chat's name; whether the buddy is typing shows under the last message (showTypingBubble). */
    renderHeader: function () {
        this.$.header.setContent(messagingUtils.message.emojifyEscaped(this._headerName || ""));
        this.showTypingBubble();
    },

    /**
     * The dots under the last message while the buddy types ("typing"; "paused" hides them, as
     * WhatsApp does). Shown with the newest message in view, it is scrolled to as a new message
     * would be; further up the chat it is left for when the reader comes down.
     */
    showTypingBubble: function () {
        var typing = this.typingState() === "typing";
        if (typing) {
            this.showTypingImage();
        }
        if (typing === this.$.typingBubble.showing) {
            return;
        }
        var follow = typing && isNearBottom(this.$.scroller.getScrollBounds());
        this.$.typingBubble.setShowing(typing);
        if (follow) {
            this.revealListBottom();
        }
    },

    // --- typing and reading (util/chatPresence) -------------------------------------------

    /**
     * The chat as the transport knows it: the service and address replies go to. ownAddress: the
     * thread's own, for when the chat has only just opened and the picker still holds the last
     * chat's transport.
     */
    presenceTarget: function (ownAddress) {
        var thread = this.chatThread;
        if (!thread || !thread._id) {
            return null;
        }
        var transport = ownAddress ? null : transportPicker.getSelectedTransport();
        var useTransport = !!(transport && transport.serviceName && transport.replyAddress);
        return {
            replyService: useTransport ? transport.serviceName : thread.replyService,
            replyAddress: useTransport ? transport.replyAddress : thread.replyAddress,
            channelId: thread.channelId, groupChatId: thread.groupChatId
        };
    },

    presenceAccount: function (target) {
        return target && appState.accountService ? appState.accountService.getAccount(target.replyService) : null;
    },

    /** The buddy's typing state in this chat: "typing", "paused" or null. */
    typingState: function () {
        var target = this.presenceTarget();
        return appState.typers ? appState.typers.stateFor(target, this.presenceAccount(target), Date.now()) : null;
    },

    /** watchTyping brought a change: draw it, and again when it lapses. */
    showTyping: function () {
        this.renderHeader();
        if (this._typingLapseTimer) {
            clearTimeout(this._typingLapseTimer);
            this._typingLapseTimer = null;
        }
        var next = appState.typers && appState.typers.nextLapse();
        if (next !== null && next !== undefined) {
            var self = this;
            this._typingLapseTimer = setTimeout(function () {
                self._typingLapseTimer = null;
                self.showTyping();
            }, Math.max(0, next - Date.now()) + 50);
        }
        return true;
    },

    /** Send one call to the transport; with the mock db, keep it for the tests instead. */
    sendPresence: function (service, payload) {
        if (!payload) {
            return;
        }
        if (mockDb.enabled) {
            mockDb.presenceCalls = mockDb.presenceCalls || [];
            mockDb.presenceCalls.push({ method: service.method, payload: payload });
            return;
        }
        service.send(payload);
    },

    /** Tell the transport the chat was read, so it sends the service's read receipts. */
    markChatRead: function (ownAddress) {
        var target = this.presenceTarget(ownAddress);
        this.sendPresence(this.$.readMarker, chatPresence.markReadPayload(target, this.presenceAccount(target)));
    },

    /** Tell the transport our typing state in this chat, as the composer reports it. */
    sendTypingState: function (state) {
        if (!state) {
            return;
        }
        var target = this.presenceTarget();
        this.sendPresence(this.$.typingSender,
            chatPresence.sendTypingPayload(target, this.presenceAccount(target), state));
    },

    /** The keys went quiet for a while: paused. Checked once a second while typing. */
    typingTick: function () {
        if (!this._composer) {
            return;
        }
        this.sendTypingState(this._composer.tick(Date.now()));
        if (this._composer.sent !== "typing") {
            this.cancelTypingTimer();
        }
    },

    cancelTypingTimer: function () {
        if (this._typingTimer) {
            clearInterval(this._typingTimer);
            this._typingTimer = null;
        }
    },

    /** Sent, emptied or left: not typing any more. */
    stopTyping: function () {
        this.cancelTypingTimer();
        if (this._composer) {
            this.sendTypingState(this._composer.stop());
            this._composer = null;
        }
    },

    presenceFailed: function () {
        return true;
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
        // While searching, the list stays on the match rather than following new messages down.
        var follow = this._followToEnd ||
            (!(this._search && this._search.query) && isNearBottom(this.$.scroller.getScrollBounds()));
        this._followToEnd = false;

        this.messages = results;
        this.findUnreadLine(results);

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
        this.showListButtons(results.length > 0);
        this.relayout();
        if (follow) {
            this.revealListBottomSoon();
        } else if (this._unreadLine && this._unreadLine.moved) {
            this.placeUnreadLine();
        }
        this.countNewBelow(results, follow);
        this.scheduleBackfill(results.length);
        if (this._wantedQuote) {
            this.stepQuoteJump();
        }
        if (this._search) {
            this.refreshSearch(false);
        }
        if (this._selected) {
            this.showSelection();
        }
        return true;
    },

    // --- selecting messages ---------------------------------------------------------------

    /** Select messages, starting with message: taps then pick, and the bar acts on them all. */
    startSelection: function (message) {
        if (!this.chatThread || !selection.selectable(message)) {
            return;
        }
        this.dismissPopups();
        this.cancelReply();
        this._selected = selection.start(message);
        this.$.list.selecting = true;
        this.$.footer.hide();
        this.$.attachmentChips.hide();
        this.$.selectionBar.show();
        this.showSelection();
        this.relayout();
    },

    /** Leave selecting; whether it was on, so back leaves it first. */
    endSelection: function () {
        var on = !!this._selected;
        this._selected = null;
        this.$.list.selecting = false;
        this.markSelectedRows();
        if (this.$.selectionBar.showing) {
            this.$.selectionBar.hide();
            this.$.footer.show();
            this.$.attachmentChips.setShowing(this.outboundAttachments.length > 0);
            this.relayout();
        }
        return on;
    },

    selectedMessages: function () {
        return selection.picked(this.collection.map(function (m) { return m.attributes; }),
            this._selected);
    },

    /** The bar and the rows as the selection now is. */
    showSelection: function () {
        var picked = this.selectedMessages();
        this.$.selectionCount.setContent(picked.length === 1 ? $L("1 selected") :
            $L("{n} selected").replace("{n}", picked.length));
        var forwardable = forward.composeParamsFor(picked);
        this.$.selectionCopy.setDisabled(!(forwardable && forwardable.messageText));
        this.$.selectionForward.setDisabled(!forwardable);
        this.$.selectionDelete.setDisabled(!picked.length);
        this.markSelectedRows();
    },

    markSelectedRows: function () {
        var rows = this.$.list.getClientControls ? this.$.list.getClientControls() : [];
        for (var i = 0; i < rows.length; i++) {
            var m = rows[i].model && rows[i].model.attributes;
            rows[i].addRemoveClass("msg-selected", !!(this._selected && selection.has(this._selected, m)));
        }
    },

    copySelected: function () {
        var params = forward.composeParamsFor(this.selectedMessages());
        this.endSelection();
        if (params && params.messageText) {
            var now = this.$.richText.get('value') || "";
            this.$.richText.set('value', now + (now ? "\n" : "") + params.messageText);
            this.growInput();
        }
        return true;
    },

    forwardSelected: function () {
        var params = forward.composeParamsFor(this.selectedMessages());
        if (params) {
            this.endSelection();
            this.doOpenComposeView({ params: params });
        }
        return true;
    },

    promptDeleteSelected: function () {
        return this.promptDelete(this.selectedMessages(), true);
    },

    /**
     * Ask how to delete these messages: for everyone (all ours, and the service takes it), for
     * this device, or not. fromSelection: they were picked in the selection bar, which ends then.
     */
    promptDelete: function (messages, fromSelection) {
        messages = (messages || []).filter(function (m) { return m && m._id; });
        if (!messages.length) {
            return true;
        }
        var n = messages.length, now = Date.now(), accountService = appState.accountService;
        var everyone = chatActions.canDeleteAllForEveryone(messages, function (m) {
            return chatActions.actionsFor(m.serviceName, accountService);
        }, now);
        this.pendingDelete = { messages: messages, fromSelection: !!fromSelection };
        this.$.deleteDialogTitle.setContent(n === 1 ? $L("Delete Message") : $L("Delete Messages"));
        this.$.deleteDialogMessage.setContent(n === 1 ? $L("Delete this message?") :
            $L("Delete these {n} messages?").replace("{n}", n));
        this.$.deleteEveryoneButton.setShowing(everyone);
        this.$.deleteDialog.show();
        return true;
    },

    closeDeleteDialog: function () {
        this.$.deleteDialog.hide();
        this.pendingDelete = null;
        return true;
    },

    /** Take the pending delete, closing the prompt and the selection it came from. */
    takePendingDelete: function () {
        var pending = this.pendingDelete;
        this.pendingDelete = null;
        this.$.deleteDialog.hide();
        if (pending && pending.fromSelection) {
            this.endSelection();
        }
        return pending ? pending.messages : [];
    },

    deleteChosenForMe: function () {
        var ids = this.takePendingDelete().map(function (m) { return m._id; });
        if (ids.length) {
            this.deleteRecords(ids);
            if (mockDb.enabled) {
                this.runQuery();
            }
        }
        return true;
    },

    /** Delete our messages on the service, and draw them deleted at once, as the transport will. */
    deleteChosenForEveryone: function () {
        var messages = this.takePendingDelete(), thread = this.chatThread, failed = 0;
        messages.forEach(function (message) {
            var sent = this.sendImCommand(message.serviceName, function (kind, account) {
                return chatActions.deleteCommand(kind, account, chatActions.chatOf(message, thread), message);
            });
            if (!sent) {
                failed++;
                return;
            }
            // The words DeleteHandler leaves, for the thread's summary.
            this.mergeRecord({ _id: message._id, _kind: message._kind, deleted: true, messageText: "This message was deleted." });
        }, this);
        if (failed) {
            this.showError($L("Unable to delete"), failed === 1 ?
                $L("This message cannot be deleted for everyone.") :
                $L("{n} messages cannot be deleted for everyone.").replace("{n}", failed));
        }
        return true;
    },

    // --- Find in Chat ---------------------------------------------------------------------

    /** Open the search bar, and load all the messages the chat keeps so it searches them all. */
    openSearch: function () {
        if (!this.chatThread || !this.chatThread._id) {
            return;
        }
        this.dismissPopups();
        this._search = this._search || { query: "", hits: [], current: -1, id: null };
        this.$.searchBar.show();
        this.relayout();
        this.$.searchInput.$.input.focus();
        if ((this._limit || FIRST_PAGE) < MAX_MESSAGES) {
            this.cancelBackfill();
            this._limit = MAX_MESSAGES;
            this.conversationService.cancel();
            this.runQuery();
        }
        this.refreshSearch(false);
    },

    /** The header's magnifier: open Find in Chat, or close it when it is open. */
    toggleSearch: function () {
        if (this._search) {
            this.closeSearch();
        } else {
            this.openSearch();
        }
        return true;
    },

    /** Whether the search bar is open; back closes it first. */
    closeSearch: function () {
        var open = !!this._search;
        this._search = null;
        this.markSearchHit(null);
        if (this.$.searchBar.showing) {
            this.$.searchInput.set('value', "");
            this.$.searchBar.hide();
            this.relayout();
        }
        return open;
    },

    searchChanged: function (inSender, inEvent) {
        if (this._search) {
            this._search.query = (inEvent && inEvent.value) || "";
            this._search.id = null;
            this.refreshSearch(true);
        }
        return true;
    },

    searchOlder: function () {
        this.stepSearch(-1);
        return true;
    },

    searchNewer: function () {
        this.stepSearch(1);
        return true;
    },

    /** Recount the matches; go to the match shown before, or the newest. show: scroll to it. */
    refreshSearch: function (show) {
        var s = this._search, messages = this.messages || [];
        s.hits = chatSearch.find(messages, s.query);
        var current = chatSearch.keep(messages, s.hits, s.id);
        var moved = current >= 0 && messages[s.hits[current]]._id !== s.id;
        s.current = current;
        s.id = current >= 0 ? messages[s.hits[current]]._id : null;
        this.updateSearchCount();
        this.markSearchHit(current >= 0 ? s.hits[current] : null, show || moved);
    },

    stepSearch: function (dir) {
        var s = this._search;
        if (!s || !s.hits.length) {
            return;
        }
        s.current = chatSearch.step(s.current, s.hits.length, dir);
        s.id = this.messages[s.hits[s.current]]._id;
        this.updateSearchCount();
        this.markSearchHit(s.hits[s.current], true);
    },

    updateSearchCount: function () {
        var s = this._search;
        var text = !s.query.trim() ? "" : !s.hits.length ? $L("No matches") :
            $L("{n} of {total}").replace("{n}", s.current + 1).replace("{total}", s.hits.length);
        this.$.searchCount.setContent(text);
        this.$.searchOlder.setDisabled(!s.hits.length || s.current <= 0);
        this.$.searchNewer.setDisabled(!s.hits.length || s.current >= s.hits.length - 1);
    },

    /** Light the row at index as the current match (null: none), scrolling to it when asked. */
    markSearchHit: function (index, scroll) {
        if (this._searchRow && !this._searchRow.destroyed) {
            this._searchRow.removeClass("search-hit");
        }
        this._searchRow = null;
        if (index === null || index === undefined) {
            return;
        }
        var row = this.$.list.getChildForIndex(index);
        if (!row) {
            return;
        }
        row.addClass("search-hit");
        this._searchRow = row;
        if (scroll) {
            this.scrollRowToMiddle(row);
        }
    },

    // --- quote taps -----------------------------------------------------------------------

    /** Bring up the message a tapped quote card is for (util/quoteJump). */
    jumpToQuoted: function (id) {
        this.cancelQuoteJump();
        this._wantedQuote = id;
        this.stepQuoteJump();
    },

    /** Show the wanted original if it is loaded; else let the backfill go on, or give up. */
    stepQuoteJump: function () {
        var messages = this.messages || [];
        var step = quoteJump.next(messages, this._wantedQuote, messages.length,
            this._limit || FIRST_PAGE, MAX_MESSAGES);
        if (step.action === "wait") {
            return;
        }
        this._wantedQuote = null;
        if (step.action === "show") {
            this.showQuoted(step.index);
        }
    },

    /** Scroll the row at index to the middle of the list and light it up for a moment. */
    showQuoted: function (index) {
        var row = this.$.list.getChildForIndex(index);
        if (!this.scrollRowToMiddle(row)) {
            return;
        }

        this.clearQuoteFlash();
        row.addClass("quote-target");
        this._quoteFlash = { row: row };
        var self = this;
        this._quoteFlash.timer = setTimeout(function () { self.clearQuoteFlash(); }, QUOTE_FLASH_MS);
    },

    /** Scroll so row sits in the middle of the list. False when it is not drawn. */
    scrollRowToMiddle: function (row) {
        var node = row && row.hasNode();
        var scroller = this.$.scroller.hasNode();
        if (!node || !scroller) {
            return false;
        }
        var bounds = this.$.scroller.getScrollBounds();
        var top = bounds.top + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        this.$.scroller.setScrollTop(Math.max(0, top - Math.max(0, (bounds.clientHeight - node.offsetHeight) / 2)));
        this._atEnd = isNearBottom(this.$.scroller.getScrollBounds());
        return true;
    },

    clearQuoteFlash: function () {
        var flash = this._quoteFlash;
        this._quoteFlash = null;
        if (flash) {
            clearTimeout(flash.timer);
            if (!flash.row.destroyed) {
                flash.row.removeClass("quote-target");
            }
        }
    },

    cancelQuoteJump: function () {
        this._wantedQuote = null;
        this.clearQuoteFlash();
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
        // Read as it arrives while the chat is on screen.
        if (appState.getAppDeactivated() === false) {
            this.markChatRead();
        }
        this.renderHeader();
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
        this.updateJumpButton();
    },

    /** Whether the newest message was in view when scrolling stopped; see handleResize. */
    noteScrollPosition: function () {
        this._atEnd = isNearBottom(this.$.scroller.getScrollBounds());
        this.updateJumpButton();
    },

    listScrolled: function () {
        this.updateJumpButton();
    },

    // --- unread line and jump to the newest message (util/unreadMarker) -------------------

    /** The line's caption for the row of record, or "". */
    unreadLineCaption: function (record) {
        var line = this._unreadLine;
        return line && record && record._id === line.id ? unreadMarker.caption(this._unreadAtOpen) : "";
    },

    /**
     * Where the line goes, from the messages loaded. More unread than loaded: above the oldest
     * loaded one, until the backfill brings in the rest (moved: it is to be placed again).
     */
    findUnreadLine: function (results) {
        if (!this._unreadAtOpen || (this._unreadLine && this._unreadLine.exact)) {
            return;
        }
        var found = unreadMarker.lineFor(results, this._unreadAtOpen);
        var was = this._unreadLine;
        if (!found || (was && was.id === found.id)) {
            return;
        }
        this._unreadLine = { id: found.id, exact: found.exact, moved: !!was };
        if (was) {
            this.redrawRowOf(was.id);
            this.redrawRowOf(found.id);
        }
    },

    redrawRowOf: function (id) {
        var index = -1;
        this.collection.forEach(function (m, i) {
            if (m.attributes._id === id) {
                index = i;
            }
        });
        var row = index >= 0 && this.$.list.childForIndex(index);
        if (row && row.populateRow) {
            row.populateRow();
        }
    },

    /**
     * On opening, the newest messages are scrolled to; if that takes the line off the top, the
     * chat shows the line at its top instead, so the first unread message is read first. Only
     * while the chat opens (settle: its last pass), or when the backfill moved the line: a new
     * message later, at the bottom, does not take the reader back up.
     */
    placeUnreadLine: function (settle) {
        var line = this._unreadLine;
        if (!line || (line.settled && !line.moved)) {
            return;
        }
        line.moved = false;
        if (settle) {
            line.settled = true;
        }
        // The line drawn now: a row it moved off keeps its hidden one.
        var nodes = this.$.list.hasNode() ? this.$.list.hasNode().querySelectorAll(".conversation-unread-line") : [];
        var node = Array.prototype.filter.call(nodes, function (n) { return !!n.offsetParent; })[0];
        var scroller = this.$.scroller.hasNode();
        if (!node || !scroller) {
            return;
        }
        var top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (top < 0) {
            this.$.scroller.setScrollTop(Math.max(0, this.$.scroller.getScrollTop() + top - 4));
            this._atEnd = false;
            this.updateJumpButton();
        }
    },

    /**
     * Count what came in below while the reader was further up. Not when following: the list is
     * scrolled down a moment later, and counting would flash the button meanwhile.
     */
    countNewBelow: function (results, follow) {
        var newest = unreadMarker.newestIncoming(results);
        if (!follow && this._seenIncomingId && newest !== this._seenIncomingId) {
            this._jumpNew += unreadMarker.newSince(results, this._seenIncomingId);
        }
        this._seenIncomingId = newest;
        this.updateJumpButton();
    },

    updateJumpButton: function () {
        var away = !!this.collection && this.collection.length > 0 &&
            !isNearBottom(this.$.scroller.getScrollBounds());
        if (!away) {
            this._jumpNew = 0;
        }
        this.$.jumpCount.setContent(this._jumpNew > 99 ? "99+" : String(this._jumpNew));
        this.$.jumpCount.setShowing(away && this._jumpNew > 0);
        this.$.jumpButton.setShowing(away);
    },

    jumpToBottom: function () {
        this.revealListBottom();
        return true;
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
                    self.placeUnreadLine(delay === 400);
                }
            }, delay));
        });
    },

    cancelRevealTimers: function () {
        this._revealTimers.forEach(clearTimeout);
        this._revealTimers = [];
    },

    /** The group row, when the chat has messages, is not locked, and has a button to show. */
    showListButtons: function (hasMessages) {
        this.$.listButtons.setShowing(!!hasMessages &&
            !!(this.chatThread && !(this.chatThread.flags || {}).locked) &&
            (this.$.groupAddButton.showing || this.$.groupLeaveButton.showing));
    },

    updateListButtons: function (thread) {
        var actions = thread ? chatActions.actionsFor(thread.replyService, appState.accountService) : {};
        // A group we left takes nothing from us any more (chatFlags.isLeft).
        var server = thread && thread.serverId === this._serverId ? this._serverName : undefined;
        var group = chatActions.isManagedGroup(thread, server) && !chatFlags.isLeft(thread);
        this.$.groupAddButton.setShowing(group && !!actions.groupInvite);
        this.$.groupLeaveButton.setShowing(group && !!actions.groupLeave);
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
        // A group's header opens Group Info: who is in it, and its Add People and Leave Group.
        if (groupInfo.isGroupChat(this.chatThread)) {
            this.openGroupInfo();
            return true;
        }
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
        // Whose typing the header shows follows the service picked.
        this.renderHeader();
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
        this.composerTyped();
        this.updateMentionMenu();
    },

    /** The text changed: tell the transport we are typing, and watch for the keys to stop. */
    composerTyped: function () {
        if (!this.chatThread || !this.chatThread._id) {
            return;
        }
        this._composer = this._composer || new chatPresence.Composer();
        this.sendTypingState(this._composer.input(this.$.richText.get('value'), Date.now()));
        if (this._composer.sent === "typing" && !this._typingTimer) {
            var self = this;
            this._typingTimer = setInterval(function () { self.typingTick(); }, 1000);
        } else if (this._composer.sent === "none") {
            this.cancelTypingTimer();
        }
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
            if (messageText || this.outboundAttachments.length) {
                this.sendMessage();
            }
            return true;
        }
    },

    sendButtonTapped: function () {
        var messageText = this.$.richText.get('value');
        if (messageText || this.outboundAttachments.length) {
            this.sendMessage();
        }
        return true;
    },

    /**
     * Send what is in the composer, or extra: { text, fields } for a message made for it (a
     * location, a contact card: util/chatActions), which leaves the composer as it is.
     */
    sendMessage: function (extra) {
        if (!this.chatThread || !this.chatThread._id) {
            return;
        }
        // Safety net in case the app is killed before the thread is re-read.
        this.doClearUnreadCount({ threadId: this.chatThread._id });
        this.stopTyping();
        if (this.editingMessage && !extra) {
            this.sendEdit();
            return;
        }

        var selectedTransport = transportPicker.getSelectedTransport();
        if (!selectedTransport) {
            this.showError($L("Unable to send"), $L("No account can send to this recipient."));
            return;
        }
        // Files staged on an IM transport and then the chat switched to SMS: the send would go
        // out as text and the files would be cleared with the composer. Keep them and say so.
        if (!extra && fileCarrier.wouldDrop(this.outboundAttachments, selectedTransport.serviceName)) {
            this.showSmsAttachmentsError();
            return;
        }

        var resolved = sendAccount(selectedTransport, appState.accountService);
        if (resolved.state === "missing") {
            this.sendOnceAccountsReload(selectedTransport, extra);
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
            messageText: extra ? extra.text : this.$.richText.get('value'),
            serviceName: selectedTransport.serviceName
        };

        // Native reply: stamp the quote metadata from the message being replied to. quotedMessageId
        // is the original's serviceMessageId, which the transport hands to the network so OTHER
        // clients thread the reply too; the fields also render the local echo's quote card.
        if (this.replyToMessage && !extra) {
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
            // What a plugin may send natively; the text is its plain form for any other.
            var fields = (extra && extra.fields) || {};
            for (var f in fields) {
                if (fields.hasOwnProperty(f)) {
                    params[f] = fields[f];
                }
            }
            var mentions = extra ? [] : chatActions.mentionsInText(params.messageText, this.pickedMentions);
            if (mentions.length) {
                params.mentions = mentions;
            }
        } else {
            dbKind = messagingUtils.message.SMS.dbKind;
            params.serviceName = "sms";
        }

        // One message per staged file, the text on the first (util/attachments). Only a service
        // that can carry a file gets the path (util/fileCarrier); SMS has no MMS sender yet. A
        // sticker comes as extra.file, alone.
        var parts = extra ? [{ text: params.messageText,
            file: (extra.file && fileCarrier.canCarry(params.serviceName)) ? extra.file : null }] :
            attachments.messages(params.messageText, this.outboundAttachments,
                fileCarrier.canCarry(params.serviceName));
        if (!parts.length) {
            return;
        }
        var list = parts.map(function (part, i) {
            var p = enyoUtils.clone(params);
            p.messageText = part.text;
            if (part.file) {
                p.filePath = part.file.path;
            }
            if (i > 0) {
                // The reply's quote goes with its first message only.
                delete p.quotedText;
                delete p.quotedFrom;
                delete p.quotedMessageId;
            }
            return p;
        });

        // Update the thread record directly rather than waiting on the chatthreader, which is too
        // slow to keep the list in step with a just-sent message.
        var updated = messagingUtils.thread.updateFromNewMessage(
            { _id: this.chatThread._id, _kind: messagingUtils.thread.dbKind }, list[list.length - 1], recipient);
        this.mergeThread(updated);

        this.sendMessageHelper(list, dbKind, params.messageText, !!extra);
    },

    /**
     * The IM account behind this transport is not in the list the app loaded - typically one added
     * since the app started. Re-read the accounts and send once they are in; if the account is
     * still not there, say so and keep the text in the composer rather than send it some other way.
     */
    sendOnceAccountsReload: function (transport, extra) {
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
            self.sendMessage(extra);
        };
        accounts.register(waiter, finish);
        waiter.timer = setTimeout(finish, ACCOUNT_RELOAD_MS);
        accounts.getAccounts();
    },

    /** Write the messages of one send (one per file) to the outbox, in order, and reset the composer. */
    sendMessageHelper: function (list, dbKind, typed, keepComposer) {
        this._followToEnd = true;
        var now = Date.now();
        for (var i = 0; i < list.length; i++) {
            list[i]._kind = dbKind;
            // Apart by a millisecond, so the list and the transport keep them in the order picked.
            list[i].localTimestamp = now + i;
        }

        if (mockDb.enabled) {
            mockDb.merge(list);
            this.runQuery();
        } else {
            this.$.messagePut.send({ objects: list });
        }

        if (!keepComposer) {
            this.$.richText.set('value', "");
            composerEcho.sent(this.$.richText, typed);
            this.growInput();
            this.cancelReply();
            this.pickedMentions = [];
            if (this.outboundAttachments.length) {
                this.clearAttachment();
            }
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
        if (this._selected) {
            this._selected = selection.toggle(this._selected, message);
            this.showSelection();
            return true;
        }

        // A tap on a poll option votes; a tap on one of my reaction badges removes it.
        var node = inEvent && (inEvent.target || (inEvent.domEvent && inEvent.domEvent.target));
        // Only the bubble opens the reactions: not the avatar, nor the row beside the bubble.
        if (!bubbleHit(node)) {
            this.dismissPopups();
            return true;
        }
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
        // Nothing to react to, reply to, forward or copy on a message deleted for everyone.
        if (messageState.isDeleted(message)) {
            return true;
        }
        var quoted = quoteJump.quotedIdAt(node, this.hasNode());
        if (quoted) {
            this.jumpToQuoted(quoted);
            return true;
        }

        this.openReactRow(inEvent);
        return true;
    },

    swipeDelete: function (inSender, inEvent) {
        var message = this.messageFor(inEvent);
        if (message && message._id && !this._selected) {
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
        // While selecting, a tap on a file picks its message (handleMessageTap) instead.
        if (this._selected) {
            return true;
        }
        var target = inEvent && inEvent.target;
        var attachmentKind = inEvent && inEvent.kind;
        // A card we sent: its person in Contacts, found from the message (util/sentExtras).
        if (attachmentKind === "sent-contact") {
            var shown = launchTargets.sentContactLaunch(sentExtras.sentContact(inEvent.message));
            if (shown) {
                this.launch(shown);
            }
            return true;
        }
        if (!target) {
            return true;
        }

        if (attachmentKind === "location") {
            var maps = launchTargets.mapsLaunch(target);
            if (maps) {
                this.$.launchApp.send(maps);
            }
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
            var contacts = launchTargets.contactLaunch(target);
            if (contacts) {
                this.$.launchApp.send(contacts);
            } else if (remoteCard.isRemote(target)) {
                this.fetchCard(target);
            }
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

    /** Fetch a card that came as a link, then open it in Contacts; once fetched, it is not again. */
    fetchCard: function (url) {
        var params = remoteCard.request(url);
        this._cards = this._cards || {};
        if (this._cards[params.target]) {
            this.openFetchedCard(this._cards[params.target]);
            return;
        }
        this._cardUrl = params.target;
        if (mockDb.enabled) {
            this.cardDownloadReply(null, mockDb.download(params));
            return;
        }
        // The subscription is ended through the request send returns; LunaService.cancel()
        // without it throws, which left the card unopened and fetched it again on every tap.
        this._cardRequest = this.$.cardDownload.send(params);
    },

    cardDownloadReply: function (inSender, inResponse) {
        var result = remoteCard.outcome(inResponse);
        if (result.state === "pending" || !this._cardUrl) {
            return true;
        }
        var url = this._cardUrl, request = this._cardRequest;
        this._cardUrl = null;
        this._cardRequest = null;
        if (request && typeof request.cancel === "function") {
            request.cancel();
        }
        if (result.state === "done") {
            this._cards[url] = result.path;
            this.openFetchedCard(result.path);
        } else {
            this.cardDownloadFailed();
        }
        return true;
    },

    cardDownloadFailed: function () {
        this._cardUrl = null;
        this._cardRequest = null;
        this.showError($L("Unable to open contact card"), $L("The contact card could not be downloaded."));
        return true;
    },

    openFetchedCard: function (path) {
        var contacts = launchTargets.contactLaunch("file://" + path);
        if (contacts) {
            this.$.launchApp.send(contacts);
        }
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
        var thread = this.chatThread;
        this.sendImCommand(message.serviceName, function (kind, account) {
            return chatActions.pollVoteCommand(kind, account, chatActions.chatOf(message, thread), message, selected);
        });
    },

    /**
     * Write one imcommand for the transport (util/chatActions). build(kind, account) makes it for
     * our account on serviceName. With the mock db it is kept for the tests. False when there is
     * no account or nothing to send.
     */
    sendImCommand: function (serviceName, build) {
        var accountService = appState.accountService;
        var account = accountService && accountService.getAccount(serviceName);
        var cmd = account && build(accountService.getImCommandKind(serviceName), account);
        if (!cmd) {
            return false;
        }
        if (mockDb.enabled) {
            mockDb.imCommands.push(cmd);
        } else {
            this.$.reactionCommand.send({ objects: [cmd] });
        }
        return true;
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

    openReactRow: function (inEvent) {
        this.$.reactRow.showAtEvent(inEvent);
    },

    /**
     * Close the reaction picker and message menus. They float above the whole app, pinned where
     * they opened, so they must close whenever the message under them moves or goes away -
     * a scroll, another chat, leaving the view - not only on a tap outside them.
     */
    dismissPopups: function () {
        // A delete prompt left open on a row goes too: the row it sits on is moving away.
        SwipeableItem.cancelPending();
        var popups = ["reactRow", "messageMenu", "transportMenu", "attachMenu", "mentionMenu", "stickerPicker",
            "groupInfo"];
        for (var i = 0; i < popups.length; i++) {
            var popup = this.$[popups[i]];
            if (popup && popup.showing) {
                popup.hide();
            }
        }
        this.closeAttachmentPicker();
    },

    /** The back gesture over Group Info: closes its top layer; true when it was open. */
    closeGroupInfo: function () {
        return this.$.groupInfo.back();
    },

    /**
     * Closes the file picker, or the sticker picker, if it is open; true when it was. The back
     * key uses this first.
     */
    closeAttachmentPicker: function () {
        if (this.$.stickerPicker.showing) {
            this.$.stickerPicker.hide();
            return true;
        }
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
        this.updateMessageMenu(this.selectedMessage);
        this.showMenuCentered(this.$.messageMenu);
        return true;
    },

    /** Edit only for our own sent message, where the service does it. */
    updateMessageMenu: function (message) {
        var actions = message ? chatActions.actionsFor(message.serviceName, appState.accountService) : {};
        var now = Date.now();
        this.$.menuEditItem.setShowing(chatActions.canEdit(message, actions, now));
    },

    /**
     * Open a menu in the middle of the screen, as the legacy app opened its message menu
     * (PopupSelect.openAtCenter). At the finger it ran off the bottom for a message low down.
     */
    showMenuCentered: function (menu) {
        // Onyx's .onyx-menu carries a 2px top margin, for a menu under its button.
        menu.applyPosition({ top: 0, left: 0, bottom: 'auto', right: 'auto', 'margin-top': 0 });
        menu.activatorOffset = { top: 0, left: 0, width: 0, height: 0 };
        menu.show();
        var n = menu.hasNode();
        if (!n) {
            return;
        }
        var b = n.getBoundingClientRect();
        var top = Math.max(0, Math.round((window.innerHeight - b.height) / 2));
        var left = Math.max(0, Math.round((window.innerWidth - b.width) / 2));
        // adjustPosition (on a resize) moves a floating menu to its activatorOffset: keep it here.
        menu.activatorOffset = { top: top, left: left, width: 0, height: 0 };
        menu.applyPosition({ top: top, left: left });
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
        var thread = this.chatThread;
        var networkEmoji = this.mapReactionForNetwork(emoji, message.serviceName);
        this.sendImCommand(message.serviceName, function (kind, account) {
            return chatActions.reactionCommand(kind, account, chatActions.chatOf(message, thread), message,
                networkEmoji, remove);
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

    /** A short right swipe on a message replies to it; a tap is what opens the reactions. */
    handleReplySwipe: function (inSender, inEvent) {
        var message = this.messageFor(inEvent);
        // Not to a deleted message, which has nothing to quote, nor while selecting.
        if (message && !messageState.isDeleted(message) && !this._selected) {
            this.dismissPopups();
            this.selectedMessage = message;
            this.enterReply(message);
        }
        return true;
    },

    menuReply: function () {
        if (this.selectedMessage) {
            this.enterReply(this.selectedMessage);
        }
        return true;
    },

    /** New Conversation with this message's text and file, for picking who it goes to. */
    menuForward: function () {
        var params = forward.composeParams(this.selectedMessage);
        if (params) {
            this.doOpenComposeView({ params: params });
        }
        return true;
    },

    menuForwardEmail: function () {
        var launch = forward.emailLaunch(this.selectedMessage);
        if (launch) {
            this.$.launchApp.send(launch);
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

    /**
     * A hold on a message is half a second, as a long press is elsewhere: Enyo's 200ms default
     * came before a finger resting at the start of a scroll had moved, and started selecting.
     * Moving the finger still ends the hold (Enyo's moveTolerance), so a scroll never selects.
     * preventTap here is what stops the finger lifting after a hold from being a tap as well,
     * which picked the held message straight off again: the hold event's own preventTap() only
     * marks that event (enyo/gesture: makeEvent), not the down the tap comes from.
     */
    messageDown: function (inSender, inEvent) {
        if (inEvent && inEvent.configureHoldPulse) {
            inEvent.configureHoldPulse({ events: [{ name: "hold", time: HOLD_MS }], preventTap: true });
        }
    },

    /** Hold a message to start selecting with it; while selecting, a hold picks as a tap does. */
    handleMessageHold: function (inSender, inEvent) {
        var message = this.messageFor(inEvent);
        if (!message) {
            return false;
        }
        this.selectedMessage = message;
        if (this._selected) {
            this._selected = selection.toggle(this._selected, message);
            this.showSelection();
        } else {
            this.startSelection(message);
        }
        return true;
    },

    menuDelete: function () {
        return this.promptDelete([this.selectedMessage], false);
    },

    enterReply: function (message) {
        this.endEdit();
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
        this.endEdit();
        this.replyToMessage = null;
        this.$.replyBar.setShowing(false);
        this.relayout();
        return true;
    },

    // --- editing and deleting our own messages (util/chatActions) -----------------------------

    menuEdit: function () {
        if (this.selectedMessage) {
            this.enterEdit(this.selectedMessage);
        }
        return true;
    },

    /** Edit a message we sent: its text goes into the composer, and the bar above says so. */
    enterEdit: function (message) {
        this.cancelReply();
        this.editingMessage = message;
        var text = String(message.messageText || "");
        this.$.replyBarText.setContent("<b>" + $L("Edit Message") + "</b><br>" +
            messagingUtils.message.emojifyEscaped(messagingUtils.message.removeHtml(text).replace(/[\r\n]+/g, " ")));
        this.$.replyBar.setShowing(true);
        this.$.richText.set('value', text);
        this.growInput();
        this.$.richText.focus();
        this.relayout();
    },

    /** Stop editing; the old text the composer was given goes with it. */
    endEdit: function () {
        if (!this.editingMessage) {
            return;
        }
        this.editingMessage = null;
        this.$.richText.set('value', "");
        this.growInput();
    },

    /** Send the composer's text as the edit, and show it at once. */
    sendEdit: function () {
        var message = this.editingMessage;
        var text = this.$.richText.get('value') || "";
        if (!String(text).trim()) {
            return;   // an edit cannot empty a message; Delete does that
        }
        if (text !== message.messageText) {
            var thread = this.chatThread;
            var sent = this.sendImCommand(message.serviceName, function (kind, account) {
                return chatActions.editCommand(kind, account, chatActions.chatOf(message, thread), message, text);
            });
            if (!sent) {
                this.showError($L("Unable to edit"), $L("This message cannot be edited."));
                return;
            }
            this.mergeRecord({ _id: message._id, _kind: message._kind, messageText: text, edited: true });
        }
        this.cancelReply();
    },

    // --- groups ----------------------------------------------------------------------------

    openGroupInvite: function () {
        this.$.groupDialog.openInvite(this.chatThread);
        return true;
    },

    promptLeaveGroup: function () {
        if (!this.chatThread) {
            return true;
        }
        this.confirmAction = "leaveGroup";
        this.$.confirmDialogTitle.setContent($L("Leave Group"));
        this.$.confirmDialogMessage.setContent(
            $L("Leave {group}? Its new messages will no longer reach you.")
                .replace("{group}", this.chatThread.displayName || $L("this group")));
        this.$.confirmAcceptButton.setContent($L("Leave"));
        this.$.confirmDialog.show();
        return true;
    },

    leaveGroup: function () {
        var thread = this.chatThread;
        if (!thread) {
            return;
        }
        var sent = this.sendImCommand(thread.replyService, function (kind, account) {
            return chatActions.leaveCommand(kind, thread.replyService, account, thread.replyAddress);
        });
        if (!sent) {
            this.showError($L("Unable to leave"), $L("No account can leave this group."));
            return;
        }
        // We are no member now: nothing to add anyone to, nothing to leave (chatFlags.left).
        var m = chatFlags.merge(thread, { left: true });
        thread.flags = thread.flags || {};
        thread.flags.left = true;
        this.mergeThread(m);
        this.updateListButtons(thread);
        this.showListButtons(true);
        this.relayout();
    },

    // --- location and contact cards --------------------------------------------------------

    openAttachMenu: function () {
        this.$.stickerMenuItem.setShowing(!!this.sendActions().sticker);
        this.$.attachMenu.requestMenuShow(this, { activator: this.$.attachButton });
        return true;
    },

    /** What the service a message would go out on now can send besides text. */
    sendActions: function () {
        var transport = transportPicker.getSelectedTransport();
        var service = transport ? transport.serviceName : (this.chatThread && this.chatThread.replyService);
        return service ? chatActions.actionsFor(service, appState.accountService) : {};
    },

    /** Where we are goes only to whom it is meant for: ask first. */
    promptShareLocation: function () {
        if (!this.chatThread) {
            return true;
        }
        this.confirmAction = "sendLocation";
        this.$.confirmDialogTitle.setContent($L("Send My Location"));
        this.$.confirmDialogMessage.setContent($L("Send where you are now to this chat?"));
        this.$.confirmAcceptButton.setContent($L("Send"));
        this.$.confirmDialog.show();
        return true;
    },

    shareLocation: function () {
        if (this._locating) {
            return;
        }
        var self = this, threadId = this.chatThread && this.chatThread._id;
        var done = function (error, fix) {
            self._locating = null;
            if (!self.chatThread || self.chatThread._id !== threadId) {
                return;   // another chat by now
            }
            var loc = fix && chatActions.location(fix.latitude, fix.longitude);
            if (!loc) {
                self.showError($L("Location"), error || $L("Location unavailable."));
                return;
            }
            self.sendMessage({ text: chatActions.locationText(loc), fields: { location: loc } });
        };
        if (mockDb.enabled) {
            done(null, mockDb.location);
            return;
        }
        this._locating = deviceLocation.locate(this.bindSafely("locationCall"), {
            set: function (fn, ms) { return setTimeout(fn, ms); },
            clear: function (id) { clearTimeout(id); }
        }, done);
    },

    /** One call to the location service, for deviceLocation. */
    locationCall: function (method, params, onReply, onError) {
        var request = new ServiceRequest({
            service: "luna://com.webos.service.location", method: method, subscribe: !!params.subscribe
        });
        request.response(function (inSender, inResponse) { onReply(inResponse); });
        request.error(function (inSender, inError) { onError(inError); });
        request.go(params);
        return request;
    },

    cancelLocating: function () {
        if (this._locating) {
            this._locating();
            this._locating = null;
        }
    },

    openContactPicker: function () {
        this.$.contactPicker.show();
        this.$.contactList.reload();
        return true;
    },

    closeContactPicker: function () {
        this.$.contactPicker.hide();
        return true;
    },

    /** Send a contact as a card: all their numbers and addresses, not only the one tapped. */
    contactPicked: function (inSender, inEvent) {
        var entry = inEvent && inEvent.msgAddr;
        var attrs = (entry && (entry.attributes || entry)) || {};
        var person = this.$.contactList.personFor(entry);
        var contact = {
            name: attrs.displayName,
            phoneNumbers: person ? person.get('phoneNumbers') : (attrs.isPhone ? [{ value: attrs.value }] : []),
            emails: person ? person.get('emails') : []
        };
        this.$.contactPicker.hide();
        var card = chatActions.contactCard(contact);
        if (!card) {
            this.showError($L("Contact"), $L("This contact has no number or address to send."));
            return true;
        }
        // Kept with the card, so a tap on it shows this person in Contacts (sentExtras).
        var personId = person && person.get('_id');
        if (typeof personId === "string" && personId) {
            card.personId = personId;
        }
        this.sendMessage({ text: chatActions.contactText(contact), fields: { contactCard: card } });
        return true;
    },

    // --- stickers --------------------------------------------------------------------------

    /**
     * The stickers this chat has, at once, and those in the media index as soon as db8 answers.
     * Off the device the mock store stands in for the index.
     */
    openStickerPicker: function () {
        if (!this.chatThread) {
            return true;
        }
        this._stickersFromIndex = null;   // not answered yet: "no stickers" would be early
        this.renderStickers();
        this.$.stickerPicker.show();
        var query = stickers.indexQuery();
        if (mockDb.enabled) {
            setTimeout(this.gotStickerIndex.bind(this, null, mockDb.find(query)), 0);
        } else {
            this.$.stickerFind.send({ query: query });
        }
        return true;
    },

    gotStickerIndex: function (inSender, inResponse) {
        if (!this.$.stickerPicker.showing) {
            return true;
        }
        this._stickersFromIndex = stickers.fromIndex(inResponse && inResponse.results);
        this.renderStickers();
        return true;
    },

    /** No index to read (no mediaindexer, no grant): the chat's own stickers are still there. */
    stickerIndexFailed: function (inSender, inError) {
        this.warn("sticker index:", inError && (inError.errorText || inError));
        this._stickersFromIndex = [];
        if (this.$.stickerPicker.showing) {
            this.renderStickers();
        }
        return true;
    },

    renderStickers: function () {
        var messages = this.collection.map(function (m) { return m.attributes; });
        var list = stickers.merge([stickers.fromMessages(messages), this._stickersFromIndex || []]);
        var grid = this.$.stickerGrid;
        grid.destroyClientControls();
        for (var i = 0; i < list.length; i++) {
            grid.createComponent({
                classes: "sticker-picker-cell", stickerPath: list[i].path, ontap: "stickerPicked",
                components: [{
                    kind: Image, classes: "sticker-picker-image", src: stickers.src(list[i].path),
                    onerror: "stickerImageFailed"
                }]
            }, { owner: this });
        }
        this.$.stickerEmpty.setShowing(!list.length && !!this._stickersFromIndex);
        if (grid.hasNode()) {
            grid.render();
        }
    },

    /** A file gone since it was sent or indexed is not offered. */
    stickerImageFailed: function (inSender) {
        if (inSender.parent) {
            inSender.parent.hide();
        }
        return true;
    },

    /** Goes at once, alone: whatever is typed stays in the composer. */
    stickerPicked: function (inSender) {
        var cell = inSender && inSender.stickerPath ? inSender : inSender && inSender.parent;
        var path = cell && cell.stickerPath;
        this.$.stickerPicker.hide();
        if (!path) {
            return true;
        }
        this.sendMessage({ text: "", file: stickers.asAttachment(path) });
        return true;
    },

    closeStickerPicker: function () {
        this.$.stickerPicker.hide();
        return true;
    },

    // --- mentions --------------------------------------------------------------------------

    /**
     * The people of this chat, to show in Group Info and to mention: the transport's member list
     * once it has given one for this chat, else who has written in it (util/groupInfo).
     */
    chatMembersPick: function () {
        var writers = chatActions.groupMembers(this.collection.map(function (m) { return m.attributes; }));
        var known = this._chatMembers;
        var thread = this.chatThread;
        return groupInfo.pick(known && thread && known.threadId === thread._id ? known.members : null, writers);
    },

    chatMembers: function () {
        return this.chatMembersPick().members;
    },

    /**
     * Ask the transport who is in this chat (getChatMembers); done() once it answered, also when
     * it could not. False, and done() never called, when there is no one to ask (no account). An
     * answer for a chat no longer open is dropped.
     */
    loadChatMembers: function (done) {
        var thread = this.chatThread;
        var accountService = appState.accountService;
        var account = thread && accountService ? accountService.getAccount(thread.replyService) : null;
        var payload = groupInfo.request(thread, account);
        if (!payload) {
            return false;   // nothing to ask: who has written is all there is
        }
        var self = this, threadId = thread._id, serviceName = thread.replyService;
        this._membersLoading = threadId;
        var finish = function (reply) {
            if (self._membersLoading === threadId) {
                self._membersLoading = null;
            }
            if (!self.chatThread || self.chatThread._id !== threadId) {
                return;
            }
            self._chatMembers = { threadId: threadId, members: groupInfo.fromReply(reply, account, serviceName) };
            if (done) {
                done();
            }
        };
        if (mockDb.enabled) {
            mockDb.presenceCalls = mockDb.presenceCalls || [];
            mockDb.presenceCalls.push({ method: "getChatMembers", payload: payload });
            var reply = mockDb.chatMembers && mockDb.chatMembers[payload.usernameTo];
            setTimeout(function () { finish(reply || null); }, 0);
            return true;
        }
        // An older transport has no getChatMembers: its error leaves who has written.
        var request = new ServiceRequest({ service: "luna://com.palm.imlibpurple", method: "getChatMembers" });
        request.response(function (inSender, inResponse) { finish(inResponse); });
        request.error(function () { finish(null); });
        request.go(payload);
        return true;
    },

    // --- Group Info ------------------------------------------------------------------------

    openGroupInfo: function () {
        var thread = this.chatThread;
        if (!thread) {
            return;
        }
        var pick = this.chatMembersPick();
        this.$.groupInfo.open({
            title: thread.displayName || thread.replyAddress,
            serviceHtml: this.withServiceIcon(thread.replyService,
                transportPicker.serviceNameFor({ serviceName: thread.replyService })),
            members: pick.members, fromService: pick.fromService, loading: true,
            canAdd: !!this.$.groupAddButton.showing, canLeave: !!this.$.groupLeaveButton.showing,
            canRemove: this.canRemoveMembers(thread),
            canRename: this.canRenameGroup(thread)
        });
        var self = this, threadId = thread._id;
        var asked = this.loadChatMembers(function () {
            if (self.$.groupInfo.showing && self.chatThread && self.chatThread._id === threadId) {
                var now = self.chatMembersPick();
                self.$.groupInfo.setMembers(now.members, now.fromService, false);
            }
        });
        if (!asked) {
            this.$.groupInfo.setMembers(pick.members, pick.fromService, false);
        }
    },

    /** Whether Group Info offers to take members out: a group we are in, on a service that can. */
    canRemoveMembers: function (thread) {
        var actions = thread ? chatActions.actionsFor(thread.replyService, appState.accountService) : {};
        return !!(this.$.groupLeaveButton.showing && actions.groupRemove);
    },

    /** Whether Group Info offers Rename: a group we are in, on a service that can. */
    canRenameGroup: function (thread) {
        var actions = thread ? chatActions.actionsFor(thread.replyService, appState.accountService) : {};
        return !!(this.$.groupLeaveButton.showing && actions.groupRename);
    },

    /**
     * A new name given in Group Info: the transport renames the group (renameGroup). The header
     * says it at once; the chat's own record follows when the service tells the transport.
     */
    groupRename: function (inSender, inEvent) {
        var name = inEvent && inEvent.name, thread = this.chatThread;
        if (!name || !thread) {
            return true;
        }
        var sent = this.sendImCommand(thread.replyService, function (kind, account) {
            return chatActions.renameCommand(kind, thread.replyService, account, thread.replyAddress, name);
        });
        if (!sent) {
            this.showError($L("Unable to rename"), $L("No account can rename this group."));
            return true;
        }
        this.setHeaderName(name);
        return true;
    },

    /**
     * A member swiped and confirmed in Group Info: the transport takes them out (removeFromGroup).
     * They leave the list at once; the transport is asked again shortly, so one the service kept
     * (we are no admin, and the plugin says so in the chat) comes back.
     */
    groupRemoveMember: function (inSender, inEvent) {
        var member = inEvent && inEvent.member, thread = this.chatThread;
        if (!member || !thread) {
            return true;
        }
        var sent = this.sendImCommand(thread.replyService, function (kind, account) {
            return chatActions.removeCommand(kind, thread.replyService, account, thread.replyAddress, [member.id]);
        });
        if (!sent) {
            this.showError($L("Unable to remove"), $L("No account can remove members from this group."));
            return true;
        }
        var known = this._chatMembers;
        if (known && known.threadId === thread._id) {
            known.members = known.members.filter(function (m) { return m.id !== member.id; });
        }
        var pick = this.chatMembersPick();
        this.$.groupInfo.setMembers(pick.members, pick.fromService, false);
        var self = this, threadId = thread._id;
        clearTimeout(this._membersRecheck);
        this._membersRecheck = setTimeout(function () {
            if (self.$.groupInfo.showing && self.chatThread && self.chatThread._id === threadId) {
                self.loadChatMembers(function () {
                    var now = self.chatMembersPick();
                    self.$.groupInfo.setMembers(now.members, now.fromService, false);
                });
            }
        }, mockDb.enabled ? 50 : 4000);
        return true;
    },

    /** A member tapped in Group Info: a 1:1 with them, as a tapped group sender opens one. */
    groupMemberChat: function (inSender, inEvent) {
        var member = inEvent && inEvent.member;
        if (member && this.chatThread) {
            this.doSelectSender({ person: groupInfo.chatPerson(member, this.chatThread.replyService) });
        }
        return true;
    },

    /** Launch an app (launchApp), or in the mock note what would have been launched. */
    launch: function (params) {
        if (mockDb.enabled) {
            mockDb.launches = mockDb.launches || [];
            mockDb.launches.push(params);
            return;
        }
        this.$.launchApp.send(params);
    },

    /** Contacts offers a new contact for them, or to add them to one there is. */
    groupMemberContact: function (inSender, inEvent) {
        var launch = inEvent && inEvent.member && this.chatThread &&
            groupInfo.contactLaunch(inEvent.member, this.chatThread.replyService);
        if (!launch) {
            return true;
        }
        if (mockDb.enabled) {
            mockDb.launches = mockDb.launches || [];
            mockDb.launches.push(launch);
            return true;
        }
        this.$.launchApp.send(launch);
        return true;
    },

    /** An "@" typed in a group or channel whose service mentions: offer who it may be. */
    updateMentionMenu: function () {
        var thread = this.chatThread;
        var node = this.$.richText.hasNode();
        var actions = thread ? chatActions.actionsFor(thread.replyService, appState.accountService) : {};
        var inGroup = chatActions.isGroupThread(thread) || !!(thread && thread.channelId);
        var query = (actions.mentions && inGroup && node) ? chatActions.mentionQuery(node.value, node.selectionStart) : null;
        // The transport's member list for this chat, asked for once, at the first "@".
        if (query && thread && (!this._chatMembers || this._chatMembers.threadId !== thread._id) &&
                this._membersLoading !== thread._id) {
            if (!this.loadChatMembers(this.bindSafely("updateMentionMenu"))) {
                this._chatMembers = { threadId: thread._id, members: [] };
            }
        }
        var members = query ? chatActions.mentionCandidates(this.chatMembers(), query.query) : [];
        this._mentionQuery = query;
        var menu = this.$.mentionMenu;
        if (!members.length) {
            if (menu.showing) {
                menu.hide();
            }
            return;
        }
        menu.destroyClientControls();
        for (var i = 0; i < members.length; i++) {
            menu.createComponent({
                kind: MenuItem, allowHtml: true, member: members[i],
                content: messagingUtils.message.emojifyEscaped(members[i].name)
            }, { owner: this });
        }
        menu.render();
        if (!menu.showing) {
            menu.requestMenuShow(this, { activator: this.$.richText });
        }
    },

    mentionPicked: function (inSender, inEvent) {
        var member = inEvent && inEvent.originator && inEvent.originator.member;
        var node = this.$.richText.hasNode();
        var query = this._mentionQuery;
        this._mentionQuery = null;
        if (!member || !query || !node) {
            return true;
        }
        var result = chatActions.insertMention(node.value, node.selectionStart, query, member);
        this.$.richText.set('value', result.text);
        node.value = result.text;
        node.setSelectionRange(result.caret, result.caret);
        this.$.richText.focus();
        this.pickedMentions = (this.pickedMentions || []).concat([member]);
        this.growInput();
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

    /** SMS cannot carry a file (no MMS sender, util/fileCarrier); say so before one is picked. */
    attachmentsUnsupported: function () {
        var transport = transportPicker.getSelectedTransport();
        if (transport && !fileCarrier.canCarry(transport.serviceName)) {
            this.showSmsAttachmentsError();
            return true;
        }
        return false;
    },

    showSmsAttachmentsError: function () {
        this.showError($L("Attachments"), $L("Attachments can't be sent by SMS. Pick an IM service to send a file."));
    },

    // The picker sends an array of {fullPath, attachmentType, size, ...}, several when more
    // than one was picked.
    attachmentChosen: function (inSender, inEvent) {
        var files = Array.isArray(inEvent) ? inEvent : (inEvent && inEvent.files);
        this.stageAttachments(attachments.fromPicked(files));
        return true;
    },

    stageAttachment: function (attachment) {
        this.stageAttachments([attachment]);
    },

    stageAttachments: function (more) {
        if (!more.length) {
            return;
        }
        var r = attachments.add(this.outboundAttachments, more);
        this.outboundAttachments = r.list;
        this.renderAttachmentChips();
        if (r.dropped) {
            this.showError($L("Attachments"),
                $L("Up to {max} files can go at once.").replace("{max}", attachments.MAX));
        }
    },

    /** A chip per staged file: a thumbnail for a picture, its name, and an X to take it off. */
    renderAttachmentChips: function () {
        var box = this.$.attachmentChips;
        box.destroyClientControls();
        for (var i = 0; i < this.outboundAttachments.length; i++) {
            var a = this.outboundAttachments[i];
            var parts = [];
            if (a.type === "image") {
                parts.push({ kind: Image, classes: "attachment-chip-thumb", src: "file://" + a.path });
            }
            parts.push({ classes: "attachment-chip-label", content: a.name });
            parts.push({
                kind: IconButton, src: "assets/icon-decline.svg", attachmentIndex: i,
                ontap: "removeAttachment"
            });
            box.createComponent({ classes: "attachment-chip", components: parts }, { owner: this });
        }
        box.setShowing(this.outboundAttachments.length > 0);
        if (box.hasNode()) {
            box.render();
        }
        this.relayout();
    },

    removeAttachment: function (inSender) {
        this.outboundAttachments = attachments.remove(this.outboundAttachments, inSender.attachmentIndex);
        this.renderAttachmentChips();
        return true;
    },

    clearAttachment: function () {
        this.outboundAttachments = [];
        this.renderAttachmentChips();
        return true;
    },

    // --- take photo ------------------------------------------------------------------------

    /**
     * The Camera app takes the photo; when Messaging is back in front, the photos it took since are
     * staged like picked files (cameraCapture says why it goes this way round).
     */
    takePhoto: function () {
        if (!this.chatThread || this.attachmentsUnsupported()) {
            return true;
        }
        this.cancelTakePhoto();
        this.photoRequest = cameraCapture.request(this.chatThread._id, Date.now());
        var launch = cameraCapture.launch();
        if (mockDb.enabled) {
            mockDb.launches = mockDb.launches || [];
            mockDb.launches.push(launch);
            return true;
        }
        this.$.launchApp.send(launch);
        return true;
    },

    /**
     * Back in front: look for the photos. The indexer files a new one a moment after the Camera
     * app writes it, so look again a few times before leaving the request for the next return.
     */
    cameraReturned: function () {
        var req = this.photoRequest;
        if (!req) {
            return;
        }
        if (cameraCapture.expired(req, Date.now()) || !this.chatThread || this.chatThread._id !== req.threadId) {
            this.cancelTakePhoto();
            return;
        }
        var self = this, tries = 0;
        this.cancelPhotoLookup();
        var look = function () {
            self._photoTimer = null;
            self.photoFind(cameraCapture.query(req), function (error, results) {
                if (self.destroyed || self.photoRequest !== req) {
                    return;
                }
                var found = error ? [] : cameraCapture.photos(results, req);
                if (found.length) {
                    self.photoRequest = null;
                    self.stageAttachments(found);
                } else if (++tries < 4) {
                    self._photoTimer = setTimeout(look, 1000);
                }
            });
        };
        look();
    },

    /** One find on the media index: done(error, results). */
    photoFind: function (query, done) {
        if (mockDb.enabled) {
            var found = mockDb.find(query);
            setTimeout(function () { done(null, found.results); }, 0);
            return;
        }
        var request = new ServiceRequest({ service: DB_SERVICE, method: "find" });
        request.response(function (inSender, inResponse) { done(null, inResponse && inResponse.results); });
        request.error(function (inSender, inError) { done(inError || "service error"); });
        request.go({ query: query });
    },

    cancelPhotoLookup: function () {
        if (this._photoTimer) {
            clearTimeout(this._photoTimer);
            this._photoTimer = null;
        }
    },

    cancelTakePhoto: function () {
        this.cancelPhotoLookup();
        this.photoRequest = null;
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

    closeConfirmDialog: function () {
        this.$.confirmDialog.hide();
        this.confirmAction = null;
        return true;
    },

    confirmAccepted: function () {
        this.$.confirmDialog.hide();
        if (this.confirmAction === "leaveGroup") {
            this.leaveGroup();
        } else if (this.confirmAction === "sendLocation") {
            this.shareLocation();
        }
        this.confirmAction = null;
        return true;
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
