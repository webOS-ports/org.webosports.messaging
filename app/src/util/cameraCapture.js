/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Take Photo": the Camera app takes it, and the photo comes back from the media index.
 *
 * LuneOS has nothing that takes a picture for another app and hands the file back: the Camera app
 * (org.webosports.app.camera) reads no launch parameter but "scan", the system file picker has no
 * camera, and the camera services want a viewfinder of their own (com.webos.service.camera2 on a
 * Halium device gives raw NV21 frames, mediarecorder's takeSnapshot needs a video recording
 * running). So Messaging opens the Camera app, and when it is back in front looks for the photos
 * taken since: the Camera app saves them in /media/internal/DCIM, and the media indexer, which
 * watches that folder, files them as com.palm.media.image.file:1 records with the file's mtime as
 * modifiedTime (seconds). Messaging may read that kind.
 */

var CAMERA_APP = "org.webosports.app.camera";
var IMAGE_KIND = "com.palm.media.image.file:1";
var PHOTO_DIR = "/media/internal/DCIM/";

// How long after Take Photo a photo still counts as taken for this chat.
var MAX_WAIT_SECONDS = 15 * 60;

// How many records to look at: screenshots and synced albums are filed in the same kind.
var QUERY_LIMIT = 50;

/** The applicationManager launch that opens the Camera app. */
function launch() {
    return { id: CAMERA_APP, params: {} };
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
    return found.map(function (f) {
        return { path: f.path, name: f.path.slice(f.path.lastIndexOf("/") + 1), type: "image" };
    });
}

module.exports = {
    CAMERA_APP: CAMERA_APP,
    IMAGE_KIND: IMAGE_KIND,
    PHOTO_DIR: PHOTO_DIR,
    MAX_WAIT_SECONDS: MAX_WAIT_SECONDS,
    launch: launch,
    request: request,
    expired: expired,
    query: query,
    photos: photos
};
