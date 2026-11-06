/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A received file that no app is registered for (a zip, an apk, ...) is shown in LuneOS Explorer
 * instead: its folder, with the file opened from there, as {path, show} asks it to. For an archive
 * Explorer then offers to extract it.
 */

var FILES_APP = "com.palm.stark.files";

/**
 * The applicationManager launch that shows a local file in Explorer, or null for anything that is
 * not a file on this device.
 */
function showInFiles(target) {
    var m = /^file:\/\/(\/[^?#]*)/i.exec(String(target || ""));
    if (!m) {
        return null;
    }
    var path = m[1];
    try {
        path = decodeURIComponent(path);
    } catch (e) {}
    var slash = path.lastIndexOf("/");
    var name = path.substring(slash + 1);
    if (!name) {
        return null;
    }
    return { id: FILES_APP, params: { path: path.substring(0, slash) || "/", show: name } };
}

module.exports = { showInFiles: showInFiles, FILES_APP: FILES_APP };
