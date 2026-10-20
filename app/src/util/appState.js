/**
 * Small shared app-level state, replacing the handful of globals the Mojo app hung off
 * `enyo.application` (selectedThread, the dashboard manager's app-deactivated flag, and the
 * account service instance).
 *
 * Rows consult this while rendering — an unread badge is suppressed for the thread that is
 * currently open and on screen — so it has to be reachable without threading a reference through
 * every list.
 */

module.exports = {
    /** The chatthread record currently open in the conversation view, if any. */
    selectedThread: null,

    /** True while the app window is not in the foreground, so notifications are allowed to show. */
    appDeactivated: false,

    /** The AccountService instance, set once at startup by MessagingApp. */
    accountService: null,

    /** The PrefsHandler instance, set once at startup by MessagingApp. */
    prefsHandler: null,

    /** The conversation view currently rendering messages, used by the inline-image relayout. */
    activeConversationList: null,

    setSelectedThread: function (thread) {
        this.selectedThread = thread || null;
    },

    getSelectedThreadId: function () {
        return this.selectedThread && this.selectedThread._id;
    },

    setAppDeactivated: function (deactivated) {
        this.appDeactivated = !!deactivated;
    },

    getAppDeactivated: function () {
        return this.appDeactivated;
    },

    /**
     * True when the given thread is the one on screen in a foregrounded app — the condition under
     * which its unread badge is hidden.
     */
    isThreadOnScreen: function (thread) {
        return !!(thread && this.selectedThread &&
            thread._id === this.selectedThread._id && this.appDeactivated === false);
    }
};
