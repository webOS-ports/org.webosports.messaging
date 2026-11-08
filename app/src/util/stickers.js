/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The stickers one can send: .webp files on this device, newest first, each once.
 *
 * A WhatsApp sticker is a .webp: the plugin sends a file whose bytes are WebP as a sticker
 * message (purple-combined send_file.go, send_file_sticker), whatever its name. So a sticker to
 * send is a .webp file, and two places know of some:
 *
 *   - the media index (mediaindexer, db8 kind com.palm.media.image.file:1, which Messaging may
 *     read): the pictures on the device outside hidden folders, with their mtime in seconds.
 *     A synced cloud photo is in it too, under its own "type"; only a local file is offered.
 *   - the chat's messages: a .webp sent from here has it as filePath, one received as a
 *     file:// URL in the text. The plugins' download folders (/media/internal/.im-attachments)
 *     are hidden, so the index has none of those.
 *
 * A received WhatsApp sticker is not among them: the plugin turns it into a PNG on download,
 * because the old WebKit could not draw WebP, and a PNG goes out as a picture, not a sticker.
 *
 * The same sticker can be in more than one place, and the plugins name a download by its
 * content hash, so a file named by a hash counts once wherever it is; any other file once by
 * its path.
 */

var IMAGE_KIND = "com.palm.media.image.file:1";
/** db8 answers at most 500 records a page; the newest that many pictures are looked through. */
var INDEX_LIMIT = 500;
/** As many as the grid shows. */
var MAX = 60;

var WEBP = /\.webp$/i;
var HASH_NAME = /^[0-9a-f]{32,}\.webp$/i;
var FILE_URL = /file:\/\/[^\s<>"']+/gi;

/** An absolute path to a .webp file. */
function isStickerPath(path) {
    return typeof path === "string" && path.charAt(0) === "/" && WEBP.test(path);
}

/** The path a file:// URL names, or "" for one that cannot be read. */
function pathOfUrl(url) {
    var path = String(url || "").replace(/^file:\/\//i, "").replace(/[?#].*$/, "");
    try {
        return decodeURI(path);
    } catch (e) {
        return "";
    }
}

/** A message's time in ms; some transports store theirs in seconds (as chatActions.sentAt). */
function messageTime(message) {
    var t = Number(message.localTimestamp || message.timestamp || 0);
    return t > 0 && t < 1e11 ? t * 1000 : t;
}

/** The query for the newest pictures in the media index. */
function indexQuery() {
    return {
        from: IMAGE_KIND,
        orderBy: "modifiedTime",
        desc: true,
        select: ["path", "mimeType", "modifiedTime", "type"],
        limit: INDEX_LIMIT
    };
}

/** The .webp files among media index records, as [{ path, time }]. */
function fromIndex(records) {
    var out = [];
    for (var i = 0; records && i < records.length; i++) {
        var r = records[i];
        if (!r || (r.type && r.type !== "local")) {
            continue;
        }
        if (isStickerPath(r.path) || (r.mimeType === "image/webp" && typeof r.path === "string" &&
                r.path.charAt(0) === "/")) {
            out.push({ path: r.path, time: (Number(r.modifiedTime) || 0) * 1000 });
        }
    }
    return out;
}

/** The .webp files a chat's messages sent or received, as [{ path, time }]. */
function fromMessages(messages) {
    var out = [];
    for (var i = 0; messages && i < messages.length; i++) {
        var m = messages[i];
        if (!m || m.deleted === true) {
            continue;
        }
        var time = messageTime(m);
        if (isStickerPath(m.filePath)) {
            out.push({ path: m.filePath, time: time });
        }
        var urls = String(m.messageText || "").match(FILE_URL) || [];
        for (var j = 0; j < urls.length; j++) {
            var path = pathOfUrl(urls[j]);
            if (isStickerPath(path)) {
                out.push({ path: path, time: time });
            }
        }
    }
    return out;
}

/** What makes two stickers the same: a content-hash name, else the path. */
function keyOf(path) {
    var name = path.slice(path.lastIndexOf("/") + 1);
    return HASH_NAME.test(name) ? "#" + name.toLowerCase() : path;
}

/**
 * The stickers of all the lists given, as [{ path, time }]: newest first, each once (at its
 * newest), at most max (MAX).
 */
function merge(lists, max) {
    var all = [];
    for (var i = 0; lists && i < lists.length; i++) {
        all = all.concat(lists[i] || []);
    }
    all.sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    var seen = {}, out = [], limit = max || MAX;
    for (var j = 0; j < all.length && out.length < limit; j++) {
        var key = keyOf(all[j].path);
        if (!Object.prototype.hasOwnProperty.call(seen, key)) {
            seen[key] = true;
            out.push(all[j]);
        }
    }
    return out;
}

/** The URL to draw a sticker's file with. */
function src(path) {
    return "file://" + encodeURI(path);
}

/** As a picked file is staged (util/attachments), for sending. */
function asAttachment(path) {
    return { path: path, name: path.slice(path.lastIndexOf("/") + 1), type: "image" };
}

module.exports = {
    IMAGE_KIND: IMAGE_KIND,
    MAX: MAX,
    isStickerPath: isStickerPath,
    indexQuery: indexQuery,
    fromIndex: fromIndex,
    fromMessages: fromMessages,
    merge: merge,
    src: src,
    asAttachment: asAttachment
};
