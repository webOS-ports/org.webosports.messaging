/**
 * Which chat threads the Chats list shows, and what a channel among them is called there.
 *
 * A server channel's thread is a com.palm.chatthread like any chat, marked by its channelId (the
 * imchannel it belongs to), and is reached from the Servers tab. One whose messages arrive while it
 * is closed ("background" on its imchannel, for Discord: util/channelOptions) is one the user
 * follows, so it is shown among the chats as well, where its new messages are seen. The flag is
 * what the channel does, whether it was chosen for the channel or for its whole server.
 *
 * In the Chats list such a thread is named as the Servers tab names the channel, plus its server:
 * its own name ("general") would read as a person's.
 */

var $L = require('enyo/i18n').$L;

/** A channel as the Servers tab shows it: "# name", or the name when it has its own "#" (IRC). */
function channelLabel(channel) {
    var name = (channel && (channel.displayName || channel.name || channel.remoteId)) || $L("channel");
    return (String(name).charAt(0) === "#") ? name : ("# " + name);
}

/**
 * The channels (imchannel records) that deliver while closed, as a lookup from their _id to how
 * the Chats list names them. servers: the imserver records, for the server's name.
 */
function deliveredChannels(channels, servers) {
    var names = {};
    for (var s = 0; servers && s < servers.length; s++) {
        if (servers[s] && servers[s]._id) {
            names[servers[s]._id] = servers[s].displayName || servers[s].name || "";
        }
    }
    var ids = {};
    for (var i = 0; channels && i < channels.length; i++) {
        var c = channels[i];
        if (c && c.background === true && c._id) {
            var server = Object.prototype.hasOwnProperty.call(names, c.serverId) ? names[c.serverId] : "";
            ids[c._id] = channelLabel(c) + (server ? " · " + server : "");
        }
    }
    return ids;
}

/**
 * threads without the channel threads, except those of delivered channels, which come as copies
 * carrying their Chats name in channelLabel. Keeps the order; the threads are not changed.
 */
function chatsThreads(threads, delivered) {
    var out = [];
    for (var i = 0; threads && i < threads.length; i++) {
        var t = threads[i];
        if (!t.channelId) {
            out.push(t);
        } else if (delivered && Object.prototype.hasOwnProperty.call(delivered, t.channelId)) {
            var copy = {};
            for (var k in t) {
                if (Object.prototype.hasOwnProperty.call(t, k)) {
                    copy[k] = t[k];
                }
            }
            copy.channelLabel = delivered[t.channelId];
            out.push(copy);
        }
    }
    return out;
}

module.exports = { channelLabel: channelLabel, deliveredChannels: deliveredChannels, chatsThreads: chatsThreads };
