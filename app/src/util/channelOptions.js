/**
 * Muting servers and channels, and choosing which deliver their messages while closed, from the
 * Servers tab (hold a row).
 *
 * imlibpurpleservice's setChannelOptions does it, for Discord so far. It answers before the
 * network has, and the imserver/imchannel rows change once it has, so the rows show the state:
 *   muted       the server or channel is muted; on a channel, also while only its server is muted
 *   background  its messages arrive while the channel is not open (a server: all its channels).
 *               Off unless chosen, since every such channel is one more the account listens to.
 * A channel's own choice wins over its server's, and setting a server's clears its channels'.
 *
 * A server is named by its imserver remoteId (the server's name), a channel by its imchannel
 * remoteId (the channel id).
 */

var $L = require('enyo/i18n').$L;

var SERVICES = { type_discord: true };

/** Whether a server or channel row (imserver/imchannel record) takes these options. */
function supports(record) {
    return !!(record && SERVICES[record.serviceName] === true && record.remoteId);
}

/**
 * The setChannelOptions payload that changes one option of a row, or null when it cannot be
 * changed. isServer: the record is an imserver. change: { muted: bool } or { background: bool }.
 */
function request(record, isServer, change) {
    if (!supports(record) || !change) {
        return null;
    }
    var payload = { serviceName: record.serviceName };
    payload[isServer ? "server" : "channel"] = record.remoteId;
    var any = false;
    if (typeof change.muted === "boolean") {
        payload.muted = change.muted;
        any = true;
    }
    if (typeof change.background === "boolean") {
        payload.background = change.background;
        any = true;
    }
    return any ? payload : null;
}

/**
 * The choices on a held row, in order, as { label, change }. server: the channel's imserver
 * record (for a channel row), so a channel muted only because its server is says so rather than
 * offering an unmute that would change nothing.
 */
function actions(record, isServer, server) {
    if (!supports(record)) {
        return [];
    }
    var list = [];
    var mutedByServer = !isServer && !!(server && server.muted);
    if (!mutedByServer) {
        list.push(record.muted ?
            { label: isServer ? $L("Unmute server") : $L("Unmute channel"), change: { muted: false } } :
            { label: isServer ? $L("Mute server") : $L("Mute channel"), change: { muted: true } });
    }
    list.push(record.background ?
        { label: $L("Only when open"), change: { background: false } } :
        {
            label: isServer ? $L("Get all channels' messages") : $L("Get messages while closed"),
            change: { background: true }
        });
    return list;
}

/** What the row's second line says about it, "" for nothing set. */
function summary(record, isServer, server) {
    if (!supports(record)) {
        return "";
    }
    var parts = [];
    if (record.muted) {
        parts.push(!isServer && server && server.muted ? $L("Muted with the server") : $L("Muted"));
    }
    if (record.background) {
        parts.push(isServer ? $L("All channels arrive") : $L("Arrives while closed"));
    }
    return parts.join(" · ");
}

module.exports = {
    supports: supports,
    request: request,
    actions: actions,
    summary: summary
};
