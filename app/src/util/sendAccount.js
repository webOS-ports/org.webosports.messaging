var messagingUtils = require('./messagingUtils');

/**
 * Which account a message goes out on, decided before anything is written.
 *
 * A transport is built when the conversation opens and carries the account it found then. An IM
 * account added while the app was running (Telegram signing in, say) is not in that list, and
 * the send used to take a missing account to mean SMS: the login code typed into Telegram's
 * "telegram" chat went out as a text message to the address "telegram" and failed, while
 * Telegram sat waiting for it. A message only goes as SMS when the transport is SMS.
 *
 * @param {object} transport - the selected transport (serviceName, account)
 * @param {object} accountService - getAccount(serviceName)
 * @returns {{state: string, account: (object|undefined)}} "text" to send as SMS/MMS, "im" with
 *   the account to send on, or "missing" when no account for the IM service is known yet
 */
module.exports = function sendAccount(transport, accountService) {
    if (!transport) {
        return { state: "missing", account: undefined };
    }
    if (messagingUtils.utils.isTextMessage(transport.serviceName)) {
        return { state: "text", account: transport.account };
    }
    var account = transport.account ||
        (accountService && accountService.getAccount(transport.serviceName));
    return account ? { state: "im", account: account } : { state: "missing", account: undefined };
};
