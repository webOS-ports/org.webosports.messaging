/**
 * The buddies list.
 * Ported from com.palm.app.messaging/app/buddies/BuddyList.js.
 *
 * Rows are grouped by buddy group, with all offline buddies collected under a single "offline"
 * divider at the end. The empty-state message distinguishes "no IM accounts", "all accounts
 * offline", "no online buddies" and "no buddies at all", as the Mojo app did.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    DataList = require('enyo/DataList'),
    Collection = require('enyo/Collection'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    BuddyItem = require('./BuddyItem'),
    Divider = require('./widgets/Divider'),
    SearchInput = require('./widgets/SearchInput'),
    BuddyService = require('../data/BuddyService'),
    DeleteBuddyService = require('../data/DeleteBuddyService'),
    messagingUtils = require('../util/messagingUtils'),
    $L = require('enyo/i18n').$L;

var BuddyConstants = {
    OFFLINE_MESSAGE: $L("Please sign in to an IM service to see your buddies."),
    NO_ONLINE_BUDDY_MESSAGE: $L("You do not have any online buddies."),
    NO_BUDDY_MESSAGE: $L("You do not have any buddies.")
};

module.exports = kind({
    name: "BuddyList",
    kind: FittableRows,

    published: {
        showOffline: false,
        loginStates: null
    },

    events: {
        onSelectBuddy: "",
        onDeleteThread: ""
    },

    components: [
        { name: "search", kind: SearchInput, onSearchChange: "filterList" },
        { classes: "header-shadow header-app-shadow" },
        {
            name: "emptyMessage", classes: "messageTexts",
            content: BuddyConstants.OFFLINE_MESSAGE, showing: false
        },
        {
            name: "list", kind: DataList, fit: true, classes: "threads-list messaging-listsDivider",
            scrollerOptions: { horizontal: "hidden", touch: true },
            components: [
                {
                    components: [
                        { name: "divider", kind: Divider, classes: "buddyList-Divider", showing: false },
                        {
                            name: "buddyItem", kind: BuddyItem,
                            ontap: "buddyTapped", onConfirm: "showDeleteConfirmDialog"
                        }
                    ],
                    bindings: [
                        { from: ".model", to: ".$.buddyItem.record", transform: "setupRow" }
                    ]
                }
            ]
        },
        {
            name: 'deleteDialog', kind: Popup, centered: true, floating: true, modal: true,
            components: [
                { name: 'deleteDialogTitle', style: 'font-weight: bold; margin-bottom: 0.5rem;' },
                { name: 'deleteDialogMessage', style: 'margin: 0.5rem 0 1rem;' },
                {
                    classes: 'flex-row', components: [
                        { kind: Button, content: $L("Cancel"), ontap: "closeDeleteDialog" },
                        { classes: 'flex-auto' },
                        {
                            kind: Button, content: $L("Delete"), classes: "onyx-negative",
                            ontap: "deleteBuddy"
                        }
                    ]
                }
            ]
        },
        { name: 'deleteBuddyService', kind: DeleteBuddyService, onDeleteThread: "doDeleteThread" }
    ],

    create: function () {
        this.inherited(arguments);
        this.filterString = "";
        this.selectedRecord = null;
        this.pendingDeleteBuddy = null;

        this.collection = new Collection();
        this.$.list.set("collection", this.collection);

        this.buddyService = this.createComponent({
            kind: BuddyService,
            onResults: "gotBuddies",
            onWatch: "buddiesWatch"
        }, { owner: this });

        this.runQuery();
    },

    destroy: function () {
        if (this.buddyService) {
            this.buddyService.cancel();
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
                    { prop: "primary", op: "=", val: true },
                    { prop: "offline", op: "=", val: this.showOffline ? [true, false] : false },
                    {
                        prop: "displayName", op: "?", val: this.filterString,
                        collate: "primary", tokenize: "all"
                    }
                ],
                search: true
            };
        } else {
            query = {
                where: [
                    { prop: "primary", op: "=", val: true },
                    { prop: "offline", op: "=", val: this.showOffline ? [true, false] : false },
                    { prop: "groupAvailability", op: "%", val: "", collate: "secondary" }
                ]
            };
        }
        this.buddyService.call({ query: query });
    },

    showOfflineChanged: function () {
        this.runQuery();
    },

    filterList: function (inSender, inEvent) {
        this.filterString = (inEvent && inEvent.value) || "";
        this.runQuery();
        return true;
    },

    buddiesWatch: function () {
        // Release the prior request and its subscriptions before re-querying, else each watch fire
        // leaks the subscribed finds this service holds.
        this.buddyService.cancel();
        this.runQuery();
        return true;
    },

    gotBuddies: function (inSender, inEvent) {
        var results = (inEvent && inEvent.results) || [];

        // Sort by group, then by name, with offline buddies last, so the dividers below come out
        // in the order the Mojo list produced from its indexed query.
        var self = this;
        results.sort(function (a, b) {
            if (!!a.offline !== !!b.offline) {
                return a.offline ? 1 : -1;
            }
            var ga = a.offline ? "" : (a.group || ""), gb = b.offline ? "" : (b.group || "");
            if (ga !== gb) { return ga < gb ? -1 : 1; }
            var na = self.nameFor(a), nb = self.nameFor(b);
            if (na === nb) { return 0; }
            return na < nb ? -1 : 1;
        });

        this.collection.empty(results);
        this.emptyMessageCheck(results, this.loginStates, this.filterString, this.showOffline);
        return true;
    },

    nameFor: function (buddy) {
        var name = buddy.person ? messagingUtils.person.getDisplayName(buddy.person) :
            (buddy.displayName || buddy.username || "");
        return String(name).toLowerCase();
    },

    showEmptyMessage: function (message) {
        this.$.emptyMessage.setContent(message);
        this.$.emptyMessage.show();
    },

    emptyMessageCheck: function (results, loginStates, filterString, showOffline) {
        var message;
        this.$.emptyMessage.hide();

        if (!loginStates || loginStates.length === 0) {
            message = BuddyConstants.OFFLINE_MESSAGE;
        } else if (results.length === 0) {
            if (filterString && filterString.length > 0) {
                message = messagingUtils.CONSTANTS.NO_SEARCH_RESULTS;
            } else if (this.isOffline(loginStates)) {
                message = BuddyConstants.OFFLINE_MESSAGE;
            } else if (showOffline) {
                message = BuddyConstants.NO_BUDDY_MESSAGE;
            } else {
                message = BuddyConstants.NO_ONLINE_BUDDY_MESSAGE;
            }
        }

        if (message !== undefined) {
            this.showEmptyMessage(message);
        }
        return message;
    },

    isOffline: function (states) {
        for (var i = 0; i < states.length; i++) {
            if (states[i].availability !== messagingUtils.im.availability.OFFLINE &&
                    states[i].state !== "offline") {
                return false;
            }
        }
        return true;
    },

    // --- rendering -----------------------------------------------------------------------

    setupRow: function (model, dir, bind) {
        if (!model) {
            return null;
        }
        var record = model.attributes;
        var list = this.owner;
        var collection = this.repeater && this.repeater.collection;

        if (!list.filterString || list.filterString.length === 0) {
            var offlineCaption = $L("offline");
            var caption = record.offline ? offlineCaption : (record.group || offlineCaption);
            var previous = collection && this.index > 0 && collection.at(this.index - 1);
            var previousCaption = previous &&
                (previous.attributes.offline ? offlineCaption :
                    (previous.attributes.group || offlineCaption));
            var showDivider = caption !== previousCaption;

            this.$.divider.setCaption(String(caption).toUpperCase());
            this.$.divider.setShowing(showDivider);
            this.$.buddyItem.addRemoveClass("enyo-first", showDivider);
        } else {
            this.$.divider.setShowing(false);
        }

        this.$.buddyItem.addRemoveClass("enyo-item-selected",
            list.shouldHighlight(record, list.selectedRecord));
        this.$.buddyItem.set("index", this.index);

        return record;
    },

    shouldHighlight: function (inBuddy, selectedRecord) {
        if (!selectedRecord) {
            return false;
        }
        if (selectedRecord.personId) {
            return selectedRecord.personId === inBuddy.personId;
        }
        if (selectedRecord.normalizedAddress) {
            // Selection arriving from the conversations list.
            return selectedRecord.normalizedAddress ===
                messagingUtils.utils.normalizeAddress(inBuddy.username, inBuddy.serviceName);
        }
        if (selectedRecord.username && selectedRecord.serviceName) {
            // Selection arriving from this list.
            return messagingUtils.utils.normalizeAddress(selectedRecord.username, selectedRecord.serviceName) ===
                messagingUtils.utils.normalizeAddress(inBuddy.username, inBuddy.serviceName);
        }
        return false;
    },

    // --- interaction ---------------------------------------------------------------------

    recordFor: function (inEvent) {
        var model = (inEvent && inEvent.model) ||
            (inEvent && inEvent.index !== undefined && this.collection.at(inEvent.index));
        return model && model.attributes;
    },

    buddyTapped: function (inSender, inEvent) {
        var record = this.recordFor(inEvent);
        if (!record) {
            return true;
        }
        if (this.selectedRecord && record.personId === this.selectedRecord.personId) {
            return true;
        }
        this.selectedRecord = record;
        this.doSelectBuddy({ buddy: record });
        this.$.list.refresh();
        return true;
    },

    showDeleteConfirmDialog: function (inSender, inEvent) {
        var record = this.recordFor(inEvent);
        if (!record) {
            return true;
        }
        this.pendingDeleteBuddy = record;
        this.$.deleteBuddyService.setBuddy(record);

        var name = record.person ? messagingUtils.person.getDisplayName(record.person) :
            (record.displayName || record.username);
        this.$.deleteDialogTitle.setContent($L("Remove Buddy"));
        this.$.deleteDialogMessage.setContent(
            $L("Are you sure you want to delete this buddy from your buddies list?") + "\n" + name);
        this.$.deleteDialog.show();
        return true;
    },

    closeDeleteDialog: function () {
        this.$.deleteDialog.hide();
        this.pendingDeleteBuddy = null;
        return true;
    },

    deleteBuddy: function () {
        this.$.deleteDialog.hide();
        this.$.deleteBuddyService.deleteBuddy();
        this.pendingDeleteBuddy = null;
        return true;
    },

    setSelection: function (inChatThread) {
        if ((this.selectedRecord && inChatThread &&
                ((inChatThread.buddyId && this.selectedRecord.buddyId === inChatThread.buddyId) ||
                 (inChatThread.personId && this.selectedRecord.personId === inChatThread.personId))) ||
                (!this.selectedRecord && inChatThread && !inChatThread.personId)) {
            return;   // selection did not change
        }
        this.selectedRecord = { personId: inChatThread ? inChatThread.personId : null };
        this.$.list.refresh();
    },

    setLoginStates: function (states) {
        this.set('loginStates', states);
        this.emptyMessageCheck(this.collection ? this.collection.models.map(function (m) {
            return m.attributes;
        }) : [], states, this.filterString, this.showOffline);
    },

    updateList: function () {
        this.$.list.refresh();
    },

    resetList: function () {
        this.buddyService.cancel();
        this.runQuery();
    },

    windowHiddenHandler: function () {
        this.filterString = "";
        this.$.search.set('value', "");
        this.$.search.forceBlur();
    }
});
