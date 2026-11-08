/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The pictures of a conversation, oldest first, as its bubbles draw them (ConversationItem):
 * each picture link or local picture file in a message's text, and the picture file a message we
 * sent carries (filePath). The image viewer steps through them (util/imageViewer).
 */

var mediaUrl = require('./mediaUrl'),
    messageState = require('./messageState');

var IMAGE_EXT = "jpg|jpeg|png|gif|webp|bmp|avif";
var IMAGE_RE = new RegExp("\\.(?:" + IMAGE_EXT + ")(?:\\?.*)?$", "i");

function isPicture(url) {
    return IMAGE_RE.test(String(url || "").split("#")[0]);
}

/** [{ url, messageId }] of messages (any order), oldest first; a deleted message has none. */
function list(messages) {
    var sorted = (messages || []).filter(function (m) { return m && !messageState.isDeleted(m); })
        .slice().sort(function (a, b) { return (a.localTimestamp || 0) - (b.localTimestamp || 0); });
    var out = [], seen = {};
    function add(url, id) {
        if (url && isPicture(url) && !seen[url]) {
            seen[url] = true;
            out.push({ url: url, messageId: id });
        }
    }
    sorted.forEach(function (m) {
        var re = mediaUrl.mediaUrlRe(IMAGE_EXT), found;
        var text = String(m.messageText || "");
        while ((found = re.exec(text)) !== null) {
            add(found[0].replace(/&amp;/g, "&"), m._id);
        }
        if (m.filePath) {
            add((m.filePath.indexOf("file://") === 0) ? m.filePath : "file://" + m.filePath, m._id);
        }
    });
    return out;
}

/** Where url is in pictures, comparing as the bubble's markup gives it (" as %22); -1 if not. */
function indexOf(pictures, url) {
    var u = String(url || "");
    for (var i = 0; i < pictures.length; i++) {
        var p = pictures[i].url;
        if (p === u || p.replace(/"/g, "%22") === u) {
            return i;
        }
    }
    return -1;
}

module.exports = { list: list, indexOf: indexOf, isPicture: isPicture };
