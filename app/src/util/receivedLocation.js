/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The places in a received message, for its location chips (ConversationItem).
 *
 * WhatsApp's plugin writes "name\naddress\ngeo:lat,lng". Telegram's (tdlib-purple receiving.cpp)
 * writes "Location: <a href=\"geo:lat,lng\">lat, lng</a>", and live ones as "Live location: ..."
 * or "Live location until <time>: ...", but the link does not survive into the database: what
 * the app gets is the line "Location: 52.370216, 4.895168". Both are read here; the Telegram line
 * is read only as a whole line, so a sentence that happens to hold "location: 1, 2" is left alone.
 */

var GEO = /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/gi;
// A whole line: start or a break before, a break or the end after. Breaks as text or as HTML.
var LINE = /(^|<br\s*\/?>|\r?\n)[ \t]*(?:Live location(?: until [^\r\n<]{1,40}?)?|Location): (-?\d{1,2}(?:\.\d+)?), (-?\d{1,3}(?:\.\d+)?)[ \t]*(?=$|<br\s*\/?>|\r?\n)/gi;

function inRange(lat, lng) {
    return Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

/** [{ lat, lng }] as strings, in the order they appear: geo: links, then location lines. */
function find(text) {
    text = String(text || "");
    var out = [], m;
    GEO.lastIndex = 0;
    while ((m = GEO.exec(text)) !== null) {
        out.push({ lat: m[1], lng: m[2] });
    }
    LINE.lastIndex = 0;
    while ((m = LINE.exec(text)) !== null) {
        if (inRange(m[2], m[3])) {
            out.push({ lat: m[2], lng: m[3] });
        }
    }
    return out;
}

/**
 * The text without its geo: links and location lines, which the chips stand for. A line goes
 * with the break before it, so a caption around it keeps one break, not two.
 */
function strip(text) {
    return String(text || "").replace(GEO, "").replace(LINE, function (all, before, lat, lng) {
        return inRange(lat, lng) ? "" : all;
    });
}

module.exports = { find: find, strip: strip };
