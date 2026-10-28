/* recount.js - work a thread's summary and unread count out again from its messages.
 *
 * The counts kept as messages arrive drift when something else changes a message: a read on
 * another client or by the transport, a message deleted on its own, a merge that lost. A recount
 * looks at what the thread actually holds:
 *
 *   unreadCount - its unread incoming messages (not counting SMS replacements)
 *   summary, timestamp, flags.outgoing - from its newest visible message
 *   flags.visible - false once no visible message is left, so an emptied thread leaves the list
 */
"use strict";

const message = require("./message.js");

const MESSAGE_KIND = "com.palm.message:1";

async function recount(db, threadId) {
	const unread = await db.find({ from: MESSAGE_KIND, select: ["flags", "smsType", "folder"],
		where: [{ prop: "conversations", op: "=", val: threadId }, { prop: "folder", op: "=", val: "inbox" }] });
	const unreadCount = unread.filter((m) => !m._del && message.isUnread(m) && !message.isReplacement(m)).length;
	const newest = await db.find({ from: MESSAGE_KIND, where: [
		{ prop: "conversations", op: "=", val: threadId }, { prop: "flags.visible", op: "=", val: true }],
	orderBy: "localTimestamp", desc: true, limit: 1 }, { pages: 1 });
	const last = newest.find((m) => !m._del);
	const fields = { _id: threadId, unreadCount };
	if (last) {
		fields.summary = message.messageText(last);
		fields.timestamp = last.localTimestamp || last.timestamp || 0;
		fields.flags = { outgoing: last.folder === "outbox", visible: true };
	} else {
		fields.summary = "";
		fields.flags = { visible: false };
	}
	return fields;
}

// Recount each thread that still exists; one merge for all of them.
async function recountThreads(db, threadIds) {
	const ids = Array.from(new Set(threadIds.filter(Boolean)));
	if (!ids.length) { return []; }
	const existing = new Set((await db.get(ids)).filter((t) => t && !t._del).map((t) => t._id));
	const merges = [];
	for (const id of ids) {
		if (existing.has(id)) { merges.push(await recount(db, id)); }
	}
	if (merges.length) { await db.merge(merges); }
	return merges;
}

module.exports = { recount, recountThreads };
