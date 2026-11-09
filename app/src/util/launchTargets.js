/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a tap on a message's location or contact card launches, and how an outgoing message's text
 * is drawn.
 *
 *   location  the Maps app on LuneOS is org.webosports.app.maps; it takes { target: "geo:lat,lng" }
 *             (its handleLaunchParams). There is no com.palm.app.maps, so launching that did nothing.
 *   contact   Contacts (com.palm.app.contacts, src/util/launch) imports a vCard given as
 *             { target: "file:///path/to/card.vcf" } and hands it to com.palm.service.contacts'
 *             countVCardContacts/readVCard as filePath, which wants the file:// form (a bare
 *             path is refused). The card's URL carries "?name=" for the bubble's label
 *             (util/attachments), which is not part of the file's name: with it the service finds
 *             no file.
 */

var MAPS_APP = "org.webosports.app.maps",
    CONTACTS_APP = "com.palm.app.contacts";

/** The Maps launch for "lat,lng", or null when it is not a place. */
function mapsLaunch(latLng) {
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(latLng || ""));
    return m ? { id: MAPS_APP, params: { target: "geo:" + m[1] + "," + m[2] } } : null;
}

/** The file a vCard URL names: no file://, no ?query or #fragment, percent-escapes undone. */
function vcardPath(url) {
    var path = String(url || "").replace(/[?#].*$/, "").replace(/^file:\/\//i, "");
    try {
        path = decodeURIComponent(path);
    } catch (e) {
        // a stray "%": keep it as written
    }
    return /^\/[^\0]+$/.test(path) ? path : null;
}

/** The Contacts launch that shows a vCard's person to add, or null when it names no file. */
function contactLaunch(url) {
    var path = vcardPath(url);
    return path ? { id: CONTACTS_APP, params: { target: "file://" + path } } : null;
}

/**
 * The Contacts launch for a card we sent (util/sentExtras sentContact): the person it was sent
 * from, else the card to show and offer to add. null when it holds nothing to show.
 */
function sentContactLaunch(card) {
    if (!card) {
        return null;
    }
    if (card.personId) {
        return { id: CONTACTS_APP, params: { launchType: "showPerson", id: card.personId } };
    }
    var contact = {};
    if (card.fullName) {
        contact.name = { givenName: card.fullName };
    }
    if (card.phones && card.phones.length) {
        contact.phoneNumbers = card.phones.map(function (v) { return { value: v, type: "type_mobile" }; });
    }
    if (card.emails && card.emails.length) {
        contact.emails = card.emails.map(function (v) { return { value: v, type: "type_home" }; });
    }
    if (!contact.phoneNumbers && !contact.emails) {
        return null;
    }
    return { id: CONTACTS_APP, params: { launchType: "pseudo-card", contact: contact } };
}

/**
 * An outgoing message's text as HTML. What was typed here is plain text, escaped whole. A message
 * sent from the phone's own app comes back through the bridge the way a received one does, with
 * each line break written "<br />" and a newline (purple's strdup_withhtml); that break is kept
 * as a break rather than shown as the letters "<br />". Every line break is drawn.
 */
function outgoingHtml(text, escapeHtml) {
    var plain = String(text || "").replace(/<br\s*\/?>\r?\n?/gi, "\n");
    return escapeHtml(plain).replace(/\r\n|\r|\n/g, "<br>");
}

module.exports = {
    MAPS_APP: MAPS_APP,
    mapsLaunch: mapsLaunch,
    vcardPath: vcardPath,
    contactLaunch: contactLaunch,
    sentContactLaunch: sentContactLaunch,
    outgoingHtml: outgoingHtml
};
