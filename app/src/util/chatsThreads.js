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
 *
 * A Discord group DM is a channel too: purple-discord keeps group DMs in its buddy-list group
 * "Discord", so the transport files them under a server of that name. And every Telegram group or
 * channel is one, filed under the account's single Telegram server (whatever the plug-in calls
 * it); Telegram's own app lists them with the rest of the chats. Both are chats with people, as a
 * WhatsApp group is, so they are always among the chats, under their own names.
 */

var $L = require('enyo/i18n').$L;

/** A channel as the Servers tab shows it: "# name", or the name when it has its own "#" (IRC). */
function channelLabel(channel) {
    var name = (channel && (channel.displayName || channel.name || channel.remoteId)) || $L("channel");
    return (String(name).charAt(0) === "#") ? name : ("# " + name);
}

/**
 * A server whose channels are chats (see the top of this file): Discord's group DMs' "Discord",
 * and Telegram's one server.
 */
function isChatServer(server) {
    return !!server && ((server.serviceName === "type_discord" && server.name === "Discord") ||
        server.serviceName === "type_telegram");
}

/** The channels of a chat server (isChatServer), as a lookup from their _id. */
function chatChannels(channels, servers) {
    var chatServers = {};
    for (var s = 0; servers && s < servers.length; s++) {
        if (servers[s] && servers[s]._id && isChatServer(servers[s])) {
            chatServers[servers[s]._id] = true;
        }
    }
    var ids = {};
    for (var i = 0; channels && i < channels.length; i++) {
        var c = channels[i];
        if (c && c._id && Object.prototype.hasOwnProperty.call(chatServers, c.serverId)) {
            ids[c._id] = true;
        }
    }
    return ids;
}

/**
 * The channels (imchannel records) the Chats list shows, as a lookup from their _id to how it
 * names them: those that deliver while closed, and every Discord group DM and Telegram chat. servers: the imserver
 * records, for the server's name.
 */
function deliveredChannels(channels, servers) {
    var names = {}, groupDms = {};
    for (var s = 0; servers && s < servers.length; s++) {
        if (servers[s] && servers[s]._id) {
            names[servers[s]._id] = servers[s].displayName || servers[s].name || "";
            if (isChatServer(servers[s])) {
                groupDms[servers[s]._id] = true;
            }
        }
    }
    var ids = {};
    for (var i = 0; channels && i < channels.length; i++) {
        var c = channels[i];
        if (c && c._id && Object.prototype.hasOwnProperty.call(groupDms, c.serverId)) {
            ids[c._id] = c.displayName || c.name || $L("Group");
        } else if (c && c.background === true && c._id) {
            var server = Object.prototype.hasOwnProperty.call(names, c.serverId) ? names[c.serverId] : "";
            ids[c._id] = channelLabel(c) + (server ? " · " + server : "");
        }
    }
    return ids;
}

/**
 * threads without the channel threads, except those of delivered channels, which come as copies
 * carrying their Chats name in channelLabel. Keeps the order; the threads are not changed.
 * chats: chatChannels - a group's chat is named as the thread is, as its header names it, since
 * the transport renames the thread when the group is renamed and its channel keeps the old name.
 */
function chatsThreads(threads, delivered, chats) {
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
            copy.channelLabel = (chats && Object.prototype.hasOwnProperty.call(chats, t.channelId) && t.displayName) ||
                delivered[t.channelId];
            out.push(copy);
        }
    }
    return out;
}

module.exports = {
    channelLabel: channelLabel, chatChannels: chatChannels, deliveredChannels: deliveredChannels, chatsThreads: chatsThreads
};
