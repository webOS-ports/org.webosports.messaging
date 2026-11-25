/**
 * SMS delivery reports. With "Delivery Reports" on in Preferences, an outgoing SMS asks the
 * network for a status report: the app sets flags.deliveryReport on the message, and the
 * telephony service asks ofono for the report and writes what comes back into the message as
 * deliveryStatus, "delivered" or "undelivered" (webos-telephonyd, telephonyservice_sms.c).
 *
 * deliveryStatus is the field the IM transports set for their receipts ("delivered", "read"),
 * so one tick shows either. "undelivered" is SMS only: the network gave up on the message.
 */

/** Whether a message to be sent with serviceName asks for a delivery report. */
function wanted(serviceName, prefs) {
    return serviceName === "sms" && !!(prefs && prefs.smsDeliveryReports === true);
}

/**
 * The receipt icon an outgoing message shows for its deliveryStatus, or null for none. Incoming
 * messages show none.
 */
function receiptIcon(status, outgoing) {
    if (!outgoing) {
        return null;
    }
    switch (status) {
    case "read":
        return "assets/msg-read.svg";
    case "delivered":
        return "assets/msg-delivered.svg";
    case "undelivered":
        return "assets/msg-undelivered.svg";
    default:
        return null;
    }
}

module.exports = {
    wanted: wanted,
    receiptIcon: receiptIcon
};
