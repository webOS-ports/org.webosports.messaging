/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A location or contact card we sent, so its bubble can look like one received.
 *
 * Both go out as an ordinary message whose text is their plain form ("My location" and a maps
 * link; the name and each number), which is what every service and SMS gets (util/chatActions).
 * The record keeps what was sent beside it: location { latitude, longitude, name } and
 * contactCard { vcard }. A received one is drawn as a chip (ConversationItem), so a sent one is
 * drawn from these fields the same way rather than from its text.
 */

var $L = require('enyo/i18n').$L;

var OUTBOX = "outbox";

function finite(n) {
    return typeof n === "number" && isFinite(n);
}

/** { lat, lng, name } of a location we sent, or null. name is "" when it had none. */
function sentLocation(message) {
    var loc = message && message.folder === OUTBOX && message.location;
    if (!loc || !finite(loc.latitude) || !finite(loc.longitude) ||
            Math.abs(loc.latitude) > 90 || Math.abs(loc.longitude) > 180) {
        return null;
    }
    return { lat: loc.latitude, lng: loc.longitude, name: String(loc.name || "").trim() };
}

/** A vCard value with its escapes undone (RFC 6350 3.4). */
function vcardUnescape(s) {
    return String(s).replace(/\\([\\,;nN])/g, function (all, c) {
        return (c === "n" || c === "N") ? " " : c;
    });
}

/** The FN of a vCard, its folded lines joined, or "". */
function vcardName(vcard) {
    var text = String(vcard || "").replace(/\r?\n[ \t]/g, "");
    var m = /^FN(?:;[^:\r\n]*)?:(.*)$/im.exec(text);
    return m ? vcardUnescape(m[1]).trim() : "";
}

/** { name } of a contact card we sent, or null. */
function sentContact(message) {
    var card = message && message.folder === OUTBOX && message.contactCard;
    if (!card || typeof card.vcard !== "string" || !/BEGIN:VCARD/i.test(card.vcard)) {
        return null;
    }
    var name = vcardName(card.vcard) ||
        String(message.messageText || "").split(/\r?\n|<br\s*\/?>/i)[0].trim();
    return { name: name || $L("Contact card") };
}

module.exports = {
    sentLocation: sentLocation,
    sentContact: sentContact,
    vcardName: vcardName
};
