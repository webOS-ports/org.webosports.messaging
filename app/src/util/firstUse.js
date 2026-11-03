/**
 * What to do about the first-run screen, which asks for an instant messaging account.
 *
 * firstUseMode stays set until Done is tapped there, which someone who added their account in
 * the Accounts app never does. So the screen shows only while there is no IM account, and once
 * one exists the flag is cleared rather than asking again.
 *
 * @param {Object} prefs - the app prefs record, or null while it loads
 * @param {boolean} accountsLoaded - whether the account list has answered yet
 * @param {number} imAccountCount - IM accounts (SMS alone does not count)
 * @returns {string} "wait" (not enough known yet), "none" (first use is over),
 *     "show" (show the first-run screen) or "clear" (an IM account exists: clear the flag)
 */
module.exports = function firstUse(prefs, accountsLoaded, imAccountCount) {
    if (!prefs || !accountsLoaded) {
        return "wait";
    }
    if (!prefs.firstUseMode) {
        return "none";
    }
    return imAccountCount > 0 ? "clear" : "show";
};
