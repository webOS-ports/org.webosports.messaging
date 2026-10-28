/* message.js - what a message says about the conversation it belongs to.
 *
 * The rules of the webOS 3.0.5 messaging library (Messaging.Message, Messaging.ChatThread) as
 * patched for the legacy devices, with what LuneOS's transports write:
 *
 *   - imlibpurpleservice stores an incoming message with "to" set to the account itself, so a
 *     message is threaded under its sender unless it is going out; threading by "to" put every
 *     reply into a conversation named after the account.
 *   - a channel (Discord, IRC, Teams channel, a WhatsApp group) arrives tagged with channelName,
 *     and is threaded under the channel, not under whoever spoke in it.
 *   - an SMS replacement message (smsType 0x41-0x47) replaces one already counted as unread.
 */
"use strict";

const { MISSING_ADDRESS, addressText } = require("./address.js");

function isVisible(msg) {
	return !(msg && msg.flags && msg.flags.visible === false);
}

function isIncoming(msg) {
	return !!msg && msg.folder === "inbox";
}

function isUnread(msg) {
	return isIncoming(msg) && (!msg.flags || (msg.flags.read !== true && msg.flags.visible !== false));
}

function isReplacement(msg) {
	return !!msg && msg.smsType >= 0x41 && msg.smsType <= 0x47;
}

// The text a thread shows for its last message: a subject, an MMS's first text part, the body.
function messageText(msg) {
	if (!msg) { return ""; }
	if (msg.subject) { return String(msg.subject); }
	if (msg.serviceName === "mms") {
		const part = (msg.attachments || []).find((a) => a && a.mimeType === "text/plain");
		return part && part.partText ? String(part.partText) : "";
	}
	return msg.messageText === undefined || msg.messageText === null ? "" : String(msg.messageText);
}

function asAddress(a) {
	if (a && typeof a === "object") { return { addr: addressText(a), name: a.name || undefined }; }
	return { addr: addressText(a), name: undefined };
}

// What a message is threaded under, as a list of targets:
//   { type: "channel", addr: channelName }       one thread per channel
//   { type: "group",   addr: groupChatName }     one thread per group chat
//   { type: "address", addr, name }              one thread per party (several for an SMS to many)
// An outgoing message goes under each recipient; anything else under its sender, falling back to
// the recipients only when there is no sender at all. A message with neither is a "No Recipient"
// thread, as on webOS, rather than lost.
function threadTargets(msg) {
	if (msg.channelName) { return [{ type: "channel", addr: String(msg.channelName) }]; }
	if (msg.groupChatName) { return [{ type: "group", addr: String(msg.groupChatName) }]; }
	const to = Array.isArray(msg.to) ? msg.to : (msg.to ? [msg.to] : []);
	const from = msg.from && addressText(msg.from) ? [msg.from] : [];
	const list = msg.folder === "outbox" ? to : (from.length ? from : to);
	const targets = list.map(asAddress).filter((t) => t.addr);
	if (!targets.length) { return [{ type: "address", addr: MISSING_ADDRESS, name: undefined }]; }
	return targets.map((t) => ({ type: "address", addr: t.addr, name: t.name }));
}

// The account this message was sent from or to: the transports write it as username; older
// records only have it as the "to" of an incoming message or the "from" of an outgoing one.
function ownUsername(msg) {
	if (msg.username) { return String(msg.username); }
	if (msg.folder === "inbox") {
		const to = Array.isArray(msg.to) ? msg.to[0] : msg.to;
		return to ? addressText(to) || undefined : undefined;
	}
	return msg.from ? addressText(msg.from) || undefined : undefined;
}

module.exports = { isVisible, isIncoming, isUnread, isReplacement, messageText, threadTargets, ownUsername };
