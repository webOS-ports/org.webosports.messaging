/**
 * Group Info: who is in a group chat, and what a tap on one of them does.
 *
 * The members come from the IM transport (imlibpurpleservice getChatMembers), which reads the
 * people the service's plugin has put on the chat in libpurple and names each by the address and
 * name a message from them gets here:
 *
 *   request { serviceName, username: <our account>, usernameTo: <the chat: thread.replyAddress> }
 *   reply   { returnValue: true, inChat: bool, joining: bool, members: [ { address, name } ] }
 *           joining: the chat was not open in libpurple and the transport has just opened it;
 *           its members follow, so the app asks again (askAgain).
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

/** How long to wait before asking again, and how many times to ask in all. */
var ASK_AGAIN_MS = 1000, ASK_AT_MOST = 5;

/**
 * Whether to ask again: the transport is opening the chat (joining) and gave no one yet, and it
 * has been asked fewer than ASK_AT_MOST times.
 */
function askAgain(reply, asked) {
    return !!(reply && reply.joining === true && !(reply.members && reply.members.length) &&
        asked < ASK_AT_MOST);
}

/**
 * Whether the service says no one is in the chat: the transport has it open, is done opening it,
 * and lists no one. WhatsApp answers so for a group we have left.
 */
function nobodyThere(reply) {
    return !!(reply && reply.returnValue !== false && reply.inChat === true && reply.joining !== true &&
        !(Array.isArray(reply.members) && reply.members.length));
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

/** A phone number as "+<digits>", or "" when it is none ("31 6..." and "+31-6..." alike). */
function phoneOf(s) {
    var digits = tidy(s).replace(/[\s().\-\/]/g, "").replace(/^\+/, "");
    return /^\d{6,15}$/.test(digits) ? "+" + digits : "";
}

/**
 * The members in a getChatMembers reply: each address once, never ours (account, serviceName as
 * chatActions.isOwnAddress takes them, by the address or the number), the address as the name
 * where there is none; by name, then number, so namesakes sit together told apart by number.
 *
 * A WhatsApp member's address is often a linked id ("<digits>@lid"), which is no number; the
 * transport then gives the number beside it as phone, when the plugin knows it.
 */
function fromReply(reply, account, serviceName) {
    var list = (reply && reply.returnValue !== false && Array.isArray(reply.members)) ? reply.members : [];
    var seen = {}, out = [];
    list.forEach(function (m) {
        var address = tidy(m && m.address);
        var phone = phoneOf(m && m.phone);
        if (!address || seen[address] || chatActions.isOwnAddress(address, account, serviceName) ||
                (phone && chatActions.isOwnAddress(phone, account, serviceName))) {
            return;
        }
        seen[address] = true;
        var member = { id: address, name: tidy(m.name) || phone || address };
        if (phone) {
            member.phone = phone;
        }
        out.push(member);
    });
    return out.sort(function (a, b) {
        return a.name.localeCompare(b.name) || (a.phone || a.id).localeCompare(b.phone || b.id);
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
 * The address to show under a member's name, or "" when it says nothing more: their number when
 * the transport gave one, a WhatsApp address as its number, else the address unless it is the
 * name already or an id that is no one's to read (a WhatsApp linked id, a Signal account's UUID).
 */
function shownAddress(member) {
    if (member && member.phone) {
        return member.phone === member.name ? "" : member.phone;
    }
    var address = String((member && member.id) || "");
    var wa = /^(\d{6,15})@s\.whatsapp\.net$/i.exec(address);
    if (wa) {
        address = "+" + wa[1];
    }
    if (!address || address === member.name || /@lid$/i.test(address) ||
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(address)) {
        return "";
    }
    return address;
}

/**
 * The person a 1:1 chat with a member opens on, as a tapped group sender is (ChatView): on
 * WhatsApp by their number when the transport gave it, as its 1:1 chats are.
 */
function chatPerson(member, serviceName) {
    var username = (serviceName === "type_whatsapp" && member.phone) ? member.phone : member.id;
    return { username: username, serviceName: serviceName, displayName: member.name || username };
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
    // A WhatsApp member known by a linked id is filed by their number, when we have it.
    var number = member.phone || (/^\+\d{7,15}$/.test(member.id) ? member.id : "");
    var im = (serviceName === "type_whatsapp" && member.phone) ? member.phone : member.id;
    var contact = { ims: [{ value: im, type: serviceName }] };
    if (member.name && member.name !== member.id && member.name !== member.phone) {
        contact.name = { givenName: member.name };
    }
    if ((serviceName === "type_whatsapp" || serviceName === "type_signal") && number) {
        contact.phoneNumbers = [{ value: number, type: "type_mobile" }];
    }
    return { id: "com.palm.app.contacts", params: { launchType: "newContact", contact: contact } };
}

module.exports = {
    isGroupChat: isGroupChat,
    request: request,
    askAgain: askAgain,
    nobodyThere: nobodyThere,
    ASK_AGAIN_MS: ASK_AGAIN_MS,
    fromReply: fromReply,
    pick: pick,
    shownAddress: shownAddress,
    chatPerson: chatPerson,
    contactLaunch: contactLaunch
};
