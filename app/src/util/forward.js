/**
 * Forward and Forward Via Email from the message menu, as the legacy app had them.
 *
 * Forward opens New Conversation with the message's text, and its file when it has one on this
 * device, for the user to pick who it goes to. Forward Via Email opens the email app's compose
 * with the same, through its newEmail launch parameter (com.palm.app.email
 * nowindow/source/Launch.js: text, isHtml, attachments[].fullPath).
 */

var messagingUtils = require('./messagingUtils');

/** The message's text as typed: no markup, no escapes, line breaks kept. "" for none. */
function text(message) {
    var m = messagingUtils.message;
    var raw = message && message.messageText;
    if (!raw) {
        return "";
    }
    var plain = m.removeHtml(String(raw).replace(/<br\s*\/?>/gi, "\n"));
    return m.decodeNumericEntities(m.unescapeText(plain));
}

/** The message's file as a path on this device, or null when it has none here. */
function file(message) {
    var path = message && message.filePath;
    if (typeof path !== "string" || !path) {
        return null;
    }
    if (path.indexOf("file://") === 0) {
        try {
            path = decodeURI(path.slice("file://".length));
        } catch (e) {
            return null;
        }
    }
    return path.charAt(0) === "/" ? path : null;
}

/** ComposeView params for Forward, or null when the message has nothing to forward. */
function composeParams(message) {
    var params = {}, t = text(message), f = file(message);
    if (t) {
        params.messageText = t;
    }
    if (f) {
        params.filePath = f;
    }
    return (t || f) ? params : null;
}

/** applicationManager launch params for Forward Via Email, or null for nothing to forward. */
function emailLaunch(message) {
    var t = text(message), f = file(message);
    if (!t && !f) {
        return null;
    }
    var email = { text: t, isHtml: false };
    if (f) {
        email.attachments = [{ fullPath: f }];
    }
    return { id: "com.palm.app.email", params: { newEmail: email } };
}

module.exports = { text: text, file: file, composeParams: composeParams, emailLaunch: emailLaunch };
