/**
 * Tapping the quote card on a reply brings up the message it quotes.
 *
 * The card (ConversationItem.buildQuote) carries the original's network id in data-quoted-id,
 * which is that message's serviceMessageId. The original may be older than the messages loaded so
 * far; the conversation then waits for the backfill to bring it in, up to the messages it keeps.
 */

var QUOTE_CLASS = /(^|\s)reply-quote(\s|$)/;

/**
 * The quoted message's id when node is in a quote card, else null. Walks up to root, so a tap on
 * the sender's name or the text inside the card counts too.
 */
function quotedIdAt(node, root) {
    while (node && node !== root) {
        if (typeof node.className === "string" && QUOTE_CLASS.test(node.className)) {
            var id = node.getAttribute && node.getAttribute("data-quoted-id");
            return id ? id : null;
        }
        node = node.parentNode;
    }
    return null;
}

/**
 * The index in messages (records) of the one with that serviceMessageId, or -1. The newest match
 * wins: a network id is unique in a chat, but a resend can leave an old local copy behind.
 */
function indexOfQuoted(messages, id) {
    if (!id || !messages) {
        return -1;
    }
    for (var i = messages.length - 1; i >= 0; i--) {
        if (messages[i] && messages[i].serviceMessageId === id) {
            return i;
        }
    }
    return -1;
}

/**
 * What to do about a wanted quote after a load of `count` messages under `limit`, with `max` the
 * most the conversation keeps: "show" it at index, "wait" for the next backfill, or "give up"
 * when there is nothing older left to load.
 */
function next(messages, id, count, limit, max) {
    var index = indexOfQuoted(messages, id);
    if (index >= 0) {
        return { action: "show", index: index };
    }
    if (count < limit || limit >= max) {
        return { action: "give up" };
    }
    return { action: "wait" };
}

module.exports = { quotedIdAt: quotedIdAt, indexOfQuoted: indexOfQuoted, next: next };
