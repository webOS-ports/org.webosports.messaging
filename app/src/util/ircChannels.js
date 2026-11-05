/**
 * Joining and leaving IRC channels from the Servers tab.
 *
 * imlibpurpleservice shows an IRC account as one server, named after its network (the imserver's
 * remoteId, "irc.libera.chat"), with the channels the account sits in under it. A channel is
 * known by its key, "<#channel>@<network>" in lower case (the imchannel's remoteId, and the
 * address of its chat thread), so the same channel name on two networks is two channels.
 *
 * Joining is the openChannel call every channel row already makes, with the key of a channel
 * that is not in the list yet: the service joins it, keeps it in the account's buddy list so it is
 * joined again at every sign-in, and the row appears once the server has let the account in.
 * Leaving is the service's leaveChannel: it parts, forgets the channel and drops its row; the
 * chat thread stays in the Chats tab with what was said.
 */

var SERVICE_NAME = "type_irc";
var PREFIXES = "#&+!";
var MAX_LENGTH = 200;   // bytes, as imlibpurpleservice counts them

/** Whether channels can be joined by name on this server (an imserver record). */
function canJoin(server) {
    return !!(server && server.serviceName === SERVICE_NAME && server.remoteId);
}

/** Whether a channel (an imchannel record) can be left from the app. */
function canLeave(channel) {
    return !!(channel && channel.serviceName === SERVICE_NAME && channel.remoteId);
}

function utf8Length(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 0x80) {
            n += 1;
        } else if (c < 0x800) {
            n += 2;
        } else if (c >= 0xD800 && c <= 0xDBFF) {
            var d = s.charCodeAt(i + 1);
            if (!(d >= 0xDC00 && d <= 0xDFFF)) {
                return Infinity;   // a lone surrogate is not UTF-8
            }
            n += 4;
            i++;
        } else if (c >= 0xDC00 && c <= 0xDFFF) {
            return Infinity;
        } else {
            n += 3;
        }
    }
    return n;
}

/**
 * What was typed as a channel ("linux", " #Linux ") as a channel name ("#linux", "#Linux"), the
 * rules imlibpurpleservice's Irc::channelFromInput applies; "" when it cannot be one.
 */
function channelFromInput(typed) {
    var name = String(typed === undefined || typed === null ? "" : typed).replace(/^\s+|\s+$/g, "");
    if (!name) {
        return "";
    }
    if (PREFIXES.indexOf(name.charAt(0)) === -1) {
        name = "#" + name;
    }
    if (name.length < 2 || utf8Length(name) > MAX_LENGTH || /[ ,:\x07\r\n\x00]/.test(name)) {
        return "";
    }
    return name;
}

/**
 * The key of a channel on a network: "#linux@irc.libera.chat". Lower case the way the service
 * makes it (g_utf8_strdown in Irc::channelKey) and Messaging's normalizeAddress does.
 */
function channelKey(channel, network) {
    return String(channel).toLowerCase() + "@" + String(network).toLowerCase();
}

/**
 * The openChannel payload that joins what was typed on this server, or null with nothing (or
 * nothing valid) typed.
 */
function joinRequest(server, typed) {
    if (!canJoin(server)) {
        return null;
    }
    var channel = channelFromInput(typed);
    if (!channel) {
        return null;
    }
    return { serviceName: server.serviceName, channel: channelKey(channel, server.remoteId) };
}

/** The leaveChannel payload for a channel row, or null for one that cannot be left. */
function leaveRequest(channel) {
    if (!canLeave(channel)) {
        return null;
    }
    return { serviceName: channel.serviceName, channel: channel.remoteId };
}

module.exports = {
    SERVICE_NAME: SERVICE_NAME,
    canJoin: canJoin,
    canLeave: canLeave,
    channelFromInput: channelFromInput,
    channelKey: channelKey,
    joinRequest: joinRequest,
    leaveRequest: leaveRequest
};
