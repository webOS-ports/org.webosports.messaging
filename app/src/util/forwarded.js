/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A message someone forwarded to us. The transport says so in the text, ahead of the message
 * itself (tdlib-purple, getForwardHeader), with one line:
 *
 *   <b>Forwarded from NAME:</b>        NAME escaped as HTML: a person, or a channel or group's
 *                                      title, with who signed it after it in brackets
 *   <b>Forwarded:</b>                  from someone the transport cannot name
 *
 * and a line break, which the db holds as "<br />\n". After it comes the message as it would be
 * without: its text, a file's file:// URL and the caption, an offered file's luneos-file: line
 * (util/fileOffer), a poll: token. The chat draws the line as a label at the top of the bubble;
 * the chat list and the toasts leave it out and show the message. Anything else that shows the
 * text - an older app, Pidgin - shows the bold line as it is.
 *
 * Only a line at the very start counts, as the transport writes it nowhere else.
 */

var HEADER = /^\s*<b>Forwarded(?: from ([^<]*?))?:<\/b>[ \t]*(?:<br\s*\/?>|\\n|\r?\n)?[\r\n]*/i;

/**
 * The forward a message's text starts with, or null for none: { name: who it is from, as HTML as
 * the db holds it - escaped, with no tags - or "" when not named }.
 */
function find(text) {
    var m = HEADER.exec(String(text || ""));
    if (!m) {
        return null;
    }
    return { name: m[1] === undefined ? "" : m[1].replace(/[\u0000-\u001f]/g, "").replace(/^\s+|\s+$/g, "") };
}

/** The text without the forward's line: the message as it would be had it not been forwarded. */
function strip(text) {
    return String(text || "").replace(HEADER, "");
}

/**
 * What the label says, as HTML: "Forwarded from <name>", or "Forwarded" for no name. $L: the
 * translator; escapeHtml: the app's (messagingUtils.message.escapeHtml), for the translation.
 */
function labelHtml(forward, $L, escapeHtml) {
    if (!forward) {
        return "";
    }
    if (!forward.name) {
        return escapeHtml($L("Forwarded"));
    }
    var parts = $L("Forwarded from {name}").split("{name}");
    return parts.map(escapeHtml).join(forward.name);
}

module.exports = {
    find: find,
    strip: strip,
    labelHtml: labelHtml
};
