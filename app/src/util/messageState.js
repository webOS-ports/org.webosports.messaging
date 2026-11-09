/**
 * What the transport marks on a message after the fact (imlibpurpleservice MessageChanges):
 *   deleted  the sender deleted it for everyone. Its text is the words "This message was
 *            deleted.", there for the thread summary; the bubble draws it as deleted instead.
 *   edited   its text was replaced by an edit; the bubble says so next to the time.
 *
 * And what the service itself wrote into a chat rather than anyone in it (isSystemLine): someone
 * added to or taken out of a group, a rename, "Message from ... has been deleted". The transport
 * stores a prpl's PURPLE_MESSAGE_SYSTEM line with no sender (from.addr and from.name blank:
 * tdlib-purple), and purple-combined gives such a line the sender "system" (display_message.c).
 */

var $L = require('enyo/i18n').$L,
    poll = require('./poll');

function isDeleted(message) {
    return !!(message && message.deleted === true);
}

/**
 * Whether to say the message was edited: not once it is deleted, when there is nothing to edit, and
 * not for a poll, which is rewritten in place with its votes as they come (util/poll).
 */
function isEdited(message) {
    return !!(message && message.edited === true && !isDeleted(message) &&
        !poll.isPollOnly(message.messageText));
}

/** The bubble's time line: the time, and "Edited" after it when it was. */
function timeLine(message, time) {
    if (!isEdited(message)) {
        return time || "";
    }
    return time ? time + " · " + $L("Edited") : $L("Edited");
}

/** Whether a received message is the service's own line in the chat, not anyone's message. */
function isSystemLine(message) {
    if (!message || message.folder !== "inbox" || !message.from) {
        return false;
    }
    var addr = String(message.from.addr || "").trim();
    return addr === "system" || (!addr && !String(message.from.name || "").trim());
}

/** The deleted bubble's body (HTML). */
function deletedHtml() {
    return '<span class="msg-deleted">' + $L("This message was deleted.") + '</span>';
}

module.exports = {
    isDeleted: isDeleted, isEdited: isEdited, timeLine: timeLine, deletedHtml: deletedHtml,
    isSystemLine: isSystemLine
};
