/**
 * Group Info: who is in a group chat, and what a tap on one of them does.
 *
 * The members come from the IM transport (imlibpurpleservice getChatMembers), which reads the
 * people the service's plugin has put on the chat in libpurple and names each by the address and
 * name a message from them gets here:
 *
 *   request { serviceName, username: <our account>, usernameTo: <the chat: thread.replyAddress> }
 *   reply   { returnValue: true, inChat: bool, members: [ { address, name } ] }
 *
 * The plugins fill that list at different times (WhatsApp, Signal and Telegram when the chat is
 * opened in libpurple, Discord for a group DM on opening it and for a server's channel only who
 * is online), and an older transport has no getChatMembers at all. Where it gives no one, the chat
 * names who has written in it (chatActions.groupMembers), as the @mentions always did.
 *
 * A member is { id, name } as chatActions' mentions take it: id is the address.
 */

var chatActions = require('./chatActions');

/** Whether the chat has members to show: a group, or a channel's chat. */
function isGroupChat(thread) {
    return !!(thread && (chatActions.isGroupThread(thread) || thread.channelId));
}

/** The getChatMembers request for a thread, or null for a chat the transport does not carry. */
function request(thread, account) {
    if (!isGroupChat(thread) || !thread.replyAddress || !thread.replyService ||
            !account || !account.username) {
        return null;
    }
    return { serviceName: thread.replyService, username: account.username, usernameTo: thread.replyAddress };
}

function tidy(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[\x1e\x1f]/g, "").trim();
}

/**
 * The members in a getChatMembers reply: each address once, never ours (account, serviceName as
 * chatActions.isOwnAddress takes them), the address as the name where there is none; by name.
 */
function fromReply(reply, account, serviceName) {
    var list = (reply && reply.returnValue !== false && Array.isArray(reply.members)) ? reply.members : [];
    var seen = {}, out = [];
    list.forEach(function (m) {
        var address = tidy(m && m.address);
        if (!address || seen[address] || chatActions.isOwnAddress(address, account, serviceName)) {
            return;
        }
        seen[address] = true;
        out.push({ id: address, name: tidy(m.name) || address });
    });
    return out.sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });
}

/**
 * Who to show and mention: the transport's members when it gave any, else who has written in the
 * chat. { members, fromService }.
 */
function pick(serviceMembers, writers) {
    if (serviceMembers && serviceMembers.length) {
        return { members: serviceMembers, fromService: true };
    }
    return { members: writers || [], fromService: false };
}

/**
 * The address to show under a member's name, or "" when it says nothing more: the name already, or
 * an id that is no one's to read (a WhatsApp linked id, a Signal account's UUID).
 */
function shownAddress(member) {
    var address = String((member && member.id) || "");
    if (!address || address === member.name || /@lid$/i.test(address) ||
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(address)) {
        return "";
    }
    return address;
}

/** The person a 1:1 chat with a member opens on, as a tapped group sender is (ChatView). */
function chatPerson(member, serviceName) {
    return { username: member.id, serviceName: serviceName, displayName: member.name || member.id };
}

/**
 * The Contacts launch that offers to make a contact of a member, or to add them to one that exists
 * (Contacts asks which: launchType "newContact" without skipPrompt). The IM address goes in as the
 * service's IM type; a WhatsApp or Signal member known by a full number gets it as a mobile number
 * too, as the transport files their buddies.
 */
function contactLaunch(member, serviceName) {
    if (!member || !member.id || !serviceName) {
        return null;
    }
    var contact = { ims: [{ value: member.id, type: serviceName }] };
    if (member.name && member.name !== member.id) {
        contact.name = { givenName: member.name };
    }
    if ((serviceName === "type_whatsapp" || serviceName === "type_signal") && /^\+\d{7,15}$/.test(member.id)) {
        contact.phoneNumbers = [{ value: member.id, type: "type_mobile" }];
    }
    return { id: "com.palm.app.contacts", params: { launchType: "newContact", contact: contact } };
}

module.exports = {
    isGroupChat: isGroupChat,
    request: request,
    fromReply: fromReply,
    pick: pick,
    shownAddress: shownAddress,
    chatPerson: chatPerson,
    contactLaunch: contactLaunch
};
