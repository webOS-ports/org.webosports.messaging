/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A contact card that came as a link, not a file: Discord has no contact message, so a card
 * shared to it is an attachment on its CDN ("https://cdn.discordapp.com/.../card.vcf?ex=...").
 * Contacts imports only a local file (util/launchTargets contactLaunch), so the card is fetched
 * first with com.webos.service.downloadmanager (luna-downloadmgr, DownloadService.cpp cbDownload):
 *
 *   download { target: url, targetDir, targetFilename, subscribe: true }
 *     first reply   { returnValue, ticket, target }        the path it will write
 *     updates       { amountReceived, amountTotal }, then the last one:
 *                   { completed, completionStatusCode, httpStatus, target, aborted, interrupted }
 *
 * completionStatusCode is the HTTP code when the transfer ran (200 for a card fetched, as seen on
 * the device) and negative when it did not (DOWNLOADMANAGER_COMPLETIONSTATUS_*, DownloadManager.h).
 *
 * targetDir must lie under /media/internal (isPathInMedia), and the manager makes the folder.
 */

var DIR = "/media/internal/.im-attachments/cards";

/** Whether a link is a vCard on the web, by its path's extension. */
function isRemote(url) {
    var u = String(url || "").replace(/&amp;/g, "&");
    return /^https?:\/\/[^\s"<>]+$/i.test(u) && /\.vcf$/i.test(u.replace(/[?#].*$/, ""));
}

/** A short stable name for a link (FNV-1a of its path; the query is a signature that changes). */
function fileName(url) {
    var path = String(url).replace(/&amp;/g, "&").replace(/[?#].*$/, "");
    var h = 0x811c9dc5;
    for (var i = 0; i < path.length; i++) {
        h ^= path.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return "card-" + ("0000000" + h.toString(16)).slice(-8) + ".vcf";
}

/** The download call's parameters. */
function request(url) {
    return {
        target: String(url).replace(/&amp;/g, "&"),
        targetDir: DIR,
        targetFilename: fileName(url),
        subscribe: true
    };
}

/** A status that is no failure: absent, or an HTTP 2xx. */
function success(code) {
    return code === undefined || (typeof code === "number" && code >= 200 && code < 300);
}

/**
 * What a reply says: { state: "done", path } once the file is all there, { state: "failed" } when
 * the download ended any other way or could not start, else { state: "pending" }.
 */
function outcome(reply) {
    if (!reply || reply.returnValue === false) {
        return { state: "failed" };
    }
    if (reply.aborted === true || reply.interrupted === true || reply.completed === false &&
            reply.completionStatusCode !== undefined) {
        return { state: "failed" };
    }
    if (reply.completed === true) {
        var ok = success(reply.completionStatusCode) && success(reply.httpStatus);
        return ok && reply.target ? { state: "done", path: String(reply.target) } : { state: "failed" };
    }
    return { state: "pending" };
}

module.exports = { DIR: DIR, isRemote: isRemote, fileName: fileName, request: request, outcome: outcome };
