var messagingUtils = require('./messagingUtils');

/**
 * Whether a message sent on a service can take a file with it.
 *
 * An IM message can: its record carries filePath and the transport plugin uploads the file. A text
 * message can only as an MMS: the views then write one com.palm.mmsmessage:1 record (util/mms.js)
 * that webos-telephonyd hands to mmsd (org.ofono.mms). An SMS record with a filePath would be sent
 * as its text alone (src/telephonyservice_sms.c reads text only).
 *
 * MMS_SEND says the app writes MMS records at all. Whether one can go out now is telephonyd's
 * answer to mmsStatusQuery - mmsd has a service only with a SIM and an MMS context - which
 * MainView passes to setMmsAvailable. Until it has answered, a text message takes no file.
 */
var MMS_SEND = true;
var mmsAvailable = false;

/** What telephonyd last said: true when an MMS can be sent now. */
function setMmsAvailable(available) {
    mmsAvailable = available === true;
}

function isMmsAvailable() {
    return MMS_SEND && mmsAvailable;
}

/** True when a message on serviceName can carry a file. */
function canCarry(serviceName) {
    return messagingUtils.utils.isTextMessage(serviceName) ? isMmsAvailable() : true;
}

/** True when the files staged for a text message go out as one MMS. */
function sendsAsMms(staged, serviceName) {
    return !!(staged && staged.length) && messagingUtils.utils.isTextMessage(serviceName) && isMmsAvailable();
}

/**
 * True when sending now on serviceName would leave staged files behind: there are some and the
 * service cannot carry them. The send has to stop and say so instead of going out as text only.
 */
function wouldDrop(staged, serviceName) {
    return !!(staged && staged.length) && !canCarry(serviceName);
}

module.exports = {
    MMS_SEND: MMS_SEND,
    setMmsAvailable: setMmsAvailable,
    isMmsAvailable: isMmsAvailable,
    canCarry: canCarry,
    sendsAsMms: sendsAsMms,
    wouldDrop: wouldDrop
};
