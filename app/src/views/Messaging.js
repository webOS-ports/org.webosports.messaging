/**
 * The left pane: presence bar, the four-tab strip, the tab's list, and a contextual bottom toolbar.
 * Ported from com.palm.app.messaging/app/Messaging.js.
 *
 * Tab values are 0..3 (Chats, Buddies, Favorites, Servers) and drive the pane index directly. The
 * Servers tab is moved to the LEFT visually with CSS ordering rather than by reordering the
 * components, so the value routing stays correct.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    Panels = require('layout/Panels'),
    CardArranger = require('layout/CardArranger'),
    Toolbar = require('onyx/Toolbar'),
    RadioGroup = require('onyx/RadioGroup'),
    Button = require('onyx/Button'),
    LunaService = require('enyo-webos/LunaService'),
    cancelRequests = require('../util/cancelRequests'),
    ImStatus = require('./ImStatus'),
    ThreadList = require('./ThreadList'),
    BuddyList = require('./BuddyList'),
    FavoriteList = require('./FavoriteList'),
    ServerList = require('./ServerList'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';

var TAB_CHATS = 0, TAB_BUDDIES = 1, TAB_FAVORITES = 2, TAB_SERVERS = 3;

module.exports = kind({
    name: "Messaging",
    kind: FittableRows,
    classes: "messaging-pane",

    events: {
        onSelectThread: "",
        onDeleteThread: "",
        onThreadLocked: "",
        onOpenComposeView: "",
        onNewBuddy: "",
        onNewFavorite: "",
        onLoginStatesChange: "",
        onAddAccount: "",
        onOpenAppMenu: ""
    },

    components: [
        {
            kind: Toolbar, classes: "messaging-availability", components: [
                {
                    name: "imStatus", kind: ImStatus,
                    onLoginStatesChange: "loginStatesChange", onAddAccount: "doAddAccount"
                }
            ]
        },
        {
            name: "tabs", kind: RadioGroup, classes: "messaging-radiobuttons",
            controlClasses: "onyx-tabbutton", onActivate: "tabActivated",
            components: [
                // Keep these in value order: RadioGroup routes by control index, so the Chats
                // button must stay first even though Servers is shown leftmost (see the CSS order).
                {
                    name: "chatsTab", value: TAB_CHATS, active: true, components: [
                        { classes: "tab-button-icon chat-button" },
                        { name: "unreadCountText", classes: "chat-button-text" }
                    ]
                },
                {
                    name: "buddiesTab", value: TAB_BUDDIES, components: [
                        { classes: "tab-button-icon buddies-button" }
                    ]
                },
                {
                    name: "favoritesTab", value: TAB_FAVORITES, components: [
                        { classes: "tab-button-icon favorites-button" }
                    ]
                },
                {
                    name: "serversTab", value: TAB_SERVERS, classes: "servers-tab-left", components: [
                        { classes: "tab-button-icon servers-button" }
                    ]
                }
            ]
        },
        {
            name: "pane", kind: Panels, arrangerKind: CardArranger, fit: true, draggable: false,
            components: [
                {
                    name: "threadList", kind: ThreadList,
                    onSelectThread: "doSelectThread", onDeleteThread: "doDeleteThread",
                    onThreadLocked: "doThreadLocked", onUnreadCountChanged: "updateUnreadCount"
                },
                {
                    name: "buddyList", kind: BuddyList,
                    onSelectBuddy: "personSelected", onDeleteThread: "doDeleteThread"
                },
                { name: "favoriteList", kind: FavoriteList, onSelectFavorite: "personSelected" },
                {
                    name: "serverList", kind: ServerList,
                    onSelectThread: "doSelectThread", onServerDrill: "serverDrillChanged"
                }
            ]
        },
        { classes: "footer-shadow footer-app-shadow" },
        {
            kind: Toolbar, classes: "flex-row", components: [
                {
                    name: "serverBackBtn", kind: Button, content: $L("Servers"),
                    ontap: "serverBack", showing: false
                },
                {
                    name: "conversationBtn", kind: Button, content: $L("New Conversation"),
                    ontap: "doOpenComposeView"
                },
                { name: "buddyBtn", kind: Button, content: $L("Add Buddy"), ontap: "doNewBuddy", showing: false },
                {
                    name: "favoriteBtn", kind: Button, content: $L("Add Favorite"),
                    ontap: "doNewFavorite", showing: false
                },
                { classes: "flex-auto" },
                // Mojo opened the app menu from the system menu bar; Enyo 2 has no equivalent hook,
                // so the menu needs an affordance inside the app.
                { name: "appMenuBtn", kind: Button, content: "≡", ontap: "doOpenAppMenu" }
            ]
        },
        {
            name: 'findThread', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'threadFound', onError: 'threadServiceErr'
        },
        {
            name: 'createThread', kind: LunaService, service: DB_SERVICE, method: 'put',
            onResponse: 'threadCreated', onError: 'threadServiceErr'
        },
        {
            name: 'threadGetter', kind: LunaService, service: DB_SERVICE, method: 'get',
            onResponse: 'threadFound', onError: 'threadServiceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this._curTab = TAB_CHATS;
        this.person = null;
        this.buttons = [this.$.conversationBtn, this.$.buddyBtn, this.$.favoriteBtn];
    },

    // --- tabs ----------------------------------------------------------------------------

    tabActivated: function (inSender, inEvent) {
        if (inEvent && inEvent.originator && inEvent.originator.active) {
            var value = inEvent.originator.value;
            this.menuToggle(this, value === undefined ? 0 : value);
        }
        return true;
    },

    menuToggle: function (inSender, inValue) {
        this._curTab = inValue;
        this.$.pane.setIndex(inValue);
        this.updateButtons(inValue);
        this.refreshList(inValue);
    },

    highlightTabButton: function (inValue) {
        var tabs = [this.$.chatsTab, this.$.buddiesTab, this.$.favoritesTab, this.$.serversTab];
        if (tabs[inValue]) {
            this.$.tabs.setActive(tabs[inValue]);
        }
    },

    updateButtons: function (index) {
        for (var i = 0; i < this.buttons.length; i++) {
            this.buttons[i].setShowing(i === index);
        }
        // The Servers back button is not tab-indexed: it belongs to the Servers tab, and only while
        // drilled into a server's channels.
        this.$.serverBackBtn.setShowing(
            (index === TAB_SERVERS) && this.$.serverList && this.$.serverList.isDrilledIn());
    },

    serverBack: function () {
        this.$.serverList.showServers();
        return true;
    },

    serverDrillChanged: function (inSender, inEvent) {
        this.$.serverBackBtn.setShowing(
            (this._curTab === TAB_SERVERS) && !!(inEvent && inEvent.drilledIn));
        return true;
    },

    /** A list that was hidden loses its scroll position, so refresh it when it comes back. */
    refreshList: function (inValue) {
        var lists = [this.$.threadList, this.$.buddyList, this.$.favoriteList, this.$.serverList];
        if (inValue === undefined) {
            for (var i = 0; i < lists.length; i++) {
                lists[i].updateList();
            }
        } else if (lists[inValue]) {
            lists[inValue].updateList();
        }
    },

    updateUnreadCount: function (inSender, inEvent) {
        var count = (inEvent && inEvent.count) || 0;
        this.$.chatsTab.addRemoveClass("chat-button-plus", count > 99);
        this.$.unreadCountText.setContent(count > 99 ? "99" : (count || ""));
        return true;
    },

    // --- login states --------------------------------------------------------------------

    loginStatesChange: function (inSender, inEvent) {
        var states = (inEvent && inEvent.loginStates) || [];
        this.doLoginStatesChange({ loginStates: states });
        this.$.buddyList.setLoginStates(states);
        // Servers show each account's online dot from these states AND resolve their connector logo
        // from the account-types hash, which is empty until accounts load; setLoginStates repaints
        // the rows, covering both.
        this.$.serverList.setLoginStates(states);
        return true;
    },

    // --- opening a conversation for a person ----------------------------------------------

    personSelected: function (inSender, inEvent) {
        this.person = (inEvent && (inEvent.buddy || inEvent.favorite)) || null;
        if (this.person) {
            this.findThread();
        }
        return true;
    },

    findThread: function () {
        var query = { from: messagingUtils.thread.dbKind };

        if (this.person.personId) {
            query.where = [{ prop: "personId", op: "=", val: this.person.personId }];
        } else {
            // With no person id, fall back to matching on the normalized address.
            query.where = [{
                prop: "normalizedAddress", op: "=",
                val: messagingUtils.utils.normalizeAddress(this.person.username, this.person.serviceName)
            }];
        }

        if (mockDb.enabled) {
            this.threadFound(null, mockDb.find(query));
            return;
        }
        cancelRequests(this.$.findThread);
        this.$.findThread.send({ query: query });
    },

    threadFound: function (inSender, inResponse) {
        var threads = (inResponse && inResponse.results) || [];
        if (threads.length > 0) {
            this.doSelectThread({ thread: threads[0] });
        } else {
            this.createThread();
        }
        return true;
    },

    createThread: function () {
        var p = this.person;
        if (!p) {
            return;
        }
        var thread = {
            _kind: messagingUtils.thread.dbKind,
            timestamp: new Date().getTime(),
            personId: p.personId,
            displayName: p.displayName || p.username,
            replyAddress: p.username,
            normalizedAddress: messagingUtils.utils.normalizeAddress(p.username, p.serviceName),
            replyService: p.serviceName,
            summary: "",
            // Not visible in the conversations list until it actually carries a message.
            flags: { visible: false }
        };

        if (mockDb.enabled) {
            this.threadCreated(null, mockDb.merge([thread]));
            return;
        }
        this.$.createThread.send({ objects: [thread] });
    },

    threadCreated: function (inSender, inResponse) {
        if (inResponse && inResponse.returnValue && inResponse.results && inResponse.results.length > 0) {
            var id = inResponse.results[0].id;
            if (mockDb.enabled) {
                this.threadFound(null, mockDb.get([id]));
            } else {
                this.$.threadGetter.send({ ids: [id] });
            }
        }
        return true;
    },

    threadServiceErr: function (inSender, inError) {
        this.error("thread lookup failed:", inError && (inError.errorText || inError));
        return true;
    },

    // --- shell plumbing -------------------------------------------------------------------

    setOfflinePrefs: function (prefs) {
        this.$.buddyList.set('showOffline', !prefs.showOnlineBuddiesOnly);
    },

    setSelection: function (chatThread) {
        this.$.threadList.setSelection(chatThread);
        this.$.buddyList.setSelection(chatThread);
        this.$.favoriteList.setSelection(chatThread);
        this.$.serverList.setSelection(chatThread);
    },

    windowHiddenHandler: function () {
        // Return to the conversations tab so re-opening the app lands somewhere predictable.
        this.menuToggle(this, TAB_CHATS);
        this.highlightTabButton(TAB_CHATS);

        this.$.threadList.windowHiddenHandler();
        this.$.buddyList.windowHiddenHandler();
        this.$.favoriteList.windowHiddenHandler();
        this.$.serverList.windowHiddenHandler();
        this.$.imStatus.windowHiddenHandler();
    },

    windowShownHandler: function () {
        // Re-arm every list's db subscription.
        this.$.threadList.resetList();
        this.$.buddyList.resetList();
        this.$.favoriteList.resetList();
        this.$.serverList.resetList();
    }
});
