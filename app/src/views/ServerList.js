/**
 * The Servers/Rooms tab.
 * Ported from com.palm.app.messaging/app/servers/ServerList.js.
 *
 * A two-level drill-down inside its own Panels: the server (guild/network) list, and — once a
 * server is tapped — that server's channels. Selecting a channel bubbles its chatthread up via
 * onSelectThread, the same contract ThreadList uses, so the conversation view opens it with no
 * extra wiring. Going back up is driven by the app's bottom toolbar, so this kind fires
 * onServerDrill and exposes showServers()/isDrilledIn() for the shell to hook a footer button.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    Panels = require('layout/Panels'),
    CardArranger = require('layout/CardArranger'),
    DataList = require('enyo/DataList'),
    Collection = require('enyo/Collection'),
    RecordModel = require('../data/RecordModel'),
    syncCollection = require('../util/syncCollection'),
    ServerRow = require('./ServerRow'),
    ChannelList = require('./ChannelList'),
    SearchInput = require('./widgets/SearchInput'),
    ServerServices = require('../data/ServerService'),
    messagingUtils = require('../util/messagingUtils'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "ServerList",
    kind: FittableRows,

    events: {
        onSelectThread: "",
        onServerDrill: ""
    },

    components: [
        {
            name: "drill", kind: Panels, arrangerKind: CardArranger, fit: true, draggable: false,
            components: [
                {
                    name: "serversView", kind: FittableRows, components: [
                        {
                            name: "search", kind: SearchInput,
                            placeholder: $L("Search servers"), onSearchChange: "filterList"
                        },
                        { classes: "header-shadow header-app-shadow" },
                        { name: "emptyMessage", classes: "messageTexts", showing: false },
                        {
                            name: "list", kind: DataList, fit: true,
                            classes: "threads-list messaging-listsDivider",
                            scrollerOptions: { horizontal: "hidden", touch: true },
                            ontap: "selectServer",
                            components: [
                                { kind: ServerRow }
                            ]
                        }
                    ]
                },
                { name: "channelsView", kind: ChannelList, onSelectThread: "relaySelectThread" }
            ]
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.drilledIn = false;
        this.filterString = "";
        this.selectedServer = null;
        this.allServers = [];
        this.serverUnread = {};    // serverId -> summed unread
        this.serverLatest = {};    // serverId -> {ts, outgoing} of its most recent thread
        this.accountAvail = {};    // serviceName -> imloginstate availability (0..4)

        this.collection = new Collection({ model: RecordModel });
        this.$.list.set("collection", this.collection);

        this.serverService = this.createComponent({
            kind: ServerServices.ServerService,
            onResults: "gotServers", onWatch: "serversWatch"
        }, { owner: this });

        this.unreadService = this.createComponent({
            kind: ServerServices.UnreadService,
            onResults: "gotUnread", onWatch: "unreadWatch"
        }, { owner: this });

        // Start on the server list; the channel view only appears after a drill-down.
        this.$.drill.setIndex(0);
        this.runQuery();
        this.callUnread();
    },

    destroy: function () {
        if (this.serverService) { this.serverService.cancel(); }
        if (this.unreadService) { this.unreadService.cancel(); }
        if (this.collection) {
            this.collection.destroy();
            this.collection = null;
        }
        this.inherited(arguments);
    },

    // --- login states --------------------------------------------------------------------

    /**
     * Account online states. Keep the "best" (lowest, i.e. most available) availability per service
     * type, then repaint so each server shows its dot and logo. This also covers the case where the
     * account-types hash was still empty when the rows first drew.
     */
    setLoginStates: function (inStates) {
        var map = {};
        var arr = inStates || [];
        for (var i = 0; i < arr.length; i++) {
            var s = arr[i];
            if (!s.serviceName) { continue; }
            var a = Number(s.availability);
            if (isNaN(a)) { a = messagingUtils.im.availability.OFFLINE; }
            if (map[s.serviceName] === undefined || a < map[s.serviceName]) {
                map[s.serviceName] = a;
            }
        }
        this.accountAvail = map;
        this.refreshRows();
    },

    // --- servers -------------------------------------------------------------------------

    runQuery: function () {
        // No where-clause: show every server, ordered by account type. Search is applied in memory
        // in applyFilter, so these small lists need no extra db index.
        this.serverService.call({ query: { orderBy: "serviceName" } });
    },

    serversWatch: function () {
        this.serverService.cancel();
        this.runQuery();
        return true;
    },

    gotServers: function (inSender, inEvent) {
        this.allServers = (inEvent && inEvent.results) || [];
        this.applyFilter();
        return true;
    },

    filterList: function (inSender, inEvent) {
        this.filterString = (inEvent && inEvent.value) || "";
        this.applyFilter();
        return true;
    },

    applyFilter: function () {
        var results = this.allServers;
        if (this.filterString) {
            var f = this.filterString.toLowerCase();
            var fields = ["displayName", "name"];
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
                $L("No servers match your search.") :
                $L("No servers yet. Add a Discord, IRC, Teams, Slack or Matrix account to see its servers here."));
            this.$.emptyMessage.show();
        } else {
            this.$.emptyMessage.hide();
        }
    },

    // --- unread --------------------------------------------------------------------------

    callUnread: function () {
        this.unreadService.cancel();
        this.unreadService.call({
            query: {
                where: [{ prop: "flags.visible", op: "=", val: true }],
                select: ["_id", "serverId", "channelId", "unreadCount", "flags", "timestamp"]
            }
        });
    },

    unreadWatch: function () {
        this.callUnread();
        return true;
    },

    /**
     * Tally unread by serverId and track each server's most recent thread, which drives the
     * sent/received arrow.
     */
    gotUnread: function (inSender, inEvent) {
        var map = {}, latest = {};
        var rows = (inEvent && inEvent.results) || [];
        for (var i = 0; i < rows.length; i++) {
            var t = rows[i];
            if (!t.serverId) { continue; }
            if (Number(t.unreadCount) > 0) {
                map[t.serverId] = (map[t.serverId] || 0) + Number(t.unreadCount);
            }
            var ts = Number(t.timestamp) || 0;
            if (!latest[t.serverId] || ts >= latest[t.serverId].ts) {
                latest[t.serverId] = { ts: ts, outgoing: !!(t.flags && t.flags.outgoing) };
            }
        }
        this.serverUnread = map;
        this.serverLatest = latest;
        this.decorateModels();
        return true;
    },

    // --- rendering -----------------------------------------------------------------------

    /**
     * Unread, availability and last-activity direction are not on the imserver record, so stamp
     * the derived values onto the models; the rows pick them up through their bindings.
     */
    decorateModels: function () {
        var list = this;
        this.collection.forEach(function (model) {
            var id = model.attributes._id;
            var latest = list.serverLatest[id];
            model.set('unread', list.serverUnread[id] || 0);
            model.set('availability', list.accountAvail[model.attributes.serviceName]);
            model.set('outgoing', latest ? latest.outgoing : false);
            model.set('selected', !!(list.selectedServer && list.selectedServer._id === id));
        });
    },

    // --- interaction ---------------------------------------------------------------------

    recordFor: function (inEvent) {
        var model = (inEvent && inEvent.model) ||
            (inEvent && inEvent.index !== undefined && this.collection.at(inEvent.index));
        return model && model.attributes;
    },

    selectServer: function (inSender, inEvent) {
        var record = this.recordFor(inEvent);
        if (!record) {
            return true;
        }
        this.selectedServer = record;
        this.decorateModels();
        this.$.channelsView.setServer(record);
        this.$.drill.setIndex(1);
        this.setDrilled(true);
        return true;
    },

    showServers: function () {
        this.$.drill.setIndex(0);
        this.setDrilled(false);
    },

    setDrilled: function (inDrilled) {
        this.drilledIn = inDrilled;
        this.doServerDrill({ drilledIn: inDrilled });
    },

    isDrilledIn: function () {
        return this.drilledIn;
    },

    relaySelectThread: function (inSender, inEvent) {
        this.doSelectThread(inEvent);
        return true;
    },

    /** Re-render visible rows without re-querying, e.g. once the account-types hash fills in. */
    refreshRows: function () {
        this.decorateModels();
        this.$.channelsView.refreshRows();
    },

    // --- list plumbing driven by the shell ------------------------------------------------

    updateList: function () {
        this.$.list.refresh();
        this.$.channelsView.updateList();
    },

    resetList: function () {
        this.serverService.cancel();
        this.runQuery();
        this.$.channelsView.resetList();
    },

    setSelection: function (inChatThread) {
        this.$.channelsView.setSelection(inChatThread);
    },

    windowHiddenHandler: function () {
        // Return to the server list so re-opening the app does not strand the user mid-drill.
        this.$.drill.setIndex(0);
        if (this.drilledIn) {
            this.setDrilled(false);
        }
        this.filterString = "";
        this.$.search.set('value', "");
        this.applyFilter();
    }
});
