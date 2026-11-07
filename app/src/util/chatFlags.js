/**
 * What holding a chat in the Chats list can set on it: pin it to the top, mute it, mark it unread,
 * or archive it out of the list. Each is a flag on its com.palm.chatthread record, which the app
 * merges in and the service's threader keeps (it merges flags, never replaces them):
 *
 *   flags.pinned        shown above the other chats, under a "Pinned" divider
 *   flags.muted         its messages raise no notification (util/messageAlerts, service notify)
 *   flags.markedUnread  shown as unread although it has no unread message; opening it clears it
 *   flags.archived      kept out of the list, under "Archived chats" at its top. A new message
 *                       brings it back, unless it is muted (the service's threader does that)
 */

var $L = require('enyo/i18n').$L;

function flag(thread, name) {
    return !!(thread && thread.flags && thread.flags[name] === true);
}

function isPinned(thread) { return flag(thread, "pinned"); }
function isMuted(thread) { return flag(thread, "muted"); }
function isArchived(thread) { return flag(thread, "archived"); }
function isMarkedUnread(thread) { return flag(thread, "markedUnread"); }

/** Whether the chat reads as unread: unread messages, or marked so. */
function isUnread(thread) {
    return !!(thread && (Number(thread.unreadCount) > 0 || isMarkedUnread(thread)));
}

/** What it adds to the Chats tab's unread count: its unread messages, or one when marked. */
function unreadWeight(thread) {
    var n = Number(thread && thread.unreadCount) || 0;
    return n > 0 ? n : (isMarkedUnread(thread) ? 1 : 0);
}

/**
 * The chats to list, from threads newest first. archived: show the archived ones instead.
 * Pinned chats come first, in the order they are in otherwise. Also how many are archived and
 * how many of those are unread, for the "Archived chats" row.
 */
function arrange(threads, archived) {
    var pinned = [], rest = [], count = 0, unread = 0;
    for (var i = 0; threads && i < threads.length; i++) {
        var t = threads[i];
        if (isArchived(t)) {
            count++;
            if (isUnread(t)) {
                unread++;
            }
            if (!archived) {
                continue;
            }
        } else if (archived) {
            continue;
        }
        (isPinned(t) && !archived ? pinned : rest).push(t);
    }
    return { list: pinned.concat(rest), archivedCount: count, archivedUnread: unread };
}

/** The divider over a chat: "Pinned" for a pinned one in the list, else its date's. */
function dividerCaption(thread, inArchive, dateCaption) {
    return (isPinned(thread) && !inArchive) ? $L("Pinned") : dateCaption;
}

/** The choices on a held chat, in order, as { label, change }. */
function actions(thread) {
    if (!thread || !thread._id) {
        return [];
    }
    var list = [];
    if (!isArchived(thread)) {
        list.push(isPinned(thread) ?
            { label: $L("Unpin"), change: { pinned: false } } :
            { label: $L("Pin to Top"), change: { pinned: true } });
    }
    list.push(isMuted(thread) ?
        { label: $L("Unmute"), change: { muted: false } } :
        { label: $L("Mute Notifications"), change: { muted: true } });
    list.push(isUnread(thread) ?
        { label: $L("Mark as Read"), change: { read: true } } :
        { label: $L("Mark as Unread"), change: { markedUnread: true } });
    list.push(isArchived(thread) ?
        { label: $L("Unarchive"), change: { archived: false } } :
        { label: $L("Archive"), change: { archived: true } });
    return list;
}

/**
 * The merge for a change from actions(), or null. Archiving unpins, so an archived chat does not
 * come back pinned. { read: true } is not a flag: it clears the unread count and the mark, and the
 * caller marks the chat's messages read as opening the chat does.
 */
function merge(thread, change) {
    if (!thread || !thread._id || !change) {
        return null;
    }
    var flags = {}, out = { _id: thread._id, flags: flags };
    var any = false;
    ["pinned", "muted", "markedUnread", "archived"].forEach(function (name) {
        if (typeof change[name] === "boolean") {
            flags[name] = change[name];
            any = true;
        }
    });
    if (change.archived === true) {
        flags.pinned = false;
    }
    if (change.read === true) {
        flags.markedUnread = false;
        out.unreadCount = 0;
        any = true;
    }
    return any ? out : null;
}

/** The ids of the muted chats among threads, as a lookup. */
function mutedIds(threads) {
    var ids = {};
    for (var i = 0; threads && i < threads.length; i++) {
        if (isMuted(threads[i]) && threads[i]._id) {
            ids[threads[i]._id] = true;
        }
    }
    return ids;
}

module.exports = {
    isPinned: isPinned,
    isMuted: isMuted,
    isArchived: isArchived,
    isMarkedUnread: isMarkedUnread,
    isUnread: isUnread,
    unreadWeight: unreadWeight,
    arrange: arrange,
    dividerCaption: dividerCaption,
    actions: actions,
    merge: merge,
    mutedIds: mutedIds
};
