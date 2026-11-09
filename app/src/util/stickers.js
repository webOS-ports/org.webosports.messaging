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
 * A received WhatsApp sticker is among them from purple-combined patch 0061 on, which keeps it as
 * the .webp it came as. Before, the plugin turned it into a PNG on download, because the old
 * WebKit could not draw WebP, and a PNG goes out as a picture, not a sticker: those stay out.
 *
 * The same sticker can be in more than one place, and the plugins name a download by its
 * content hash, so a file named by a hash counts once wherever it is; any other file once by
 * its path.
 */

var IMAGE_KIND = "com.palm.media.image.file:1";
/** db8 answers at most 500 records a page; the newest that many pictures are looked through. */
var INDEX_LIMIT = 500;
/** As many of one's own as the grid shows; the defaults come after them. */
var MAX = 60;

/**
 * The stickers the app brings (app/assets/stickers, made by tools/make-default-stickers.py from
 * Noto Emoji, Apache-2.0): offered after one's own, so that there are always some to send.
 */
var DEFAULTS_DIR = "assets/stickers/";
var DEFAULTS = [
    "01-emoji-u1f602.webp", "02-emoji-u1f923.webp", "03-emoji-u1f60a.webp", "04-emoji-u1f60d.webp",
    "05-emoji-u1f618.webp", "06-emoji-u1f609.webp", "07-emoji-u1f60e.webp", "08-emoji-u1f914.webp",
    "09-emoji-u1f605.webp", "10-emoji-u1f62d.webp", "11-emoji-u1f621.webp", "12-emoji-u1f631.webp",
    "13-emoji-u1f973.webp", "14-emoji-u1f634.webp", "15-emoji-u1f644.webp", "16-emoji-u1f917.webp",
    "17-emoji-u1f44d.webp", "18-emoji-u1f44f.webp", "19-emoji-u1f64f.webp", "20-emoji-u1f4aa.webp",
    "21-emoji-u1f44b.webp", "22-emoji-u2764.webp", "23-emoji-u1f525.webp", "24-emoji-u1f389.webp"
];

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

/**
 * The app's own stickers as files, from the address of its page (a file:// URL on the device):
 * the plugin sends a file, so a sticker needs a path. None for a page served otherwise.
 */
function defaults(pageUrl) {
    var page = String(pageUrl || "").replace(/[?#].*$/, "");
    if (!/^file:\/\/\//i.test(page)) {
        return [];
    }
    var dir = pathOfUrl(page.slice(0, page.lastIndexOf("/") + 1));
    if (!dir) {
        return [];
    }
    return DEFAULTS.map(function (name) { return { path: dir + DEFAULTS_DIR + name, time: 0 }; });
}

/** One's own stickers (merge()), then the defaults not among them. */
function withDefaults(own, bundled) {
    var seen = {}, out = (own || []).slice();
    out.forEach(function (s) { seen[keyOf(s.path)] = true; });
    (bundled || []).forEach(function (s) {
        if (!Object.prototype.hasOwnProperty.call(seen, keyOf(s.path))) {
            seen[keyOf(s.path)] = true;
            out.push(s);
        }
    });
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
    DEFAULTS: DEFAULTS,
    DEFAULTS_DIR: DEFAULTS_DIR,
    defaults: defaults,
    withDefaults: withDefaults,
    src: src,
    asAttachment: asAttachment
};
