/**
 * Where a chat opened with unread messages draws its "N unread messages" line, and how many
 * messages came in below while the reader was further up (the jump-to-bottom button's count).
 *
 * messages are oldest first, as the chat lists them; an incoming one is in the inbox folder.
 */

var $L = require('enyo/i18n').$L;

function isIncoming(m) {
    return !!(m && m.folder === "inbox");
}

/**
 * The line for count unread messages: above the oldest of the newest count incoming ones.
 * { id, exact }: exact is false when fewer incoming messages are loaded than are unread, and the
 * line stands above the oldest loaded one until older messages come in. null for none.
 */
function lineFor(messages, count) {
    count = Math.floor(Number(count) || 0);
    if (count <= 0 || !messages) {
        return null;
    }
    var seen = 0, id = null;
    for (var i = messages.length - 1; i >= 0 && seen < count; i--) {
        if (isIncoming(messages[i]) && messages[i]._id) {
            id = messages[i]._id;
            seen++;
        }
    }
    return id ? { id: id, exact: seen === count } : null;
}

/** "1 unread message", "4 unread messages". */
function caption(count) {
    return count === 1 ? $L("1 unread message") :
        $L("{count} unread messages").replace("{count}", String(count));
}

/** The newest incoming message's id, or null. */
function newestIncoming(messages) {
    for (var i = (messages || []).length - 1; i >= 0; i--) {
        if (isIncoming(messages[i]) && messages[i]._id) {
            return messages[i]._id;
        }
    }
    return null;
}

/**
 * How many incoming messages are newer than the one with id seenId. 0 without seenId or when it
 * is not among them any more (the list was cut): what cannot be told is not counted.
 */
function newSince(messages, seenId) {
    if (!seenId || !messages) {
        return 0;
    }
    for (var i = messages.length - 1, n = 0; i >= 0; i--) {
        if (messages[i]._id === seenId) {
            return n;
        }
        if (isIncoming(messages[i])) {
            n++;
        }
    }
    return 0;
}

module.exports = { lineFor: lineFor, caption: caption, newestIncoming: newestIncoming, newSince: newSince };
