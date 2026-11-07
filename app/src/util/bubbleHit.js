/**
 * Whether a tap in the conversation landed on a message's bubble rather than beside it.
 *
 * A message row (ConversationItem) is as wide as the list, and the bubble is the part of it that
 * carries one of the chat-balloon-* classes (received, sent, error, system). A tap on the row
 * beside the bubble, or on the sender's avatar, should not open the reactions.
 */

var BUBBLE = /(^|\s)chat-balloon-(received|sent|error|system)(\s|$)/;
var ROW = /(^|\s)chat-balloon(\s|$)/;

/** True when node, or an ancestor of it inside its message row, is the bubble. */
function bubbleHit(node) {
    for (var n = node; n; n = n.parentNode) {
        var cls = typeof n.className === "string" ? n.className : "";
        if (BUBBLE.test(cls)) {
            return true;
        }
        if (ROW.test(cls)) {
            return false;
        }
    }
    return false;
}

module.exports = bubbleHit;
