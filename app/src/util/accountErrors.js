/**
 * Which messaging accounts need the "sign in again" dashboard, and which dashboards can go.
 *
 * A transport that cannot sign an account in records it in tempdb as a
 * com.palm.account.syncstate:1 record with syncState "ERROR". imlibpurpleservice writes
 * errorCode "401_UNAUTHORIZED" when the service refused the sign-in and "CREDENTIALS_NOT_FOUND"
 * when it has nothing to sign in with; either way the account stays offline until the user signs
 * in again, so those two are the ones worth a dashboard. It is the test the Accounts app's list
 * and enyo-1's SyncUI.syncDashboard apply, which webOS only ever used for email, contacts and
 * calendar accounts.
 */

var CREDENTIAL_ERRORS = ["401_UNAUTHORIZED", "CREDENTIALS_NOT_FOUND"];

/** The accountIds that have a credentials error, as a set ({accountId: true}). */
function credentialErrors(syncStates) {
    var ids = {};
    (syncStates || []).forEach(function (s) {
        // A record with a collectionId is about one folder of the account, not its sign-in.
        if (s && s.accountId && !s.collectionId && s.syncState === "ERROR" &&
                CREDENTIAL_ERRORS.indexOf(s.errorCode) !== -1) {
            ids[s.accountId] = true;
        }
    });
    return ids;
}

/**
 * What to change so the dashboards match the errors.
 *
 * @param errorIds  credentialErrors() of the current syncstate records
 * @param accounts  the messaging accounts by accountId; only these get a dashboard, and an
 *                  account that has not loaded yet gets one once it has
 * @param shown     {accountId: toastId} of the dashboards already raised
 * @return {raise: [accountId], close: [{accountId, toastId}]}
 */
function plan(errorIds, accounts, shown) {
    var raise = [], close = [];
    Object.keys(errorIds).forEach(function (id) {
        if (accounts && accounts[id] && !Object.prototype.hasOwnProperty.call(shown, id)) {
            raise.push(id);
        }
    });
    Object.keys(shown).forEach(function (id) {
        if (!errorIds[id]) {
            close.push({ accountId: id, toastId: shown[id] });
        }
    });
    return { raise: raise, close: close };
}

module.exports = {
    CREDENTIAL_ERRORS: CREDENTIAL_ERRORS,
    credentialErrors: credentialErrors,
    plan: plan
};
