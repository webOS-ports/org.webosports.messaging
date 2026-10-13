/**
 * The right-hand pane: an empty placeholder, the compose view, or a conversation.
 * Ported from com.palm.app.messaging/app/ChatView.js.
 */

var kind = require('enyo/kind'),
    Panels = require('layout/Panels'),
    CardArranger = require('layout/CardArranger'),
    FittableRows = require('layout/FittableRows'),
    Toolbar = require('onyx/Toolbar'),
    Image = require('enyo/Image'),
    LunaService = require('enyo-webos/LunaService'),
    ConversationList = require('./ConversationList'),
    ComposeView = require('./ComposeView'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';

/** The idle pane shown before any conversation is opened. */
var DefaultView = kind({
    name: "DefaultView",
    kind: FittableRows,
    classes: "conversation-pane",
    components: [
        { kind: Toolbar, classes: "conversation-header" },
        { classes: "header-shadow" },
        {
            fit: true, classes: "body-placeholder flex-column",
            style: "justify-content: center; align-items: center;",
            components: [
                { kind: Image, src: "assets/icon-165x165.svg" },
                {
                    style: "text-align: center; color: #797979; margin-top: 1rem;",
                    content: $L("Select a conversation to see its messages.")
                }
            ]
        },
        { classes: "footer-shadow footer-app-shadow" },
        { kind: Toolbar, classes: "conversation-bottom" }
    ]
});

module.exports = kind({
    name: "ChatView",
    kind: Panels,
    arrangerKind: CardArranger,
    draggable: false,
    // Mojo's ChatView Pane used transitions.Simple: an instant swap, no cross-fade.
    animate: false,
    classes: "conversation-pane",

    published: {
        chatThread: null,
        params: null,
        loginStates: []
    },

    events: {
        onSelectThread: "",
        onClearUnreadCount: ""
    },

    components: [
        { name: "defaultView", kind: DefaultView },
        {
            name: "composeView", kind: ComposeView,
            onOpenConversation: "openConversationById", onCancelCompose: "closeCompose"
        },
        {
            name: "conversationList", kind: ConversationList,
            onCloseConversationList: "closeConversationList",
            onSelectThread: "relaySelectThread",
            onClearUnreadCount: "doClearUnreadCount",
            onOpenComposeView: "openComposeView",
            onSelectSender: "openConversationWithSender"
        },
        {
            name: 'dbGetById', kind: LunaService, service: DB_SERVICE, method: 'get',
            onResponse: 'gotRecordById', onError: 'serviceErr'
        },
        {
            name: 'senderThreadFind', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'senderThreadFound', onError: 'serviceErr'
        },
        {
            name: 'senderThreadCreate', kind: LunaService, service: DB_SERVICE, method: 'put',
            onResponse: 'senderThreadCreated', onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this._pendingSender = null;
        this.setIndex(0);
    },

    // --- view switching --------------------------------------------------------------------

    getViewName: function () {
        return ["defaultView", "composeView", "conversationList"][this.getIndex()];
    },

    selectViewByName: function (name) {
        var index = ["defaultView", "composeView", "conversationList"].indexOf(name);
        if (index >= 0) {
            this.setIndex(index);
        }
    },

    setChatThread: function (thread) {
        this.chatThread = thread;
        if (thread) {
            this.selectViewByName("conversationList");
        }
        this.$.conversationList.setChatThread(thread);
    },

    setDeletedChatThread: function (inThread) {
        this.$.conversationList.setDeletedChatThread(inThread);
    },

    threadLocked: function (inThread) {
        this.$.conversationList.threadLocked(inThread);
    },

    loginStatesChanged: function () {
        this.$.conversationList.setLoginStates(this.loginStates);
        this.$.composeView.setLoginStates(this.loginStates);
    },

    closeConversationList: function () {
        if (this.getViewName() === "conversationList") {
            this.selectViewByName("defaultView");
        }
        return true;
    },

    openComposeView: function (inSender, inEvent) {
        if (inEvent && inEvent.params) {
            this.$.composeView.set('params', inEvent.params);
        } else {
            this.$.composeView.reset();
        }
        this.selectViewByName("composeView");
        return true;
    },

    closeCompose: function () {
        this.selectViewByName(this.chatThread ? "conversationList" : "defaultView");
        return true;
    },

    relaySelectThread: function (inSender, inEvent) {
        this.doSelectThread(inEvent);
        return true;
    },

    // --- opening by id ---------------------------------------------------------------------

    openConversationById: function (inSender, inEvent) {
        var threadId = inEvent && inEvent.threadId;
        if (!threadId) {
            return true;
        }
        this.fetchRecord(threadId);
        return true;
    },

    fetchRecord: function (id) {
        if (mockDb.enabled) {
            this.gotRecordById(null, mockDb.get([id]));
            return;
        }
        this.$.dbGetById.send({ ids: [id] });
    },

    gotRecordById: function (inSender, inResponse) {
        var record = inResponse && inResponse.results && inResponse.results[0];
        if (!record) {
            return true;
        }
        if (record._kind === messagingUtils.thread.dbKind) {
            if (!this.chatThread || this.chatThread._id !== record._id) {
                this.setChatThread(record);
                this.doSelectThread({ thread: record });
            }
        }
        return true;
    },

    /**
     * Open a 1:1 with a tapped group-message sender: find an existing chatthread by the sender's
     * address, else create one.
     */
    openConversationWithSender: function (inSender, inEvent) {
        var person = inEvent && inEvent.person;
        if (!person || !person.username) {
            return true;
        }
        this._pendingSender = person;

        var query = {
            from: messagingUtils.thread.dbKind,
            where: [{
                prop: "normalizedAddress", op: "=",
                val: messagingUtils.utils.normalizeAddress(person.username, person.serviceName)
            }]
        };
        if (mockDb.enabled) {
            this.senderThreadFound(null, mockDb.find(query));
        } else {
            this.$.senderThreadFind.send({ query: query });
        }
        return true;
    },

    senderThreadFound: function (inSender, inResponse) {
        var results = (inResponse && inResponse.results) || [];
        if (results.length > 0) {
            this.setChatThread(results[0]);
            this.doSelectThread({ thread: results[0] });
            this._pendingSender = null;
            return true;
        }

        var p = this._pendingSender || {};
        var thread = {
            _kind: messagingUtils.thread.dbKind,
            timestamp: new Date().getTime(),
            displayName: p.displayName || p.username,
            replyAddress: p.username,
            normalizedAddress: messagingUtils.utils.normalizeAddress(p.username, p.serviceName),
            replyService: p.serviceName,
            summary: "",
            flags: { visible: false }
        };

        if (mockDb.enabled) {
            this.senderThreadCreated(null, mockDb.merge([thread]));
        } else {
            this.$.senderThreadCreate.send({ objects: [thread] });
        }
        return true;
    },

    senderThreadCreated: function (inSender, inResponse) {
        var id = inResponse && inResponse.results && inResponse.results[0] && inResponse.results[0].id;
        if (id) {
            this.fetchRecord(id);
        }
        this._pendingSender = null;
        return true;
    },

    /** Launch parameters that name a recipient or body open the compose view pre-filled. */
    preHandleLaunch: function (params) {
        if (!params) {
            return;
        }
        var accountService = appState.accountService;
        var addr = (params.ims && params.ims[0]) || (params.phoneNumbers && params.phoneNumbers[0]);

        if (addr && accountService) {
            var serviceName = addr.serviceName || addr.type;
            if (!accountService.getAccount(serviceName)) {
                this.$.composeView.showNotice($L("Unable to launch chat"),
                    messagingUtils.utils.isTextMessage(serviceName) ?
                        $L("SMS capability is required.") :
                        $L("You have not set up an IM account of this type."));
                return;
            }
        }

        this.$.composeView.reset();
        this.$.composeView.set('params', params);
        this.selectViewByName("composeView");
    },

    serviceErr: function (inSender, inError) {
        this.error("chat view service failed:", inError && (inError.errorText || inError));
        return true;
    },

    resize: function () {
        this.inherited(arguments);
    },

    windowHiddenHandler: function () {
        this.$.conversationList.windowHiddenHandler();
    }
});
