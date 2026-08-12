/**
 * The channel (room) list for one server, shown after drilling into a server row.
 * Ported from com.palm.app.messaging/app/servers/ChannelList.js.
 *
 * Going back up a level is driven by the app's bottom toolbar, so this view has no back button of
 * its own. Selecting a channel resolves its imchannel.chatThreadId to a chatthread and emits it
 * via onSelectThread, reusing the exact contract ThreadList uses so the conversation view opens it
 * with no extra plumbing.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    DataList = require('enyo/DataList'),
    Collection = require('enyo/Collection'),
    RecordModel = require('../data/RecordModel'),
    syncCollection = require('../util/syncCollection'),
    LunaService = require('enyo-webos/LunaService'),
    ChannelRow = require('./ChannelRow'),
    SearchInput = require('./widgets/SearchInput'),
    ServerServices = require('../data/ServerService'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';

module.exports = kind({
    name: "ChannelList",
    kind: FittableRows,

    events: {
        onSelectThread: ""
    },

    published: {
        serverId: ""
    },

    components: [
        { name: "search", kind: SearchInput, placeholder: $L("Search channels"), onSearchChange: "filterList" },
        { classes: "header-shadow header-app-shadow" },
        { name: "emptyMessage", classes: "messageTexts", showing: false },
        {
            name: "list", kind: DataList, fit: true, classes: "threads-list messaging-listsDivider",
            scrollerOptions: { horizontal: "hidden", touch: true },
            ontap: "selectChannel",
            components: [
                { kind: ChannelRow }
            ]
        },
        {
            name: 'threadGetter', kind: LunaService, service: DB_SERVICE, method: 'get',
            onResponse: 'threadFetched', onError: 'threadFetchFailed'
        },
        {
            name: 'threadFinder', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'threadSearchResult', onError: 'threadFetchFailed'
        },
        {
            name: 'threadPutter', kind: LunaService, service: DB_SERVICE, method: 'put',
            onResponse: 'threadCreated', onError: 'threadFetchFailed'
        },
        // Links a freshly-created channel thread back onto its imchannel.
        {
            name: 'channelMerger', kind: LunaService, service: DB_SERVICE, method: 'merge',
            onError: 'threadFetchFailed'
        },
        // Asks the transport to join the channel so the connector fetches its history.
        {
            name: 'channelOpener', kind: LunaService,
            service: 'luna://com.palm.imlibpurple', method: 'openChannel',
            onError: 'threadFetchFailed'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.filterString = "";
        this.channelUnread = {};   // imchannel._id -> unreadCount (via chatthread.channelId)
        this.threadUnread = {};    // chatthread._id -> unreadCount (via imchannel.chatThreadId)
        this.selectedRecord = null;
        this.selectedChatThread = null;
        this.pendingChannel = null;
        this.allChannels = [];

        this.collection = new Collection({ model: RecordModel });
        this.$.list.set("collection", this.collection);

        this.channelService = this.createComponent({
            kind: ServerServices.ChannelService,
            onResults: "gotChannels", onWatch: "channelsWatch"
        }, { owner: this });

        this.unreadService = this.createComponent({
            kind: ServerServices.UnreadService,
            onResults: "gotUnread", onWatch: "unreadWatch"
        }, { owner: this });

        this.callUnread();
    },

    destroy: function () {
        if (this.channelService) { this.channelService.cancel(); }
        if (this.unreadService) { this.unreadService.cancel(); }
        if (this.collection) {
            this.collection.destroy();
            this.collection = null;
        }
        this.inherited(arguments);
    },

    // --- unread --------------------------------------------------------------------------

    callUnread: function () {
        // Release the prior subscription before re-arming, else each watch fire leaks a db8 watch.
        this.unreadService.cancel();
        this.unreadService.call({
            query: {
                where: [{ prop: "flags.visible", op: "=", val: true }],
                select: ["_id", "channelId", "unreadCount"]
            }
        });
    },

    unreadWatch: function () {
        this.callUnread();
        return true;
    },

    /** Key unread both ways, so a channel resolves whether or not its thread carries channelId. */
    gotUnread: function (inSender, inEvent) {
        var byChannel = {}, byThread = {};
        var rows = (inEvent && inEvent.results) || [];
        for (var i = 0; i < rows.length; i++) {
            var t = rows[i];
            var n = Number(t.unreadCount) || 0;
            if (t.channelId) { byChannel[t.channelId] = n; }
            if (t._id) { byThread[t._id] = n; }
        }
        this.channelUnread = byChannel;
        this.threadUnread = byThread;
        this.decorateModels();
        return true;
    },

    // --- channels ------------------------------------------------------------------------

    /** Point this list at a server: stash its id, retarget the search hint, re-run the query. */
    setServer: function (inServer) {
        this.serverId = inServer && inServer._id;
        this.serverName = (inServer && (inServer.displayName || inServer.name)) || $L("channels");
        this.$.search.set('placeholder', $L("Search") + " " + this.serverName);
        this.filterString = "";
        this.$.search.set('value', "");
        this.runQuery();
    },

    runQuery: function () {
        if (!this.serverId) {
            // No server drilled into yet, so don't hit the db; the list stays empty until setServer.
            return;
        }
        this.channelService.call({
            query: {
                where: [{ prop: "serverId", op: "=", val: this.serverId }],
                orderBy: "position"
            }
        });
    },

    channelsWatch: function () {
        this.channelService.cancel();
        this.runQuery();
        return true;
    },

    gotChannels: function (inSender, inEvent) {
        this.allChannels = (inEvent && inEvent.results) || [];
        this.applyFilter();
        return true;
    },

    filterList: function (inSender, inEvent) {
        this.filterString = (inEvent && inEvent.value) || "";
        this.applyFilter();
        return true;
    },

    /**
     * Filter in memory: channel lists are small enough that one query holds them all, so search
     * needs no tokenized db index.
     */
    applyFilter: function () {
        var results = this.allChannels;
        if (this.filterString) {
            var f = this.filterString.toLowerCase();
            var fields = ["name", "displayName", "remoteId"];
            results = results.filter(function (r) {
                for (var i = 0; i < fields.length; i++) {
                    if (r[fields[i]] && String(r[fields[i]]).toLowerCase().indexOf(f) !== -1) {
                        return true;
                    }
                }
                return false;
            });
        }

        syncCollection(this.collection, results);
        this.decorateModels();
        if (results.length === 0) {
            this.$.emptyMessage.setContent(this.filterString ?
                $L("No channels match your search.") : $L("No channels yet."));
            this.$.emptyMessage.show();
        } else {
            this.$.emptyMessage.hide();
        }
    },

    // --- rendering -----------------------------------------------------------------------

    /** Unread lives on the chatthreads, so stamp the derived value onto the channel models. */
    decorateModels: function () {
        var list = this;
        this.collection.forEach(function (model) {
            var record = model.attributes;
            var selected = (list.selectedRecord && list.selectedRecord._id === record._id) ||
                !!(list.selectedChatThread && record.chatThreadId &&
                    list.selectedChatThread._id === record.chatThreadId);
            var unread = list.channelUnread[record._id] ||
                (record.chatThreadId && list.threadUnread[record.chatThreadId]) || 0;
            model.set('unread', unread);
            model.set('selected', selected);
        });
    },

    // --- interaction ---------------------------------------------------------------------

    recordFor: function (inEvent) {
        var model = (inEvent && inEvent.model) ||
            (inEvent && inEvent.index !== undefined && this.collection.at(inEvent.index));
        return model && model.attributes;
    },

    selectChannel: function (inSender, inEvent) {
        var record = this.recordFor(inEvent);
        if (!record) {
            return true;
        }
        this.selectedRecord = record;
        this.decorateModels();

        // Join-on-open: fetch this channel's history via the transport. Idempotent if already joined.
        if (record.serviceName && record.remoteId && !mockDb.enabled) {
            this.$.channelOpener.send({ serviceName: record.serviceName, channel: record.remoteId });
        }

        if (record.chatThreadId) {
            this.fetchThread(record.chatThreadId);
        } else {
            // No link yet. Do NOT create blindly — a thread for this conversation may already exist
            // (created by the chatthreader, or by a previous tap whose link was lost to a re-sync).
            // Blind create-on-tap was the source of duplicate chatthreads. Search by the stable
            // normalizedAddress first, and reuse + relink if one is found.
            this.pendingChannel = record;
            var query = {
                from: messagingUtils.thread.dbKind,
                where: [{
                    prop: "normalizedAddress", op: "=",
                    val: messagingUtils.utils.normalizeAddress(record.remoteId, record.serviceName)
                }]
            };
            if (mockDb.enabled) {
                this.threadSearchResult(null, mockDb.find(query));
            } else {
                this.$.threadFinder.send({ query: query });
            }
        }
        return true;
    },

    fetchThread: function (threadId) {
        if (mockDb.enabled) {
            this.threadFetched(null, mockDb.get([threadId]));
            return;
        }
        this.$.threadGetter.send({ ids: [threadId] });
    },

    /**
     * Result of the pre-create lookup: if a thread for this conversation already exists (same
     * normalizedAddress and service), link it onto the imchannel and open it rather than creating a
     * second one. This makes opening an unlinked channel idempotent.
     */
    threadSearchResult: function (inSender, inResponse) {
        var results = (inResponse && inResponse.results) || [];
        var svc = this.pendingChannel && this.pendingChannel.serviceName;
        var match = null;
        for (var i = 0; i < results.length; i++) {
            if (!svc || results[i].replyService === svc) {
                match = results[i];
                break;
            }
        }

        if (match && this.pendingChannel) {
            this.linkChannelToThread(this.pendingChannel._id, match._id);
            this.pendingChannel = null;
            this.doSelectThread({ thread: match });
        } else {
            this.createChannelThread();
        }
        return true;
    },

    linkChannelToThread: function (channelId, threadId) {
        var link = { _kind: "com.palm.imchannel:1", _id: channelId, chatThreadId: threadId };
        if (mockDb.enabled) {
            mockDb.merge([link]);
            return;
        }
        this.$.channelMerger.send({ objects: [link] });
    },

    /**
     * Create the channel's chatthread with the same shape the chatthreader uses on a channel's
     * first message: replyAddress is the channel key, and channelId/serverId are denormalized.
     * Only reached when no existing thread matched.
     */
    createChannelThread: function () {
        var record = this.pendingChannel;
        if (!record) {
            return;
        }
        var thread = {
            _kind: messagingUtils.thread.dbKind,
            timestamp: (new Date()).getTime(),
            summary: "",
            flags: { visible: true, outgoing: false },
            displayName: record.displayName || record.name || record.remoteId,
            replyAddress: record.remoteId,
            normalizedAddress: messagingUtils.utils.normalizeAddress(record.remoteId, record.serviceName),
            replyService: record.serviceName,
            channelId: record._id,
            serverId: record.serverId
        };

        if (mockDb.enabled) {
            this.threadCreated(null, mockDb.merge([thread]));
            return;
        }
        this.$.threadPutter.send({ objects: [thread] });
    },

    threadCreated: function (inSender, inResponse) {
        var newId = inResponse && inResponse.results && inResponse.results[0] && inResponse.results[0].id;
        if (!newId || !this.pendingChannel) {
            return true;
        }
        this.linkChannelToThread(this.pendingChannel._id, newId);
        this.pendingChannel = null;
        this.fetchThread(newId);
        return true;
    },

    threadFetched: function (inSender, inResponse) {
        if (inResponse && inResponse.results && inResponse.results.length > 0) {
            this.doSelectThread({ thread: inResponse.results[0] });
        }
        return true;
    },

    threadFetchFailed: function (inSender, inResponse) {
        this.error("failed to fetch channel chatthread:",
            inResponse && (inResponse.errorText || inResponse));
        return true;
    },

    // --- list plumbing driven by the shell ------------------------------------------------

    updateList: function () {
        this.$.list.refresh();
    },

    refreshRows: function () {
        this.decorateModels();
    },

    resetList: function () {
        this.channelService.cancel();
        this.runQuery();
    },

    setSelection: function (inChatThread) {
        this.selectedChatThread = inChatThread;
        this.decorateModels();
    }
});
