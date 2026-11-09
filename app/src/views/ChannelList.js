/**
 * The channel (room) list for one server, shown after drilling into a server row.
 * Ported from com.palm.app.messaging/app/servers/ChannelList.js.
 *
 * Going back up a level is driven by the app's bottom toolbar, so this view has no back button of
 * its own. Selecting a channel resolves its imchannel.chatThreadId to a chatthread and emits it
 * via onSelectThread, reusing the exact contract ThreadList uses so the conversation view opens it
 * with no extra plumbing.
 *
 * On an IRC network a channel is joined by name (promptJoin, from the footer's Join Channel) and
 * left by holding its row (see util/ircChannels). On Discord, holding a row mutes or unmutes the
 * channel and chooses whether it delivers while closed (see util/channelOptions).
 */

var kind = require('enyo/kind'),
    FittableRows = require('./widgets/FitRows'),
    DataRepeater = require('enyo/DataRepeater'),
    Scroller = require('enyo/Scroller'),
    Collection = require('enyo/Collection'),
    RecordModel = require('../data/RecordModel'),
    syncCollection = require('../util/syncCollection'),
    LunaService = require('enyo-webos/LunaService'),
    ChannelRow = require('./ChannelRow'),
    SearchInput = require('./widgets/SearchInput'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    Input = require('onyx/Input'),
    InputDecorator = require('onyx/InputDecorator'),
    ircChannels = require('../util/ircChannels'),
    channelOptions = require('../util/channelOptions'),
    ChannelOptionsPopup = require('./ChannelOptionsPopup'),
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
            // A Scroller around a DataRepeater rather than a DataList: DataList is
            // virtualised, sizing pages from measured row heights and re-rendering as those
            // measurements settle. These lists are short, so rendering the rows once removes
            // that entire feedback loop.
            name: "scroller", kind: Scroller, fit: true, horizontal: "hidden", touch: true,
            classes: "threads-list messaging-listsDivider",
            ontap: "selectChannel", onhold: "holdChannel",
            components: [
                { name: "list", kind: DataRepeater, components: [ { kind: ChannelRow } ] }
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
        },
        // IRC: join a channel by name. The same call with a channel not in the list yet.
        {
            name: 'channelJoiner', kind: LunaService,
            service: 'luna://com.palm.imlibpurple', method: 'openChannel',
            onResponse: 'joinSent', onError: 'joinFailed'
        },
        // IRC: part a channel; the service drops its row.
        {
            name: 'channelLeaver', kind: LunaService,
            service: 'luna://com.palm.imlibpurple', method: 'leaveChannel',
            onResponse: 'leaveDone', onError: 'leaveFailed'
        },
        {
            name: "joinPopup", kind: Popup, centered: true, floating: true, modal: true, scrim: true,
            style: "width: 20em;", components: [
                { name: "joinTitle", style: "font-weight: bold; margin-bottom: 0.75rem;" },
                {
                    kind: InputDecorator, style: "width: 100%; margin-bottom: 0.5rem;", components: [
                        {
                            name: "joinInput", kind: Input, style: "width: 100%;",
                            placeholder: $L("#channel"), oninput: "joinInputChanged", onchange: "joinTapped"
                        }
                    ]
                },
                { name: "joinStatus", classes: "account-username-text", style: "margin-bottom: 0.75rem;" },
                {
                    classes: "flex-row", components: [
                        { kind: Button, content: $L("Cancel"), ontap: "joinCancelled" },
                        { classes: "flex-auto" },
                        {
                            name: "joinButton", kind: Button, classes: "onyx-affirmative",
                            content: $L("Join"), ontap: "joinTapped", disabled: true
                        }
                    ]
                }
            ]
        },
        { name: "optionsPopup", kind: ChannelOptionsPopup },
        {
            name: "leavePopup", kind: Popup, centered: true, floating: true, modal: true, scrim: true,
            style: "width: 20em;", components: [
                { name: "leaveTitle", style: "font-weight: bold; margin-bottom: 0.75rem;" },
                {
                    name: "leaveText", style: "margin-bottom: 0.75rem;",
                    content: $L("You leave the channel on the network and it is no longer joined at sign-in. What was said stays in Chats.")
                },
                { name: "leaveStatus", classes: "account-username-text", style: "margin-bottom: 0.75rem;" },
                {
                    classes: "flex-row", components: [
                        { kind: Button, content: $L("Cancel"), ontap: "leaveCancelled" },
                        { classes: "flex-auto" },
                        {
                            name: "leaveButton", kind: Button, classes: "onyx-negative",
                            content: $L("Leave"), ontap: "leaveTapped"
                        }
                    ]
                }
            ]
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
        this.server = null;
        this.pendingJoinKey = null;   // IRC: open this channel when its row appears
        this.leaving = null;

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
        this.server = inServer || null;
        this.pendingJoinKey = null;
        this.serverName = (inServer && (inServer.displayName || inServer.name)) || $L("channels");
        this.$.search.set('placeholder', $L("Search") + " " + this.serverName);
        this.filterString = "";
        this.$.search.set('value', "");
        this.runQuery();
    },

    /** The server shown changed (muted, say): its channels' rows say so. */
    serverUpdated: function (inServer) {
        if (inServer && inServer._id === this.serverId) {
            this.server = inServer;
            this.decorateModels();
        }
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
        // A channel joined from here shows up once the network let the account in: open it.
        if (this.pendingJoinKey) {
            for (var i = 0; i < this.allChannels.length; i++) {
                if (this.allChannels[i].remoteId === this.pendingJoinKey) {
                    this.pendingJoinKey = null;
                    this.openRecord(this.allChannels[i]);
                    break;
                }
            }
        }
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
            model.set('optionsSummary', channelOptions.summary(record, false, list.server));
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
        if (record) {
            this.openRecord(record);
        }
        return true;
    },

    openRecord: function (record) {
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
    },

    // --- IRC: join and leave by name -------------------------------------------------------

    /** Whether channels can be joined by name on the server shown (the footer's Join Channel). */
    canJoin: function () {
        return ircChannels.canJoin(this.server);
    },

    promptJoin: function () {
        if (!this.canJoin()) {
            return;
        }
        this.$.joinTitle.setContent($L("Join a channel on") + " " + this.serverName);
        this.$.joinInput.set('value', "");
        this.$.joinStatus.setContent("");
        this.$.joinButton.setDisabled(true);
        this.$.joinPopup.show();
        this.$.joinInput.focus();
    },

    joinInputChanged: function () {
        var typed = this.$.joinInput.get('value') || "";
        var ok = !!ircChannels.joinRequest(this.server, typed);
        this.$.joinButton.setDisabled(!ok);
        this.$.joinStatus.setContent(ok || !typed.replace(/\s+/g, "") ? "" :
            $L("A channel name has no spaces, commas or colons."));
        return true;
    },

    joinTapped: function () {
        var request = ircChannels.joinRequest(this.server, this.$.joinInput.get('value'));
        if (!request) {
            return true;
        }
        this.$.joinButton.setDisabled(true);
        this.pendingJoinKey = request.channel;
        if (mockDb.enabled) {
            this.log("would join:", request.channel);
            this.$.joinPopup.hide();
            return true;
        }
        this.$.channelJoiner.send(request);
        return true;
    },

    joinSent: function () {
        // Joined, or asked to be: the row comes with the next roster refresh (gotChannels).
        this.$.joinPopup.hide();
        return true;
    },

    joinFailed: function (inSender, inError) {
        this.pendingJoinKey = null;
        this.$.joinButton.setDisabled(false);
        this.$.joinStatus.setContent((inError && inError.errorText) || $L("The channel could not be joined."));
        return true;
    },

    joinCancelled: function () {
        this.$.joinPopup.hide();
        return true;
    },

    holdChannel: function (inSender, inEvent) {
        var record = this.recordFor(inEvent);
        if (channelOptions.supports(record)) {
            if (this.$.optionsPopup.showFor(record, false, this.server, inEvent) && inEvent.preventTap) {
                // The finger lifting after a hold is a tap too; that one should not open the channel.
                inEvent.preventTap();
            }
            return true;
        }
        if (!ircChannels.canLeave(record)) {
            return false;
        }
        if (inEvent.preventTap) {
            inEvent.preventTap();
        }
        this.leaving = record;
        this.$.leaveTitle.setContent($L("Leave") + " " + (record.displayName || record.name || record.remoteId) + "?");
        this.$.leaveStatus.setContent("");
        this.$.leaveButton.setDisabled(false);
        this.$.leavePopup.show();
        return true;
    },

    leaveTapped: function () {
        var request = ircChannels.leaveRequest(this.leaving);
        if (!request) {
            this.$.leavePopup.hide();
            return true;
        }
        this.$.leaveButton.setDisabled(true);
        if (mockDb.enabled) {
            this.log("would leave:", request.channel);
            this.$.leavePopup.hide();
            return true;
        }
        this.$.channelLeaver.send(request);
        return true;
    },

    leaveDone: function () {
        this.leaving = null;
        this.$.leavePopup.hide();
        return true;
    },

    leaveFailed: function (inSender, inError) {
        this.$.leaveButton.setDisabled(false);
        this.$.leaveStatus.setContent((inError && inError.errorText) || $L("The channel could not be left."));
        return true;
    },

    leaveCancelled: function () {
        this.leaving = null;
        this.$.leavePopup.hide();
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
