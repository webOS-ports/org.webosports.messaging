/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A poll in a message: the "poll:" token a transport writes as the message's text, base64url of
 *   { name, options: [names], max: 1 one answer / n up to n / 0 any number, votes: [counts] }
 * votes is there once a transport counts them (WhatsApp, purple-combined poll_tally.go); it is
 * rewritten in place as the votes come, which is not the sender editing the poll.
 */

var TOKEN_ONLY = /^\s*poll:[A-Za-z0-9_-]+\s*$/;

/** The poll in a token's base64url part, or null when it is not one. */
function decode(token) {
    var payload;
    try {
        var b64 = String(token).replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) { b64 += "="; }
        payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
        return null;
    }
    if (!payload || !Array.isArray(payload.options) || !payload.options.length) {
        return null;
    }
    return payload;
}

/** How many chose option i, or null when the poll carries no counts. */
function votesFor(payload, i) {
    var votes = payload && payload.votes;
    if (!Array.isArray(votes)) {
        return null;
    }
    var n = Number(votes[i]); // NaN past either end
    return (isFinite(n) && n >= 0) ? Math.floor(n) : null;
}

/** Whether a message's text is nothing but a poll. */
function isPollOnly(text) {
    return TOKEN_ONLY.test(String(text || ""));
}

module.exports = { decode: decode, votesFor: votesFor, isPollOnly: isPollOnly };
