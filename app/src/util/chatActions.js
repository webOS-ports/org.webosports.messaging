/**
 * What can be done to a chat or a message besides sending to it, and the transport commands that
 * do it (imlibpurpleservice SendOneCommandHandler). Every command is an imcommand record, as the
 * buddy commands always were (DeleteBuddyService):
 *
 *   { command, handler: "transport", serviceName, fromUsername: <our username>,
 *     targetUsername: <the chat: thread.replyAddress>, params: { ... } }
 *
 * The transport hands each to the service's plugin, which does it or not; what a plugin does is
 * in ACTIONS, so the app offers only that. An account template may say otherwise for its service
 * with a "chatActions" object on its MESSAGING capability.
 *
 * A location and a contact card go out as an ordinary message: its text is their plain form,
 * which is what every service and SMS gets, and the location / contactCard fields on it are for a
 * plugin that sends them natively. Mentions are the same: the text has "@Name", the mentions field
 * says who that is.
 *
 * Text for the database stays in the Basic Multilingual Plane: db8 mangles characters above it, so
 * no emoji here.
 */

var $L = require('enyo/i18n').$L;

var UNIT = "\x1f";

/*
 * What each service's plugin does, as its patches in meta-webos-ports do it:
 *   edit, deleteForEveryone   one's own sent messages; editWindowMs is how long after sending
 *                             the service takes an edit (whatsmeow EditWindow), when it has one
 *   groupCreate/Invite/Leave  making a group, adding people to one, leaving it
 *   groupRemove               taking someone out of a group (purple-combined: whatsmeow
 *                             UpdateGroupParticipants remove; tdlib-purple 0035: setChatMemberStatus
 *                             Left; purple-discord 0031: DELETE a group DM's recipient; the
 *                             service refuses it to a non-admin)
 *   groupRename               giving a group a new name (renameGroup, the transport's
 *                             webos-im-group-rename; purple-combined 0056: whatsmeow SetGroupName,
 *                             tdlib-purple 0036: setChatTitle, purple-discord 0030: PATCH a group
 *                             DM's name; the service may refuse it to a non-admin)
 *   mentions                  "@Name" in a group as a mention of that member
 *   location, contact         sent as the service's own location or contact message
 *   sticker                   a .webp file sent as the service's sticker (purple-combined
 *                             send_file.go sends a WebP file as a WhatsApp StickerMessage)
 * What is not listed is not done.
 */
var ACTIONS = {
    type_whatsapp: {
        edit: true, editWindowMs: 20 * 60 * 1000, deleteForEveryone: true,
        groupCreate: true, groupInvite: true, groupLeave: true, groupRemove: true, groupRename: true,
        mentions: true, location: true, contact: true, sticker: true
    },
    type_signal: {
        edit: true, deleteForEveryone: true, mentions: true, contact: true
    },
    type_telegram: {
        edit: true, deleteForEveryone: true,
        groupCreate: true, groupInvite: true, groupLeave: true, groupRemove: true, groupRename: true,
        mentions: true, location: true, contact: true
    },
    // Groups are group DMs; a server's channels are not.
    type_discord: {
        edit: true, deleteForEveryone: true,
        groupCreate: true, groupInvite: true, groupLeave: true, groupRemove: true, groupRename: true,
        mentions: true
    }
};

var NONE = {};

/** What can be done on a service: the template's chatActions, else the table's. */
function actionsFor(serviceName, accountService) {
    var fromTemplate = accountService && typeof accountService.getChatActions === "function" &&
        accountService.getChatActions(serviceName);
    if (fromTemplate && typeof fromTemplate === "object") {
        return fromTemplate;
    }
    return ACTIONS[serviceName] || NONE;
}

/**
 * A group one can manage: a WhatsApp group (its JID is "<id>@g.us"), which the threader may have
 * linked to an imchannel as it does any channel, or a chat the threads mark as a group. A
 * server's channel is not.
 */
function isGroupThread(thread) {
    if (!thread) {
        return false;
    }
    if (/@g\.us$/i.test(String(thread.replyAddress || ""))) {
        return true;
    }
    return !!(!thread.channelId && thread.groupChatId);
}

function isFileMessage(message) {
    var text = String(message.messageText || "");
    return !!(message.filePath || /^file:\/\//i.test(text) || /<img\b/i.test(text));
}

/** A message we sent that the service has, so it can be pointed at: it has the service's id. */
function isOwnSent(message) {
    return !!(message && message.folder === "outbox" && message.status === "successful" &&
        message.serviceMessageId && message.deleted !== true);
}

/**
 * When the message was sent, in ms. Some transports store their own messages' timestamp in
 * seconds (a third of the sent rows on a phone); read as ms, those were sent in 1970 and the
 * edit window had long passed. No message in ms is older than 1973 (1e11).
 */
function sentAt(message) {
    var t = Number(message.timestamp || message.localTimestamp || 0);
    return t > 0 && t < 1e11 ? t * 1000 : t;
}

/** Whether one's own message can still be edited: text only, and inside the service's window. */
function canEdit(message, actions, now) {
    if (!actions || !actions.edit || !isOwnSent(message) || isFileMessage(message)) {
        return false;
    }
    return !actions.editWindowMs || now - sentAt(message) <= actions.editWindowMs;
}

function canDeleteForEveryone(message, actions, now) {
    if (!actions || !actions.deleteForEveryone || !isOwnSent(message)) {
        return false;
    }
    return !actions.deleteWindowMs || now - sentAt(message) <= actions.deleteWindowMs;
}

/**
 * Whether a delete of these messages can offer "for everyone": every one is our own sent message
 * on a service that takes the delete. actionsOf(message) gives that message's service's actions.
 */
function canDeleteAllForEveryone(messages, actionsOf, now) {
    return !!(messages && messages.length) && messages.every(function (message) {
        return canDeleteForEveryone(message, actionsOf(message), now);
    });
}

/**
 * One imcommand. kind: accountService.getImCommandKind(serviceName); account: ours on the service
 * (its username); target: the chat's address, "" for a command with no chat.
 */
function command(kind, name, serviceName, account, target, params) {
    if (!kind || !serviceName || !account || !account.username) {
        return null;
    }
    return {
        _kind: kind,
        command: name,
        handler: "transport",
        serviceName: serviceName,
        fromUsername: account.username,
        targetUsername: target || "",
        params: params || {}
    };
}

/**
 * The chat a message is in, as the transport names it: a group's or channel's address (the
 * thread's, when the thread is on the message's service), else the other person's: who it went
 * to, or who it came from. "" when it cannot be told.
 */
function chatOf(message, thread) {
    if (!message) {
        return "";
    }
    if (message.chatType === "groupchat" || isGroupThread(thread) || (thread && thread.channelId)) {
        return (thread && thread.replyService === message.serviceName && thread.replyAddress) || "";
    }
    if (message.folder === "outbox") {
        return (message.to && message.to[0] && message.to[0].addr) || "";
    }
    return (message.from && message.from.addr) || "";
}

/** Who sent a message we did not, as the service names them; "" for our own. */
function senderOf(message) {
    return (message && message.folder !== "outbox" && message.from && message.from.addr) || "";
}

function reactionCommand(kind, account, chat, message, emoji, remove) {
    if (!chat || !message || !message.serviceMessageId || !emoji) {
        return null;
    }
    return command(kind, "sendReaction", message.serviceName, account, chat, {
        targetServiceMessageId: message.serviceMessageId,
        emoji: emoji,
        remove: !!remove,
        targetSender: senderOf(message)
    });
}

/** selected: every option now ticked (none clears the vote). */
function pollVoteCommand(kind, account, chat, message, selected) {
    if (!chat || !message || !message.serviceMessageId) {
        return null;
    }
    return command(kind, "sendPollVote", message.serviceName, account, chat, {
        pollMessageId: message.serviceMessageId,
        optionNames: (selected || []).join(UNIT),
        // Who made the poll: the plugin finds its key by it once the poll has left its cache (a
        // restart). Our own poll (made on the phone) is ours: the account, "+<number>".
        senderJid: senderOf(message) || (message.folder === "outbox" ? account.username : "")
    });
}

function editCommand(kind, account, chat, message, text) {
    if (!chat || !message || !message.serviceMessageId || !String(text || "").trim()) {
        return null;
    }
    return command(kind, "editMessage", message.serviceName, account, chat, {
        targetServiceMessageId: message.serviceMessageId,
        text: String(text)
    });
}

function deleteCommand(kind, account, chat, message) {
    if (!chat || !message || !message.serviceMessageId) {
        return null;
    }
    return command(kind, "deleteMessage", message.serviceName, account, chat, {
        targetServiceMessageId: message.serviceMessageId
    });
}

function cleanMembers(members) {
    var seen = {}, out = [];
    (members || []).forEach(function (m) {
        var s = String(m || "").replace(/[\x1e\x1f]/g, "").trim();
        if (s && !seen[s]) {
            seen[s] = true;
            out.push(s);
        }
    });
    return out;
}

/**
 * The address a contact's entry (MsgAddrCollection: { value, type, isPhone }) is a member of a
 * group on the service by, or null: an IM address of that service, or for WhatsApp, whose users
 * are phone numbers, a number in international form ("+" and its digits), which the transport
 * turns into the JID. A number without its country code could be anyone's, so it is not taken.
 */
function memberAddress(entry, serviceName) {
    if (!entry || !entry.value) {
        return null;
    }
    var value = String(entry.value).trim();
    if (!entry.isPhone) {
        return entry.type === serviceName && value ? value : null;
    }
    if (serviceName !== "type_whatsapp") {
        return null;
    }
    var number = value.replace(/[\s().\-\/]/g, "");
    if (/^00\d/.test(number)) {
        number = "+" + number.slice(2);
    }
    return /^\+\d{7,15}$/.test(number) ? number : null;
}

/**
 * Whether address (memberAddress's) is our own account's on the service: we cannot add
 * ourselves to a group, and a group we left takes no one from us (WhatsApp answers 409). A phone
 * number is ours by its digits, as the account may name it "+31..." or "31...@s.whatsapp.net".
 */
function isOwnAddress(address, account, serviceName) {
    var mine = account && account.username;
    if (!address || !mine) {
        return false;
    }
    if (serviceName === "type_whatsapp" || /^\+?\d+$/.test(String(address))) {
        var digits = function (s) { return String(s).replace(/\D/g, ""); };
        return digits(address) !== "" && digits(address) === digits(mine);
    }
    return String(address).trim().toLowerCase() === String(mine).trim().toLowerCase();
}

/**
 * A channel's chat that is a group one can add people to and leave, as a WhatsApp group is. The
 * transport keeps these as channels, as it does a server's channels, so the server tells them
 * apart: every Telegram chat with a channel is a group (imlibpurpleservice files them all under
 * one "Telegram" server), and on Discord a group DM is, which purple-discord keeps in its own
 * buddy-list group "Discord" - its server's name - where a server's channels sit under
 * "<server>: <category>". serverName: the name of the thread's imserver, when known.
 */
function isChannelGroup(thread, serverName) {
    if (!thread || !thread.channelId) {
        return false;
    }
    if (thread.replyService === "type_telegram") {
        return true;
    }
    return thread.replyService === "type_discord" && serverName === "Discord";
}

/** A group whose people can be managed from the chat: WhatsApp's, or a channel's (isChannelGroup). */
function isManagedGroup(thread, serverName) {
    return isGroupThread(thread) || isChannelGroup(thread, serverName);
}

/** members: the chats' addresses of the people to put in it. */
function createGroupCommand(kind, serviceName, account, name, members) {
    var title = String(name || "").replace(/[\x1e\x1f]/g, "").trim();
    var list = cleanMembers(members);
    if (!title || !list.length) {
        return null;
    }
    return command(kind, "createGroup", serviceName, account, "", { name: title, members: list.join(UNIT) });
}

function inviteCommand(kind, serviceName, account, group, members) {
    var list = cleanMembers(members);
    if (!group || !list.length) {
        return null;
    }
    return command(kind, "inviteToGroup", serviceName, account, group, { members: list.join(UNIT) });
}

/** members: the addresses of the people to take out of the group. */
function removeCommand(kind, serviceName, account, group, members) {
    var list = cleanMembers(members);
    if (!group || !list.length) {
        return null;
    }
    return command(kind, "removeFromGroup", serviceName, account, group, { members: list.join(UNIT) });
}

/** A new name for a group: trimmed, and null for an empty one. */
function renameCommand(kind, serviceName, account, group, name) {
    var title = String(name || "").replace(/\s+/g, " ").trim();
    if (!group || !title) {
        return null;
    }
    return command(kind, "renameGroup", serviceName, account, group, { name: title });
}

function leaveCommand(kind, serviceName, account, group) {
    if (!group) {
        return null;
    }
    return command(kind, "leaveGroup", serviceName, account, group, {});
}

// --- blocking --------------------------------------------------------------------------------

/**
 * Whether the chat list offers Block Sender for a chat (on a long tap): a chat with one person on
 * an IM account the device has. Not a group or a channel, whose sender is many people, and not a
 * text message, which the carrier carries.
 */
function canBlock(thread, accountService) {
    if (!thread || !thread.replyAddress || !thread.replyService || thread.channelId || thread.groupChatId ||
            isGroupThread(thread) || !accountService) {
        return false;
    }
    var account = accountService.getAccount(thread.replyService);
    return !!(account && account.capabilitySubtype === "IM" && account.username);
}

/** The blockBuddy imcommand for that chat's person, as the conversation's Block Sender wrote it. */
function blockCommand(kind, thread, account) {
    if (!thread || !thread.replyAddress) {
        return null;
    }
    var c = command(kind, "blockBuddy", thread.replyService, account, thread.replyAddress, null);
    if (c) {
        delete c.params;   // blockBuddy has none, and was always written without
    }
    return c;
}

// --- location --------------------------------------------------------------------------------

function round7(n) {
    return Math.round(n * 1e7) / 1e7;
}

/** The location field of a message, or null for a position that is not on the earth. */
function location(latitude, longitude, name) {
    var lat = Number(latitude), lon = Number(longitude);
    if (latitude === null || longitude === null || latitude === undefined || longitude === undefined ||
            !isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return null;
    }
    var out = { latitude: round7(lat), longitude: round7(lon) };
    var label = String(name || "").replace(/[\x1e\x1f\r\n]+/g, " ").trim();
    if (label) {
        out.name = label;
    }
    return out;
}

/** The text a location goes out as: its name, and a link any phone opens. */
function locationText(loc) {
    var link = "https://maps.google.com/?q=" + loc.latitude + "," + loc.longitude;
    return (loc.name ? loc.name : $L("My location")) + "\n" + link;
}

// --- contact cards ---------------------------------------------------------------------------

/** A vCard value: backslash, comma, semicolon and line breaks escaped (RFC 6350 3.4). */
function vcardEscape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;")
        .replace(/\r\n|\r|\n/g, "\\n");
}

function values(list) {
    var out = [];
    (list || []).forEach(function (entry) {
        var v = String((entry && (entry.value !== undefined ? entry.value : entry)) || "").trim();
        if (v && out.indexOf(v) < 0) {
            out.push(v);
        }
    });
    return out;
}

/**
 * The card of a person (name, phoneNumbers and emails as the contacts database has them, each
 * [{ value }]): a vCard 3.0 with FN and a TEL / EMAIL line each, or null without a name and a
 * number or address.
 */
function contactCard(person) {
    var name = String((person && person.name) || "").replace(/[\r\n]+/g, " ").trim();
    var phones = values(person && person.phoneNumbers);
    var emails = values(person && person.emails);
    if (!name || (!phones.length && !emails.length)) {
        return null;
    }
    var lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + vcardEscape(name), "N:;" + vcardEscape(name) + ";;;"];
    phones.forEach(function (p) { lines.push("TEL;TYPE=CELL:" + vcardEscape(p)); });
    emails.forEach(function (e) { lines.push("EMAIL:" + vcardEscape(e)); });
    lines.push("END:VCARD");
    return { vcard: lines.join("\r\n") + "\r\n" };
}

/** The text a card goes out as: the name, then each number and address on its own line. */
function contactText(person) {
    var name = String((person && person.name) || "").replace(/[\r\n]+/g, " ").trim();
    return [name].concat(values(person && person.phoneNumbers), values(person && person.emails)).join("\n");
}

// --- mentions --------------------------------------------------------------------------------

/**
 * The mention being typed at the caret: "@" at the start or after a space, then no space up to
 * the caret. { start: index of the "@", query: what follows it } or null.
 */
function mentionQuery(text, caret) {
    text = String(text || "");
    var end = Math.min(caret === undefined ? text.length : caret, text.length);
    for (var i = end - 1; i >= 0; i--) {
        var c = text.charAt(i);
        if (c === "@") {
            if (i > 0 && !/\s/.test(text.charAt(i - 1))) {
                return null;
            }
            return { start: i, query: text.slice(i + 1, end) };
        }
        if (/\s/.test(c)) {
            return null;
        }
    }
    return null;
}

/** The members whose name starts with the query, or has a word that does; at most limit. */
function mentionCandidates(members, query, limit) {
    var q = String(query || "").toLowerCase();
    var out = [];
    (members || []).forEach(function (m) {
        var name = String(m.name || "").toLowerCase();
        if (!q || name.indexOf(q) === 0 || name.split(/\s+/).some(function (w) { return w.indexOf(q) === 0; })) {
            out.push(m);
        }
    });
    return out.slice(0, limit || 6);
}

/** Put "@Name " in place of the mention being typed. { text, caret } */
function insertMention(text, caret, query, member) {
    text = String(text || "");
    var end = Math.min(caret === undefined ? text.length : caret, text.length);
    var inserted = "@" + member.name + " ";
    return {
        text: text.slice(0, query.start) + inserted + text.slice(end),
        caret: query.start + inserted.length
    };
}

/**
 * The people of a group chat, from its messages: each sender once, by address, with the last
 * name they were shown with. Not us.
 */
function groupMembers(messages) {
    var byAddr = {}, order = [];
    (messages || []).forEach(function (m) {
        var from = m && m.folder !== "outbox" && m.from;
        // purple-combined's own lines in a group ("X added Y") come from "system": no one in it.
        if (!from || !from.addr || !from.name || from.addr === "system") {
            return;
        }
        if (!byAddr[from.addr]) {
            order.push(from.addr);
        }
        byAddr[from.addr] = { id: from.addr, name: String(from.name).replace(/[\x1e\x1f]/g, "") };
    });
    return order.map(function (a) { return byAddr[a]; }).sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });
}

/**
 * Whether a character carries a name on ("@Anna" in "@Annabel"): a letter or digit, which outside
 * ASCII is anything but the punctuation blocks.
 */
function goesOn(c) {
    if (!c) {
        return false;
    }
    if (/[A-Za-z0-9]/.test(c)) {
        return true;
    }
    var code = c.charCodeAt(0);
    return code >= 0xC0 && !(code >= 0x2000 && code <= 0x206F) && !(code >= 0x3000 && code <= 0x303F) &&
        code !== 0xD7 && code !== 0xF7;
}

/** The mentions picked that the text still has as "@Name", each once: the message's mentions field. */
function mentionsInText(text, picked) {
    text = String(text || "");
    var seen = {}, out = [];
    (picked || []).forEach(function (m) {
        if (!m || !m.id || !m.name || seen[m.id]) {
            return;
        }
        var at = "@" + m.name;
        var i = text.indexOf(at);
        while (i >= 0) {
            if (!goesOn(text.charAt(i + at.length))) {
                seen[m.id] = true;
                out.push({ id: m.id, name: m.name });
                return;
            }
            i = text.indexOf(at, i + 1);
        }
    });
    return out;
}

module.exports = {
    ACTIONS: ACTIONS,
    actionsFor: actionsFor,
    isGroupThread: isGroupThread,
    isChannelGroup: isChannelGroup,
    isManagedGroup: isManagedGroup,
    isOwnSent: isOwnSent,
    chatOf: chatOf,
    canEdit: canEdit,
    canDeleteForEveryone: canDeleteForEveryone,
    canDeleteAllForEveryone: canDeleteAllForEveryone,
    reactionCommand: reactionCommand,
    pollVoteCommand: pollVoteCommand,
    editCommand: editCommand,
    deleteCommand: deleteCommand,
    memberAddress: memberAddress,
    isOwnAddress: isOwnAddress,
    createGroupCommand: createGroupCommand,
    removeCommand: removeCommand,
    renameCommand: renameCommand,
    inviteCommand: inviteCommand,
    leaveCommand: leaveCommand,
    canBlock: canBlock,
    blockCommand: blockCommand,
    location: location,
    locationText: locationText,
    contactCard: contactCard,
    contactText: contactText,
    mentionQuery: mentionQuery,
    mentionCandidates: mentionCandidates,
    insertMention: insertMention,
    groupMembers: groupMembers,
    mentionsInText: mentionsInText
};
