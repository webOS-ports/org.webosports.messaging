/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A sent message's mentions, drawn as a received one's are. purple-discord gives a received
 * mention as "<b>@Name</b>", but the text we send is stored as typed ("@Name "), with the people
 * picked from the "@" menu in the message's mentions ([{ id, name }]). So the sent bubble showed
 * the name as plain text. mark() bolds each "@Name" the message names in its mentions.
 */

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * html: the message's text as escaped HTML (launchTargets.outgoingHtml). mentions: [{ name }].
 * escapeHtml: how the text was escaped, so a name with "&" or "<" matches. Only text outside tags
 * is touched; a name counts at the start or after a space or "(", and when no letter or digit
 * follows it, so "@Ann" in "@Anna" is not one. The longest name is tried first.
 */
function mark(html, mentions, escapeHtml) {
    html = String(html || "");
    var names = [];
    (mentions || []).forEach(function (m) {
        var name = m && String(m.name || "").trim();
        if (name && names.indexOf(name) === -1) {
            names.push(name);
        }
    });
    if (!names.length) {
        return html;
    }
    names.sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp("(^|[\\s(]|&nbsp;)(@(?:" + names.map(function (n) {
        return escapeRe(escapeHtml ? escapeHtml(n) : n);
    }).join("|") + "))(?![\\w\\u00C0-\\uFFFF])", "g");
    return html.split(/(<[^>]*>)/).map(function (part) {
        return (part.charAt(0) === "<") ? part : part.replace(re, "$1<b>$2</b>");
    }).join("");
}

module.exports = { mark: mark };
