/**
 * The favorites list.
 * Ported from com.palm.app.messaging/app/favorites/FavoriteList.js.
 *
 * Tapping a favorite starts (or reopens) a conversation on their best available address: IM first,
 * then SMS. A favorite with neither opens Contacts so the user can add an address.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    DataList = require('enyo/DataList'),
    Collection = require('enyo/Collection'),
    RecordModel = require('../data/RecordModel'),
    syncCollection = require('../util/syncCollection'),
    LunaService = require('enyo-webos/LunaService'),
    FavoriteRow = require('./FavoriteRow'),
    FavoriteService = require('../data/FavoriteService'),
    messagingUtils = require('../util/messagingUtils'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var NO_FAVORITE_MESSAGE = $L("You do not have any favorite contacts.");

module.exports = kind({
    name: "FavoriteList",
    kind: FittableRows,
    classes: "favoriteItem",

    events: {
        onSelectFavorite: ""
    },

    components: [
        { classes: "header-shadow header-favorite-shadow" },
        {
            name: "noFavoriteMessage", classes: "messageTexts",
            content: NO_FAVORITE_MESSAGE, showing: false
        },
        {
            name: "list", kind: DataList, fit: true, classes: "threads-list messaging-listsDivider",
            scrollerOptions: { horizontal: "hidden", touch: true },
            ontap: "favoriteTapped", onConfirm: "removeFavorite",
            components: [
                { kind: FavoriteRow }
            ]
        },
        {
            name: 'unfavoritePersonService', kind: LunaService,
            service: 'luna://com.webos.service.contacts', method: 'unfavoritePerson',
            onError: 'serviceErr'
        },
        {
            name: 'launchContacts', kind: LunaService,
            service: 'luna://com.webos.applicationManager', method: 'launch',
            onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.selectedRecord = null;

        this.collection = new Collection({ model: RecordModel });
        this.$.list.set("collection", this.collection);

        this.favoriteService = this.createComponent({
            kind: FavoriteService,
            onResults: "gotFavorites",
            onWatch: "favoritesWatch"
        }, { owner: this });

        this.runQuery();
    },

    destroy: function () {
        if (this.favoriteService) {
            this.favoriteService.cancel();
        }
        if (this.collection) {
            this.collection.destroy();
            this.collection = null;
        }
        this.inherited(arguments);
    },

    // --- querying ------------------------------------------------------------------------

    runQuery: function () {
        this.favoriteService.call({
            query: {
                where: [{ prop: "favorite", op: "=", val: true }],
                select: messagingUtils.person.selectAttributes,
                orderBy: "sortKey"
            }
        });
    },

    favoritesWatch: function () {
        this.favoriteService.cancel();
        this.runQuery();
        return true;
    },

    gotFavorites: function (inSender, inEvent) {
        var results = (inEvent && inEvent.results) || [];
        syncCollection(this.collection, results);
        if (this.selectedRecord) {
            this.markSelected(this.selectedRecord._id);
        }
        this.$.noFavoriteMessage.setShowing(results.length === 0);
        return true;
    },

    // --- rendering -----------------------------------------------------------------------

    /** Selection rides on the models so the rows restyle themselves through their bindings. */
    markSelected: function (personId) {
        this.collection.forEach(function (model) {
            model.set('selected', model.attributes._id === personId);
        });
    },

    // --- interaction ---------------------------------------------------------------------

    recordFor: function (inEvent) {
        var model = (inEvent && inEvent.model) ||
            (inEvent && inEvent.index !== undefined && this.collection.at(inEvent.index));
        return model && model.attributes;
    },

    favoriteTapped: function (inSender, inEvent) {
        var selected = this.recordFor(inEvent);
        if (!selected) {
            return true;
        }

        if (messagingUtils.person.hasMessagingAccounts(selected)) {
            this.selectedRecord = selected;
            this.markSelected(selected._id);
            this.doSelectFavorite({
                favorite: {
                    personId: selected._id,
                    displayName: messagingUtils.person.getDisplayName(selected),
                    username: selected.ims[0].value || selected.ims[0].username,
                    serviceName: selected.ims[0].type || selected.ims[0].serviceName
                }
            });
        } else if (messagingUtils.person.hasSMSAccounts(selected)) {
            this.selectedRecord = selected;
            this.markSelected(selected._id);
            this.doSelectFavorite({
                favorite: {
                    personId: selected._id,
                    displayName: messagingUtils.person.getDisplayName(selected),
                    username: messagingUtils.utils.normalizeAddress(
                        selected.phoneNumbers[0].value || selected.phoneNumbers[0], "sms"),
                    serviceName: "sms"
                }
            });
        } else {
            // Nothing to message: send the user to Contacts to add an address.
            this.$.launchContacts.send({
                id: "com.palm.app.contacts",
                params: { personId: selected._id, launchType: "editContact" }
            });
        }
        return true;
    },

    removeFavorite: function (inSender, inEvent) {
        var favorite = this.recordFor(inEvent);
        if (!favorite) {
            return true;
        }
        if (mockDb.enabled) {
            mockDb.merge([{ _id: favorite._id, _kind: "com.palm.person:1", favorite: false }]);
            this.runQuery();
        } else {
            this.$.unfavoritePersonService.send({ personId: favorite._id });
        }
        return true;
    },

    serviceErr: function (inSender, inError) {
        this.error(inError && (inError.errorText || inError));
        return true;
    },

    setSelection: function (inChatThread) {
        if ((this.selectedRecord && inChatThread && this.selectedRecord._id === inChatThread.personId) ||
                (!this.selectedRecord && inChatThread && !inChatThread.personId)) {
            return;   // selection did not change
        }
        this.selectedRecord = { _id: inChatThread ? inChatThread.personId : null };
        this.markSelected(this.selectedRecord._id);
    },

    updateList: function () {
        this.$.list.refresh();
    },

    resetList: function () {
        this.favoriteService.cancel();
        this.runQuery();
    },

    windowHiddenHandler: function () {
    }
});
