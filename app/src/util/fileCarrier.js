var messagingUtils = require('./messagingUtils');

/**
 * Whether a message sent on a service can take a file with it.
 *
 * An IM message can: its record carries filePath and the transport plugin uploads the file. A text
 * message could only as an MMS, and nothing below the app sends one yet. webos-telephonyd's sender
 * (src/telephonyservice_sms.c) reads _id, to[].addr, messageText, simId and inhibitNetworkSend
 * from com.palm.smsmessage:1 outbox records and hands the text to oFono; it never looks at a file.
 * The com.palm.mmsmessage:1 kind is installed, but no service watches its outbox or talks to mmsd
 * (org.ofono.mms). So MMS_SEND is false and SMS takes text only.
 *
 * Turn it on only together with a send path that writes the record the MMS sender reads; the
 * views write com.palm.smsmessage:1 for every text message, and an SMS record with a filePath is
 * sent as its text alone.
 */
var MMS_SEND = false;

/** True when a message on serviceName can carry a file. */
function canCarry(serviceName) {
    return messagingUtils.utils.isTextMessage(serviceName) ? MMS_SEND : true;
}

/**
 * True when sending now on serviceName would leave staged files behind: there are some and the
 * service cannot carry them. The send has to stop and say so instead of going out as text only.
 */
function wouldDrop(staged, serviceName) {
    return !!(staged && staged.length) && !canCarry(serviceName);
}

module.exports = { MMS_SEND: MMS_SEND, canCarry: canCarry, wouldDrop: wouldDrop };
