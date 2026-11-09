/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A file the transport offers rather than downloads: a video, a music file, a document over 1 MB.
 * Pictures, voice notes, stickers and small documents come as their file; these wait for a tap.
 * The plugin stores the message with this as its first line (tdlib-purple, tap to download):
 *
 *   luneos-file:?name=<urlencoded>&size=<bytes>&type=<video|audio|document>&state=<ask|downloading|failed>[&got=<bytes>]
 *
 * and the caption, if any, after it. A tap sends the transport downloadFile with the message's
 * serviceMessageId (util/chatActions downloadFileCommand); the plugin rewrites the line as the
 * download goes (state=downloading, got=), and once it is there replaces the text with the
 * file's file:// URL and the caption, which the chat draws as any received file.
 */

var TOKEN = /luneos-file:\?([^\s<>"']*)/;
var STATES = { ask: true, downloading: true, failed: true };
var TYPES = { video: true, audio: true, document: true };

function decode(s) {
    try {
        return decodeURIComponent(String(s).replace(/\+/g, " "));
    } catch (e) {
        return null;
    }
}

/** The offer in a message's text, or null. The text may be stored as HTML ("&amp;"). */
function find(text) {
    var m = TOKEN.exec(String(text || ""));
    if (!m) {
        return null;
    }
    var fields = {};
    m[1].replace(/&amp;/g, "&").split("&").forEach(function (pair) {
        var eq = pair.indexOf("=");
        if (eq > 0) {
            var value = decode(pair.slice(eq + 1));
            if (value !== null) {
                fields[pair.slice(0, eq)] = value;
            }
        }
    });
    var size = Number(fields.size), got = Number(fields.got);
    return {
        name: String(fields.name || "").replace(/[\u0000-\u001f]/g, "").trim(),
        size: isFinite(size) && size > 0 ? Math.floor(size) : 0,
        type: TYPES[fields.type] ? fields.type : "document",
        state: STATES[fields.state] ? fields.state : "ask",
        got: isFinite(got) && got > 0 ? Math.floor(got) : 0
    };
}

/** The text without the offer's line: the caption, if there is one. */
function strip(text) {
    return String(text || "").replace(new RegExp(TOKEN.source + "(?:\\s*<br\\s*/?>)?[\\r\\n]*"), "");
}

/** A size as people read it: "820 KB", "12.5 MB", "1.2 GB". */
function sizeText(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024 * 1024) {
        return Math.max(1, Math.round(n / 1024)) + " KB";
    }
    if (n < 1024 * 1024 * 1024) {
        var mb = n / (1024 * 1024);
        return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + " MB";
    }
    return (n / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

/**
 * What the card says under the name. asked: a tap was just sent and the transport has not
 * answered yet. $L: the translator.
 */
function status(offer, asked, $L) {
    var size = offer.size ? sizeText(offer.size) + " · " : "";
    if (offer.state === "downloading" || (asked && offer.state !== "failed")) {
        if (offer.state === "downloading" && offer.size && offer.got) {
            var pct = Math.min(99, Math.floor(offer.got * 100 / offer.size));
            return size + $L("Downloading… {pct}%").replace("{pct}", pct);
        }
        return size + $L("Downloading…");
    }
    if (offer.state === "failed") {
        return size + $L("Couldn't download. Tap to try again.");
    }
    return size + $L("Tap to download");
}

/** Whether a tap starts a download: not while one is going. */
function canStart(offer, asked) {
    return !!offer && offer.state !== "downloading" && !(asked && offer.state === "ask");
}

module.exports = {
    find: find,
    strip: strip,
    sizeText: sizeText,
    status: status,
    canStart: canStart
};
