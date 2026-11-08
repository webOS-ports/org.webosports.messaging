/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The places in a received message, for its location chips (ConversationItem).
 *
 *   WhatsApp   the plugin writes "name\naddress\ngeo:lat,lng".
 *   Telegram   tdlib-purple (receiving.cpp) writes "Location: <a href=\"geo:lat,lng\">lat, lng</a>",
 *              and live ones as "Live location: ..." or "Live location until <time>: ...", but the
 *              link does not survive into the database: the app gets "Location: 52.370216, 4.895168".
 *   Discord    has no location message. A place shared to it from Android is text: a maps link, a
 *              line of degrees, minutes and seconds ("52°22'12.3\"N 4°53'45.6\"E"), the time, and
 *              the link again.
 *   Signal     the address, then "https://maps.google.com/maps?q=lat%2Clng" (the comma escaped).
 *   anyone     a Google Maps link with "?q=lat,lng", which is what this app itself sends a place as
 *              to a service that has no location message (util/chatActions locationText).
 *
 * The "Location:" and degrees lines are read only as whole lines, so a sentence that happens to
 * hold "location: 1, 2" is left alone. The same place found twice (a link and a line) is one chip.
 */

var GEO = /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/gi;
// A line starts at the start or after a break - "\n", "<br>", or purple's "<br />\n" - and ends at
// the end or a break.
var BEFORE = "(^|<br\\s*\\/?>\\r?\\n?|\\r?\\n)[ \\t]*";
var AFTER = "[ \\t]*(?=$|<br\\s*\\/?>|\\r?\\n)";
var LINE = new RegExp(BEFORE +
    "(?:Live location(?: until [^\\r\\n<]{1,40}?)?|Location): (-?\\d{1,2}(?:\\.\\d+)?), (-?\\d{1,3}(?:\\.\\d+)?)" +
    AFTER, "gi");
var DMS = new RegExp(BEFORE +
    "(\\d{1,2})°(\\d{1,2})'(\\d{1,2}(?:\\.\\d+)?)\"([NS]) (\\d{1,3})°(\\d{1,2})'(\\d{1,2}(?:\\.\\d+)?)\"([EW])" +
    AFTER, "g");
// The comma may be written as %2C: Signal's Android app sends "https://maps.google.com/maps?q=lat%2Clng".
var MAPS_Q = /https?:\/\/maps\.google\.[a-z.]{2,6}\/(?:maps)?\?(?:[^\s<"]*?&(?:amp;)?)?q=(-?\d{1,2}(?:\.\d+)?)(?:,|%2C)(-?\d{1,3}(?:\.\d+)?)/gi;

function inRange(lat, lng) {
    return Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

/** Degrees, minutes and seconds as decimal degrees, to 6 places; S and W are negative. */
function decimal(deg, min, sec, hemi) {
    var minutes = Number(min), seconds = Number(sec);
    if (minutes >= 60 || seconds >= 60) {
        return null;
    }
    var v = Number(deg) + minutes / 60 + seconds / 3600;
    v = Math.round(v * 1e6) / 1e6;
    return String(hemi === "S" || hemi === "W" ? -v : v);
}

function each(re, text, fn) {
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
        fn(m);
    }
}

/** [{ lat, lng }] as strings, in the order the kinds are listed above, each place once. */
function find(text) {
    text = String(text || "");
    var out = [], seen = {};
    var add = function (lat, lng) {
        if (lat === null || lng === null || !inRange(lat, lng)) {
            return;
        }
        var key = Number(lat).toFixed(4) + "," + Number(lng).toFixed(4);
        if (!seen[key]) {
            seen[key] = true;
            out.push({ lat: lat, lng: lng });
        }
    };
    each(GEO, text, function (m) { add(m[1], m[2]); });
    each(LINE, text, function (m) { add(m[2], m[3]); });
    each(DMS, text, function (m) { add(decimal(m[2], m[3], m[4], m[5]), decimal(m[6], m[7], m[8], m[9])); });
    each(MAPS_Q, text, function (m) { add(m[1], m[2]); });
    return out;
}

/**
 * The text without its geo: links, "Location:" lines and degrees lines, which the chips stand for.
 * A line goes with the break before it, so a caption around it keeps one break, not two. Maps
 * links stay: they are links, and the chip is beside them.
 */
function strip(text) {
    return String(text || "").replace(GEO, "").replace(LINE, function (all, before, lat, lng) {
        return inRange(lat, lng) ? "" : all;
    }).replace(DMS, function (all, before, d1, m1, s1, h1, d2, m2, s2, h2) {
        return decimal(d1, m1, s1, h1) !== null && decimal(d2, m2, s2, h2) !== null ? "" : all;
    });
}

module.exports = { find: find, strip: strip };
