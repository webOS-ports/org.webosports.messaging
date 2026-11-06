/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which URLs in a message body are media, to be drawn as a picture, a player or a chip.
 *
 * A web link counts only when its extension says it is media (`exts`, "jpg|png|..."): any other
 * link stays a link in the text. A local file:// URL is always media, whatever its extension:
 * the plug-ins put one in a message only for a file they received (a WhatsApp voice note as
 * "<hash>.data", a zip, ...), and as plain text it could not be opened.
 */
function mediaUrlRe(exts) {
    return new RegExp(
        "https?:\\/\\/[^\\s<>\"']+?\\.(?:" + exts + ")(?:\\?[^\\s<>\"']*)?" +
        "|file:\\/\\/[^\\s<>\"']+",
        "gi");
}

module.exports = { mediaUrlRe: mediaUrlRe };
