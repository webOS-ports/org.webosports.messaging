/**
 * The conversations list.
 * Ported from com.palm.app.messaging/app/threads/ThreadList.js.
 *
 * Mojo's DbList paged through db8 itself; here ThreadService runs the joined query and the results
 * fill a plain Collection that a DataList renders. Date-bucket dividers, swipe-to-delete, the
 * unread roll-up to the Chats tab, and the empty-state messages all match the Mojo behaviour.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    DataRepeater = require('enyo/DataRepeater'),
    Scroller = require('enyo/Scroller'),
    Collection = require('enyo/Collection'),
    RecordModel = require('../data/RecordModel'),
    syncCollection = require('../util/syncCollection'),
    openThread = require('../util/openThread'),
    Control = require('enyo/Control'),
    LunaService = require('enyo-webos/LunaService'),
    ThreadRow = require('./ThreadRow'),
    SearchInput = require('./widgets/SearchInput'),
    ThreadService = require('../data/ThreadService'),
    mockDb = require('../data/mockDb'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "ThreadList",
    kind: FittableRows,

    events: {
        onSelectThread: "",
        onDeleteThread: "",
        onThreadLocked: "",
        onUnreadCountChanged: ""
    },

    components: [
        { name: "search", kind: SearchInput, onSearchChange: "filterList" },
        { classes: "header-shadow header-app-shadow" },
        { name: "emptyMessage", classes: "messageTexts", showing: false },
        {
            // A Scroller around a DataRepeater rather than a DataList: DataList is
            // virtualised, sizing pages from measured row heights and re-rendering as those
            // measurements settle. These lists are short, so rendering the rows once removes
            // that entire feedback loop.
            name: "scroller", kind: Scroller, fit: true, horizontal: "hidden", touch: true,
            classes: "threads-list messaging-listsDivider",
            ontap: "selectThread", onConfirm: "swipeDelete",
            components: [
                { name: "list", kind: DataRepeater, components: [ { kind: ThreadRow } ] }
            ]
        },
        {
            name: 'deleteThreadService', kind: LunaService,
            service: 'luna://org.webosports.service.messaging', method: 'deleteChatthread',
            onError: 'deleteThreadErr'
        },
        {
            name: 'openThreadCheck', kind: LunaService,
            service: 'luna://com.webos.service.db', method: 'get',
            onResponse: 'gotOpenThreadCheck', onError: 'deleteThreadErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.filterString = "";
        this.selectedRecord = null;

        this.collection = new Collection({ model: RecordModel });
        this.$.list.set("collection", this.collection);

        this.threadService = this.createComponent({
            kind: ThreadService,
            onResults: "gotThreads",
            onWatch: "threadsWatch"
        }, { owner: this });

        this.runQuery();
    },

    destroy: function () {
        if (this.threadService) {
            this.threadService.cancel();
        }
        if (this.collection) {
            this.collection.destroy();
            this.collection = null;
        }
        this.inherited(arguments);
    },

    // --- querying ------------------------------------------------------------------------

    runQuery: function () {
        var query;
        if (this.filterString && this.filterString.length > 0) {
            query = {
                where: [
                    { prop: "flags.visible", op: "=", val: true },
                    {
                        prop: "displayName", op: "%", val: this.filterString,
                        collate: "primary", tokenize: "all"
                    }
                ],
                search: true
            };
        } else {
            query = { where: [{ prop: "flags.visible", op: "=", val: true }] };
        }
        query.orderBy = "timestamp";
        query.desc = true;

        this.threadService.call({ query: query });
    },

    filterList: function (inSender, inEvent) {
        this.filterString = (inEvent && inEvent.value) || "";
        this.runQuery();
        return true;
    },

    threadsWatch: function () {
        // enyo-webos keeps the subscription open, so release the prior request before re-querying;
        // otherwise every watch fire leaks the three subscribed finds this service holds.
        this.threadService.cancel();
        this.runQuery();
        return true;
    },

    gotThreads: function (inSender, inEvent) {
        var all = (inEvent && inEvent.results) || [];
        var results = this.excludeChannelThreads(all);

        // The open thread left the list: find out whether it was deleted under the conversation.
        if (!mockDb.enabled && openThread.droppedOut(this.selectedRecord, all, this.filterString)) {
            this.checkingThreadId = this.selectedRecord._id;
            this.$.openThreadCheck.send({ ids: [this.checkingThreadId] });
        }

        // Report any thread whose lock state changed out from under the open conversation.
        if (this.selectedRecord) {
            for (var i = 0; i < results.length; i++) {
                var t = results[i];
                if (t._id === this.selectedRecord._id && t.flags && this.selectedRecord.flags &&
                        t.flags.locked !== this.selectedRecord.flags.locked) {
                    this.doThreadLocked({ thread: t });
                }
            }
        }

        syncCollection(this.collection, results);
        if (this.selectedRecord) {
            this.markSelected(this.selectedRecord._id);
        }
        this.updateEmptyMessage(results);
        this.reportUnreadCount(results);
        return true;
    },

    /**
     * Servers/Rooms (channels, status updates, ...) are com.palm.chatthread records too, and the
     * chatthreader stamps flags.visible:true on them so the server/channel unread queries keep
     * working — which means the "flags.visible = true" query above cannot tell them apart from a
     * real 1:1/group chat. There is no db8 index on channelId to exclude them at the query level
     * (com.palm.chatthread is a stock kind), so strip them here instead.
     */
    excludeChannelThreads: function (results) {
        var filtered = [];
        for (var i = 0; i < results.length; i++) {
            if (!results[i].channelId) {
                filtered.push(results[i]);
            }
        }
        return filtered;
    },

    updateEmptyMessage: function (results) {
        if (results.length === 0) {
            if (this.filterString && this.filterString.length > 0) {
                this.showEmptyMessage(messagingUtils.CONSTANTS.NO_SEARCH_RESULTS);
            } else {
                this.showEmptyMessage($L("Your conversation list is empty."));
            }
        } else {
            this.$.emptyMessage.hide();
        }
    },

    showEmptyMessage: function (message) {
        this.$.emptyMessage.setContent(message);
        this.$.emptyMessage.show();
    },

    /** Total unread across all threads except the one currently on screen. */
    reportUnreadCount: function (results) {
        var cnt = 0;
        for (var i = 0; i < results.length; i++) {
            var thread = results[i];
            if (!appState.selectedThread || thread._id !== appState.selectedThread._id ||
                    appState.getAppDeactivated() === true) {
                cnt += (thread.unreadCount || 0);
            }
        }
        this.doUnreadCountChanged({ count: cnt });
    },

    // --- rendering -----------------------------------------------------------------------

    /**
     * Selection rides on the models rather than being applied row by row, so the rows restyle
     * themselves through their bindings and nothing has to reach into the repeater's children.
     */
    markSelected: function (threadId) {
        this.collection.forEach(function (model) {
            model.set('selected', model.attributes._id === threadId);
        });
    },

    // --- interaction ---------------------------------------------------------------------

    /** RepeaterChildSupport decorates every event bubbled out of a row with its model and index. */
    recordFor: function (inEvent) {
        var model = (inEvent && inEvent.model) ||
            (inEvent && inEvent.index !== undefined && this.collection.at(inEvent.index));
        return model && model.attributes;
    },

    selectThread: function (inSender, inEvent) {
        var record = this.recordFor(inEvent);
        if (!record) {
            return true;
        }
        if (appState.selectedThread && appState.selectedThread._id === record._id) {
            return true;   // tap on the already-selected row: nothing to do
        }
        this.selectedRecord = record;
        this.markSelected(record._id);
        this.doSelectThread({ thread: record });
        return true;
    },

    swipeDelete: function (inSender, inEvent) {
        var record = this.recordFor(inEvent);
        if (record && record._id) {
            if (mockDb.enabled) {
                mockDb.del([record._id]);
                this.runQuery();
            } else {
                this.$.deleteThreadService.send({ threadId: record._id });
            }
            this.doDeleteThread({ thread: record });
        }
        return true;
    },

    deleteThreadErr: function (inSender, inError) {
        this.error(inError && (inError.errorText || inError));
        return true;
    },

    gotOpenThreadCheck: function (inSender, inResponse) {
        var id = this.checkingThreadId;
        this.checkingThreadId = null;
        if (!this.selectedRecord || this.selectedRecord._id !== id || !openThread.gone(inResponse)) {
            return true;
        }
        var thread = this.selectedRecord;
        this.selectedRecord = null;
        // The same path as a swipe delete: MainView closes the conversation and clears the selection.
        this.doDeleteThread({ thread: thread });
        return true;
    },

    setSelection: function (inChatThread) {
        if (this.selectedRecord && inChatThread && this.selectedRecord._id === inChatThread._id) {
            return;   // selection did not change
        }
        this.selectedRecord = inChatThread;
        this.markSelected(inChatThread && inChatThread._id);
    },

    updateList: function () {
        this.$.list.refresh();
    },

    resetList: function () {
        this.threadService.cancel();
        this.runQuery();
    },

    windowHiddenHandler: function () {
        this.filterString = "";
        this.$.search.set('value', "");
        this.$.search.forceBlur();
    }
});
