/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The picture viewer's Save: the picture into /media/internal/Messaging, where the media indexer
 * files it and Photos shows it. The chat services keep what they receive in folders the indexer
 * leaves alone, so Photos could not show a chat's picture at all.
 *
 *   on the device (file://)   the messaging service copies it (its savePicture): a web app
 *                             cannot copy a file, and the download manager takes no file://
 *   on the web (http, https)  com.webos.service.downloadmanager fetches it there, as
 *                             util/remoteCard does a card: same request, same replies
 */

var remoteCard = require('./remoteCard');

var DIR = "/media/internal/Messaging";
var PICTURE = /\.(jpe?g|png|gif|webp|bmp)$/i;

function clean(url) {
    return String(url || "").replace(/&amp;/g, "&");
}

/** How a picture is saved: "copy", "download", or null for one that cannot be. */
function how(url) {
    var u = clean(url);
    if (/^file:\/\/\/./i.test(u)) {
        return "copy";
    }
    if (/^https?:\/\/[^\s"<>]+$/i.test(u)) {
        return "download";
    }
    return null;
}

/** The service's savePicture parameters for a picture on the device. */
function copyRequest(url) {
    return { path: clean(url) };
}

/**
 * A web picture's name, from its address: the last part of its path, with no query (a CDN's
 * signature changes), kept to the characters a file name can safely have, and ending in a
 * picture's extension, which Photos needs to take it for one.
 */
function fileName(url) {
    var path = clean(url).replace(/[?#].*$/, "");
    var last = path.slice(path.lastIndexOf("/") + 1);
    try { last = decodeURIComponent(last); } catch (e) { /* keep it as it is */ }
    last = last.replace(/[^A-Za-z0-9._ ()-]+/g, "_").replace(/^[._ ]+/, "").slice(-80);
    if (!last) {
        last = "picture";
    }
    return PICTURE.test(last) ? last : last + ".jpg";
}

/** The download manager's parameters for a picture on the web. */
function downloadRequest(url) {
    return { target: clean(url), targetDir: DIR, targetFilename: fileName(url), subscribe: true };
}

module.exports = {
    DIR: DIR,
    how: how,
    copyRequest: copyRequest,
    fileName: fileName,
    downloadRequest: downloadRequest,
    // The download's replies read as a card's do.
    outcome: remoteCard.outcome
};
