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
 *
 * A tap on a sent card shows its person in Contacts: by the personId the card was sent with, or,
 * for a card sent before that was kept, the card itself (name, numbers, addresses), which Contacts
 * shows and offers to add (util/launchTargets sentContactLaunch).
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

/** Each value of a vCard property (TEL, EMAIL), its folded lines joined and escapes undone. */
function vcardValues(vcard, prop) {
    var text = String(vcard || "").replace(/\r?\n[ \t]/g, "");
    var re = new RegExp("^" + prop + "(?:;[^:\\r\\n]*)?:(.*)$", "gim"), out = [], m;
    while ((m = re.exec(text)) !== null) {
        var v = vcardUnescape(m[1]).trim();
        if (v && out.indexOf(v) < 0) {
            out.push(v);
        }
    }
    return out;
}

/**
 * { name, personId, phones, emails } of a contact card we sent, or null. personId is the contact's
 * it was sent from, when the card kept it ("" otherwise).
 */
function sentContact(message) {
    var card = message && message.folder === OUTBOX && message.contactCard;
    if (!card || typeof card.vcard !== "string" || !/BEGIN:VCARD/i.test(card.vcard)) {
        return null;
    }
    var fromCard = vcardName(card.vcard);
    var name = fromCard ||
        String(message.messageText || "").split(/\r?\n|<br\s*\/?>/i)[0].trim();
    return {
        name: name || $L("Contact card"),
        fullName: fromCard || name,
        personId: typeof card.personId === "string" ? card.personId : "",
        phones: vcardValues(card.vcard, "TEL"),
        emails: vcardValues(card.vcard, "EMAIL")
    };
}

module.exports = {
    sentLocation: sentLocation,
    sentContact: sentContact,
    vcardName: vcardName,
    vcardValues: vcardValues
};
