var messagingUtils = require('./messagingUtils');

/**
 * Calling a contact from a chat, as the revival Messaging app did: through the phone app, over the
 * service picked in the header.
 */

var PHONE_APP = "org.webosports.app.phone";
// The phone app's id for the modem. Named outright: with no transport it may ask which account
// to call with, and an SMS number picked in the chat is meant as a phone call.
var CELLULAR = "com.palm.telephony";

function isCellular(transport) {
    return !!(transport && (transport.isPhone || messagingUtils.utils.isTextMessage(transport.serviceName)));
}

/**
 * Which calls a transport offers: { voice, video }. None in a group chat, which has no one person
 * to call, and none without an address.
 */
function callOptions(transport, accountService, isGroup) {
    var none = { voice: false, video: false };
    if (!transport || !transport.replyAddress || isGroup || !accountService) {
        return none;
    }
    var serviceName = isCellular(transport) ? "sms" : transport.serviceName;
    return {
        voice: !!accountService.hasVoiceCapability(serviceName),
        video: !!accountService.hasVideoCapability(serviceName)
    };
}

/**
 * The applicationManager launch that places the call. A phone number on SMS is a cellular call;
 * an IM service goes by its service name ("type_signal"), which the phone app resolves to that
 * service's calling driver.
 */
function callRequest(transport, video) {
    if (!transport || !transport.replyAddress) {
        return null;
    }
    return {
        id: PHONE_APP,
        params: {
            action: "dial", address: transport.replyAddress, video: video === true,
            transport: isCellular(transport) ? CELLULAR : transport.serviceName
        }
    };
}

module.exports = { callOptions: callOptions, callRequest: callRequest, PHONE_APP: PHONE_APP };
