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

/**
 * The transport for an address on a service: both matching first, then the service, then (unless
 * sameServiceOnly) the address alone.
 */
function pick(address, serviceName, sameServiceOnly) {
    var wanted = address ?
        messagingUtils.utils.normalizeAddress(address, serviceName) : null;
    var byService = null, byAddress = null;
    for (var i = 0; i < transports.length; i++) {
        var t = transports[i];
        var sameAddress = wanted !== null &&
            messagingUtils.utils.normalizeAddress(t.replyAddress, t.serviceName) === wanted;
        var sameService = !!serviceName && sameServiceName(t.serviceName, serviceName);
        if (sameAddress && sameService) {
            return t;
        }
        if (sameService && !byService) {
            byService = t;
        }
        if (sameAddress && !byAddress) {
            byAddress = t;
        }
    }
    return byService || (sameServiceOnly ? null : byAddress);
}

/** "sms" and "mms" are one transport: both send on the phone's SMS account. */
function sameServiceName(a, b) {
    var utils = messagingUtils.utils;
    return a === b || (utils.isTextMessage(a) && utils.isTextMessage(b));
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

    /**
     * Pick the transport the thread was last used on: its reply address on its reply service,
     * else the reply service, else the address on any service, else the first one.
     *
     * The service has to count. Signal and WhatsApp both use the phone number as the address, so
     * matching on the address alone took whichever the contact listed first, and a Signal
     * message got its reply on WhatsApp.
     */
    selectForThread: function (chatThread) {
        selectedTransport = null;
        if (!chatThread) {
            selectedTransport = transports[0] || null;
            return selectedTransport;
        }
        selectedTransport = pick(chatThread.replyAddress, chatThread.replyService) ||
            transports[0] || null;
        return selectedTransport;
    },

    /**
     * Follow an incoming message onto the transport it came in on, so the reply goes back the
     * same way. Returns true when the selection changed; leaves it alone when no transport fits.
     */
    followMessage: function (message) {
        if (!message || !message.serviceName) {
            return false;
        }
        var match = pick(message.from && message.from.addr, message.serviceName, true);
        if (!match || match === selectedTransport) {
            return false;
        }
        selectedTransport = match;
        return true;
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
