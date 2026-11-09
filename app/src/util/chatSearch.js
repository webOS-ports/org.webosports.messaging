/**
 * Find in Chat: the messages of the open chat that contain what is typed.
 *
 * Matched against the text as it reads: no markup, no escapes, emoji entities decoded, and with
 * case and accents ignored ("cafe" finds "Café"). Runs over the messages the conversation has
 * loaded, which a search raises to all it keeps (ConversationList's MAX_MESSAGES). A message
 * deleted for everyone has no text to find.
 */

var messagingUtils = require('./messagingUtils');

/** text folded for matching: lower case, accents off, white space runs as one space. */
function fold(text) {
    var s = String(text || "").toLowerCase();
    if (s.normalize) {
        s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    }
    return s.replace(/\s+/g, " ");
}

/** A message's text as it reads in its bubble. */
function plainText(message) {
    var m = messagingUtils.message;
    var raw = message && !message.deleted && message.messageText;
    if (!raw) {
        return "";
    }
    return m.decodeNumericEntities(m.unescapeText(m.removeHtml(String(raw).replace(/<br\s*\/?>/gi, " ")))) || "";
}

/** The indexes in messages (oldest first) of those containing query, oldest first. */
function find(messages, query) {
    var q = fold(query).trim();
    var out = [];
    if (!q) {
        return out;
    }
    for (var i = 0; messages && i < messages.length; i++) {
        if (fold(plainText(messages[i])).indexOf(q) >= 0) {
            out.push(i);
        }
    }
    return out;
}

/**
 * Which match to show after the matches changed: the one showing before (by message id) when it
 * is still a match, else the newest. -1 for none.
 */
function keep(messages, hits, currentId) {
    if (!hits.length) {
        return -1;
    }
    for (var i = 0; i < hits.length; i++) {
        if (messages[hits[i]] && messages[hits[i]]._id === currentId) {
            return i;
        }
    }
    return hits.length - 1;
}

/** The match after current going older (dir -1) or newer (+1), stopping at the ends. */
function step(current, count, dir) {
    if (count <= 0) {
        return -1;
    }
    return Math.max(0, Math.min(count - 1, current + dir));
}

module.exports = { fold: fold, plainText: plainText, find: find, keep: keep, step: step };
