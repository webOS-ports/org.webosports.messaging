/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Take Photo": the Camera app takes it and hands it back, as a phone's camera does for a chat app.
 *
 * Messaging launches the Camera app (org.webosports.app.camera) with
 * {"capture": {"returnTo": "org.webosports.app.messaging"}}. It takes photos only, shows the one
 * taken with Retake and Use Photo, and then relaunches Messaging and closes:
 * {"cameraCapture": {"path": "/media/internal/DCIM/....jpg"}} for Use Photo, or
 * {"cameraCapture": {"cancelled": true}} for Back.
 *
 * A Camera app from before that reads no "capture" and closes on nothing: the user comes back to
 * Messaging by hand. For that one, Messaging looks, once back in front, for the photos taken since:
 * the Camera app saves them in /media/internal/DCIM, and the media indexer, which watches that
 * folder, files them as com.palm.media.image.file:1 records with the file's mtime as modifiedTime
 * (seconds). Messaging may read that kind. It waits HANDBACK_WAIT_MS first, so that a Camera app
 * that hands the photo back is heard first: one it deleted for Retake can still be in the index.
 */

var CAMERA_APP = "org.webosports.app.camera";
var MESSAGING_APP = "org.webosports.app.messaging";
var IMAGE_KIND = "com.palm.media.image.file:1";
var PHOTO_DIR = "/media/internal/DCIM/";

// How long after Take Photo a photo still counts as taken for this chat.
var MAX_WAIT_SECONDS = 15 * 60;

// Back in front, how long to wait for the Camera app to say which photo before looking for it.
var HANDBACK_WAIT_MS = 1500;

// How many records to look at: screenshots and synced albums are filed in the same kind.
var QUERY_LIMIT = 50;

/** The applicationManager launch that opens the Camera app, to take a photo for Messaging. */
function launch() {
    return { id: CAMERA_APP, params: { capture: { returnTo: MESSAGING_APP } } };
}

/** A pending Take Photo for a chat, from the time it was asked for (ms since the epoch). */
function request(threadId, nowMs) {
    return { threadId: threadId, since: Math.floor(nowMs / 1000) };
}

/** True when a pending request is too old to give its photos to. */
function expired(req, nowMs) {
    return !req || Math.floor(nowMs / 1000) - req.since > MAX_WAIT_SECONDS;
}

/** The db8 find for the images written since the request, newest last. */
function query(req) {
    return {
        from: IMAGE_KIND,
        where: [{ prop: "modifiedTime", op: ">=", val: req.since }],
        orderBy: "modifiedTime",
        limit: QUERY_LIMIT
    };
}

/**
 * The photos the Camera app took since req, as staged attachments ({path, name, type}), oldest
 * first: only files in its folder (not a screenshot or a synced album taken meanwhile), each once.
 */
function photos(results, req) {
    var found = [], seen = {};
    for (var i = 0; results && i < results.length; i++) {
        var r = results[i];
        var path = r && typeof r.path === "string" ? r.path : "";
        var inFolder = path.indexOf(PHOTO_DIR) === 0 && path.length > PHOTO_DIR.length;
        var since = !!r && typeof r.modifiedTime === "number" && r.modifiedTime >= req.since;
        if (!inFolder || !since || Object.prototype.hasOwnProperty.call(seen, path)) {
            continue;
        }
        seen[path] = true;
        found.push({ path: path, time: r.modifiedTime });
    }
    found.sort(function (a, b) { return a.time - b.time; });
    return found.map(function (f) { return staged(f.path); });
}

/** A photo's path as a staged attachment. */
function staged(path) {
    return { path: path, name: path.slice(path.lastIndexOf("/") + 1), type: "image" };
}

/**
 * What the Camera app handed back (a relaunch's "cameraCapture") for a pending request:
 * {cancelled: true}, {photos: [staged]}, or null for nothing to take - no request, or one too old,
 * or not a JPEG in the Camera app's folder: any app may relaunch Messaging with this.
 */
function handedBack(capture, req, nowMs) {
    if (!capture || typeof capture !== "object" || expired(req, nowMs)) {
        return null;
    }
    if (capture.cancelled === true) {
        return { cancelled: true };
    }
    var path = capture.path;
    var ok = typeof path === "string" && path.indexOf(PHOTO_DIR) === 0 &&
        !/\/\.\.?(\/|$)/.test(path) && /[^/]\.jpe?g$/i.test(path);
    return ok ? { photos: [staged(path)] } : null;
}

module.exports = {
    CAMERA_APP: CAMERA_APP,
    IMAGE_KIND: IMAGE_KIND,
    PHOTO_DIR: PHOTO_DIR,
    MAX_WAIT_SECONDS: MAX_WAIT_SECONDS,
    HANDBACK_WAIT_MS: HANDBACK_WAIT_MS,
    launch: launch,
    request: request,
    expired: expired,
    query: query,
    photos: photos,
    handedBack: handedBack
};
