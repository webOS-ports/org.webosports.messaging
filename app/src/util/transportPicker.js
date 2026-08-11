/**
 * Works out which addresses a conversation can be sent on, and which one is currently selected.
 * Condensed from com.palm.app.messaging/app/conversations/transportPicker.js.
 *
 * A "transport" is one sendable address: an IM screen name or a phone number, paired with the
 * account that can send to it. The picker in the conversation header lists these, and the selected
 * one determines the service name, db kind and recipient used when sending.
 */

var messagingUtils = require('./messagingUtils'),
    appState = require('./appState');

var transports = [];
var selectedTransport = null;

/** Friendly label for a phone number type, e.g. "type_mobile" -> "Mobile". */
function phoneLabel(type) {
    return messagingUtils.utils.phoneNumberLabels[type] || type.replace(/^type_/, "");
}

/** Friendly label for an IM service, taken from the account template where available. */
function serviceLabel(serviceName) {
    var accountService = appState.accountService;
    if (accountService && accountService.getMyAccountTypesHash) {
        var types = accountService.getMyAccountTypesHash();
        var tmpl = types && types[serviceName];
        if (tmpl && (tmpl.loc_shortName || tmpl.loc_name)) {
            return tmpl.loc_shortName || tmpl.loc_name;
        }
    }
    return String(serviceName || "").replace(/^type_/, "");
}

module.exports = {
    getTransports: function () {
        return transports;
    },

    getSelectedTransport: function () {
        return selectedTransport;
    },

    setSelectedTransport: function (transport) {
        selectedTransport = transport;
    },

    /**
     * Build the transport list from a person's addresses, keeping only those the user actually has
     * an account for, then select the one matching the thread's reply address.
     */
    setTransportsByPerson: function (person, chatThread) {
        var accountService = appState.accountService;
        var list = [];
        var i;

        if (person && person.ims) {
            for (i = 0; i < person.ims.length; i++) {
                var im = person.ims[i];
                var account = accountService && accountService.getAccount(im.type);
                if (!account) {
                    continue;   // no account of this type, so nothing could send to it
                }
                list.push({
                    displayName: messagingUtils.person.getDisplayName(person),
                    replyAddress: im.value,
                    serviceName: im.type,
                    label: serviceLabel(im.type),
                    isPhone: false,
                    availability: im.availability,
                    account: account
                });
            }
        }

        if (person && person.phoneNumbers) {
            var smsAccount = accountService && accountService.getAccount("sms");
            if (smsAccount) {
                for (i = 0; i < person.phoneNumbers.length; i++) {
                    var phone = person.phoneNumbers[i];
                    list.push({
                        displayName: messagingUtils.person.getDisplayName(person),
                        replyAddress: phone.value,
                        serviceName: "sms",
                        label: phoneLabel(phone.type),
                        isPhone: true,
                        account: smsAccount
                    });
                }
            }
        }

        transports = list;
        this.selectForThread(chatThread);
        return transports;
    },

    /**
     * A thread with no linked person can only be sent on the address it already carries, so the
     * transport list is that single entry.
     */
    setTransportsByChatThread: function (chatThread) {
        if (!chatThread) {
            transports = [];
            selectedTransport = null;
            return transports;
        }
        var accountService = appState.accountService;
        var serviceName = chatThread.replyService || chatThread.serviceName;

        transports = [{
            displayName: chatThread.displayName || chatThread.replyAddress,
            replyAddress: chatThread.replyAddress,
            serviceName: serviceName,
            label: messagingUtils.utils.isTextMessage(serviceName) ?
                serviceLabel("sms") : serviceLabel(serviceName),
            isPhone: messagingUtils.utils.isTextMessage(serviceName),
            account: accountService && accountService.getAccount(serviceName)
        }];
        selectedTransport = transports[0];
        return transports;
    },

    /** Pick the transport matching the thread's reply address, else the first one. */
    selectForThread: function (chatThread) {
        selectedTransport = null;
        if (!chatThread) {
            selectedTransport = transports[0] || null;
            return selectedTransport;
        }

        var wanted = messagingUtils.utils.normalizeAddress(
            chatThread.replyAddress, chatThread.replyService);

        for (var i = 0; i < transports.length; i++) {
            var candidate = messagingUtils.utils.normalizeAddress(
                transports[i].replyAddress, transports[i].serviceName);
            if (candidate === wanted) {
                selectedTransport = transports[i];
                break;
            }
        }
        if (!selectedTransport) {
            selectedTransport = transports[0] || null;
        }
        return selectedTransport;
    },

    /** Menu label for a transport: the address plus what kind of address it is. */
    labelFor: function (transport) {
        if (!transport) {
            return "";
        }
        var addr = messagingUtils.utils.formatAddress(transport.replyAddress, transport.serviceName);
        return transport.label ? (addr + " " + transport.label) : addr;
    }
};
