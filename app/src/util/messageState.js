/**
 * What the transport marks on a message after the fact (imlibpurpleservice MessageChanges):
 *   deleted  the sender deleted it for everyone. Its text is the words "This message was
 *            deleted.", there for the thread summary; the bubble draws it as deleted instead.
 *   edited   its text was replaced by an edit; the bubble says so next to the time.
 */

var $L = require('enyo/i18n').$L;

function isDeleted(message) {
    return !!(message && message.deleted === true);
}

/** Whether to say the message was edited: not once it is deleted, when there is nothing to edit. */
function isEdited(message) {
    return !!(message && message.edited === true && !isDeleted(message));
}

/** The bubble's time line: the time, and "Edited" after it when it was. */
function timeLine(message, time) {
    if (!isEdited(message)) {
        return time || "";
    }
    return time ? time + " · " + $L("Edited") : $L("Edited");
}

/** The deleted bubble's body (HTML). */
function deletedHtml() {
    return '<span class="msg-deleted">' + $L("This message was deleted.") + '</span>';
}

module.exports = { isDeleted: isDeleted, isEdited: isEdited, timeLine: timeLine, deletedHtml: deletedHtml };
