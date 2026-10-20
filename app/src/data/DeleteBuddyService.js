/**
 * Removes a buddy: issues a deleteBuddy IM command per linked contact, then deletes any chat
 * threads that were associated with the buddy's person.
 * Ported from com.palm.app.messaging/app/buddies/DeleteBuddyService.js.
 */

var kind = require('enyo/kind'),
    Component = require('enyo/Component'),
    LunaService = require('enyo-webos/LunaService'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    mockDb = require('./mockDb');

var DB_SERVICE = 'luna://com.webos.service.db';

/** Issues the per-contact "deleteBuddy" IM command. */
var DeleteBuddyCommand = kind({
    name: "DeleteBuddyCommand",
    kind: Component,

    components: [
        {
            name: 'accountFinder', kind: LunaService, service: DB_SERVICE, method: 'get',
            onResponse: 'gotAccount', onError: 'fail'
        },
        {
            name: 'deleteCommand', kind: LunaService, service: DB_SERVICE, method: 'put',
            onError: 'fail'
        }
    ],

    deleteContact: function (contact, accountService) {
        this.contact = contact;
        this.accountService = accountService;

        // The IM account supplies the "fromUsername" the transport needs.
        if (mockDb.enabled) {
            this.gotAccount(null, mockDb.get([contact.accountId]));
            return;
        }
        this.$.accountFinder.send({ ids: [contact.accountId] });
    },

    gotAccount: function (inSender, inResponse) {
        var account = inResponse && inResponse.results && inResponse.results[0];
        if (!account) {
            this.warn("no account record for contact", this.contact && this.contact._id);
            return;
        }
        var ims = this.contact.ims;
        for (var i = 0; ims && i < ims.length; i++) {
            this.doDeleteCommand(ims[i].value, ims[i].type, account.username);
        }
    },

    doDeleteCommand: function (targetUsername, serviceName, fromUsername) {
        if (!targetUsername || !serviceName || !fromUsername) {
            this.warn("invalid parameters for deleteBuddy command");
            return;
        }
        var command = {
            _kind: this.accountService.getImCommandKind(serviceName),
            command: "deleteBuddy",
            handler: "transport",
            targetUsername: targetUsername,
            fromUsername: fromUsername,
            serviceName: serviceName
        };
        if (mockDb.enabled) {
            return;
        }
        this.$.deleteCommand.send({ objects: [command] });
    },

    fail: function (inSender, inError) {
        this.error("deleteBuddy command failed:", inError && (inError.errorText || inError));
    }
});

module.exports = kind({
    name: "DeleteBuddyService",
    kind: Component,

    published: {
        buddy: undefined
    },

    events: {
        onDeleteThread: ""
    },

    components: [
        {
            name: 'personFinder', kind: LunaService, service: DB_SERVICE, method: 'get',
            onResponse: 'gotPerson', onError: 'fail'
        },
        {
            name: 'contactFinder', kind: LunaService, service: DB_SERVICE, method: 'get',
            onResponse: 'gotContacts', onError: 'fail'
        },
        {
            name: 'threadFinder', kind: LunaService, service: DB_SERVICE, method: 'find',
            onResponse: 'gotThreads', onError: 'fail'
        },
        {
            name: 'deleteThreadService', kind: LunaService,
            service: 'luna://org.webosports.service.messaging', method: 'deleteChatthread',
            onError: 'fail'
        }
    ],

    deleteBuddy: function () {
        if (!this.buddy) {
            return;
        }
        if (this.buddy.person && this.buddy.person.contactIds) {
            this.fetchContacts(this.buddy.person.contactIds);
        } else if (this.buddy.personId) {
            if (mockDb.enabled) {
                this.gotPerson(null, mockDb.get([this.buddy.personId]));
            } else {
                this.$.personFinder.send({ ids: [this.buddy.personId] });
            }
        } else {
            this.error("can't delete buddy", this.buddy._id, "with no personId");
        }
    },

    fetchContacts: function (contactIds) {
        if (mockDb.enabled) {
            this.gotContacts(null, mockDb.get(contactIds));
            return;
        }
        this.$.contactFinder.send({ ids: contactIds });
    },

    gotPerson: function (inSender, inResponse) {
        var person = inResponse && inResponse.results && inResponse.results[0];
        if (!person) {
            this.error("can't delete buddy", this.buddy && this.buddy._id, "with no person record");
            return;
        }
        this.fetchContacts(person.contactIds || []);
    },

    gotContacts: function (inSender, inResponse) {
        var contacts = (inResponse && inResponse.results) || [];
        for (var i = 0; i < contacts.length; i++) {
            this.addDeleteBuddy(contacts[i]);
        }
        this.deleteBuddyThreads();
    },

    addDeleteBuddy: function (contact) {
        if (contact.imBuddy) {
            var command = this.createComponent({ kind: DeleteBuddyCommand }, { owner: this });
            command.deleteContact(contact, appState.accountService);
        }
    },

    deleteBuddyThreads: function () {
        var query = {
            from: messagingUtils.thread.dbKind,
            where: [{ prop: "personId", op: "=", val: this.buddy.personId }],
            select: ["_id"]
        };
        if (mockDb.enabled) {
            this.gotThreads(null, mockDb.find(query));
            return;
        }
        this.$.threadFinder.send({ query: query });
    },

    gotThreads: function (inSender, inResponse) {
        var results = (inResponse && inResponse.results) || [];
        for (var i = 0; i < results.length; i++) {
            this.deleteThread(results[i]);
        }
    },

    deleteThread: function (thread) {
        if (mockDb.enabled) {
            mockDb.del([thread._id]);
        } else {
            this.$.deleteThreadService.send({ threadId: thread._id });
        }
        this.doDeleteThread({ thread: thread });
    },

    fail: function (inSender, inError) {
        this.error("delete buddy failed:", inError && (inError.errorText || inError));
    }
});
