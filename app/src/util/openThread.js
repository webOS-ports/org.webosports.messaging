/**
 * Whether the conversation on screen still has a thread behind it.
 *
 * A thread can be deleted while it is open: by the chat threader's migration, by deleteChatthread
 * from another view or client. The conversation then kept its in-memory copy, and sending from it
 * merged that copy back into db8 - which brings a deleted record back - and sent to its reply
 * address. So the thread list watches for the open thread dropping out of its results, asks db8
 * for it, and closes the conversation only when it is really gone: a thread that is merely hidden
 * (its last message deleted, flags.visible false) or filtered out by a search stays open.
 */

module.exports = {
    // True when the open thread is missing from an unfiltered thread list and needs looking up.
    droppedOut: function (selected, results, filtering) {
        if (!selected || !selected._id || filtering) {
            return false;
        }
        for (var i = 0; i < (results || []).length; i++) {
            if (results[i]._id === selected._id) {
                return false;
            }
        }
        return true;
    },

    // True when a deleted thread is the one open on a narrow screen, where the conversation covers
    // the thread list (paneIndex is the sliding group's, 0 for the list): closing the conversation
    // alone left its pane on screen, empty but for "Select a conversation", over a list there was
    // no button back to - as after Telegram's login chat is deleted once the account signs in.
    backToList: function (deleted, selected, narrow, paneIndex) {
        return !!(narrow && paneIndex !== 0 && deleted && selected && deleted._id &&
            deleted._id === selected._id);
    },

    // True when a db8 get for the thread says it no longer exists.
    gone: function (getResponse) {
        var found = getResponse && getResponse.results && getResponse.results[0];
        return !found || found._del === true;
    }
};
