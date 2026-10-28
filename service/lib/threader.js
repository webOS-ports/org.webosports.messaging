/* threader.js - put a message into its conversation(s).
 *
 *   const run = createRun({ db, tempdb, log });
 *   const ids = await run.thread(message);     // the chatthread _ids it belongs to
 *   await run.flush();                         // write what changed, once per run
 *
 * A run is one batch of messages. Within it every lookup is cached (the person behind an address,
 * the thread for a person, an address or a channel) and every changed thread is kept in memory and
 * written once at the end, so a burst of 500 messages from one chat costs a handful of db8 calls,
 * not four per message. A new thread is written at once: the next message needs its _id.
 *
 * Writes never carry _rev. The app merges the same records (clearing unreadCount, marking a
 * message read), and a stale _rev would make db8 refuse ours.
 *
 * Which thread:
 *   channel - the imchannel (serviceName, remoteId = channelName) imlibpurpleservice keeps for
 *             it, then its chatThreadId; else a thread keyed on the channel; created if none, and
 *             linked back onto the imchannel.
 *   group   - a thread keyed on groupChatName.
 *   address - the thread of the person behind the address; else one keyed on the address, which
 *             is adopted (personId and name stamped on) when its contact has turned up since;
 *             created if none.
 */
"use strict";

const address = require("./address.js");
const message = require("./message.js");
const person = require("./person.js");

const THREAD_KIND = "com.palm.chatthread:1";
const CHANNEL_KIND = "com.palm.imchannel:1";

// A name that is only the channel's id (a WhatsApp group whose subject is not known yet comes as
// "<digits>-<digits>@g.us"), which must never replace a real one.
function isRawId(name, remoteId) {
	return !name || name === remoteId || /^\d+(-\d+)?@g\.us$/.test(name);
}

function createRun({ db, tempdb, log = console, now = () => Date.now() }) {
	const threads = new Map();     // _id -> the thread as it is now, with this run's changes
	const dirty = new Map();       // _id -> the fields changed, for the merge
	const keys = new Map();        // lookup key -> thread _id
	const persons = new Map();     // serviceName|normalized address -> person or null
	const channels = new Map();    // serviceName|remoteId -> imchannel or null
	const links = [];              // message merges { _id, conversations }
	const notify = new Map();      // thread _id -> the newest incoming message for it
	let channelLinkRefused = false;

	function remember(thread) {
		const known = threads.get(thread._id);
		if (known) { return known; }
		threads.set(thread._id, thread);
		return thread;
	}

	function change(thread, fields) {
		Object.assign(thread, fields);
		if (fields.flags) { thread.flags = Object.assign({}, thread.flags, fields.flags); }
		const d = dirty.get(thread._id) || {};
		for (const k of Object.keys(fields)) {
			d[k] = k === "flags" ? Object.assign({}, d.flags, fields.flags) : fields[k];
		}
		dirty.set(thread._id, d);
	}

	async function getThread(id) {
		if (threads.has(id)) { return threads.get(id); }
		const [t] = await db.get([id]);
		return t && !t._del ? remember(t) : undefined;
	}

	async function findThreads(where) {
		const found = await db.find({ from: THREAD_KIND, where });
		return found.filter((t) => !t._del).map(remember);
	}

	async function create(fields) {
		// timestamp 0: the thread takes its time from its first message (apply), which may be
		// older than now when history is being synced.
		const record = Object.assign({ _kind: THREAD_KIND, unreadCount: 0, summary: "", timestamp: 0,
			flags: { visible: true, outgoing: false } }, fields);
		const [r] = await db.put([record]);
		record._id = r.id;
		threads.set(record._id, record);
		return record;
	}

	async function personFor(addr, serviceName, msg) {
		const key = serviceName + "|" + address.normalizeAddress(addr, serviceName);
		if (!persons.has(key)) {
			let p;
			try { p = await person.resolvePerson({ db, tempdb }, addr, serviceName, message.ownUsername(msg)); }
			catch (e) { log.error("threader: person lookup for " + addr + " failed: " + ((e && e.message) || e)); }
			persons.set(key, p || null);
		}
		return persons.get(key) || undefined;
	}

	// The thread for an address on a service, preferring one already on that service.
	async function threadByAddress(norm, serviceName, personId) {
		const found = (await findThreads([{ prop: "normalizedAddress", op: "=", val: norm }]))
			.filter((t) => !t.channelId && (!personId || !t.personId || t.personId === personId));
		return found.find((t) => t.replyService === serviceName) || found[0];
	}

	async function addressThread(msg, target) {
		const serviceName = msg.serviceName;
		const norm = address.normalizeAddress(target.addr, serviceName);
		const p = await personFor(target.addr, serviceName, msg);
		const key = p ? "person:" + p._id : "addr:" + norm + "|" + serviceName;
		let thread = keys.has(key) ? await getThread(keys.get(key)) : undefined;
		if (!thread && p) {
			thread = (await findThreads([{ prop: "personId", op: "=", val: p._id }]))[0];
			if (!thread) {
				// A thread started before its contact was linked is keyed on the address alone.
				thread = await threadByAddress(norm, serviceName, p._id);
			}
		} else if (!thread) {
			thread = await threadByAddress(norm, serviceName);
		}
		const personName = p ? person.displayNameOf(p) : "";
		if (!thread) {
			thread = await create({
				displayName: personName || target.name || address.formatAddress(target.addr, serviceName),
				replyAddress: target.addr, normalizedAddress: norm, replyService: serviceName,
				personId: p ? p._id : undefined,
			});
		} else if (p && thread.personId !== p._id) {
			change(thread, { personId: p._id, displayName: personName || thread.displayName });
		} else if (!p && !thread.personId && target.name && target.name !== thread.displayName) {
			// A sender name from the transport (it can carry emoji the address cannot).
			change(thread, { displayName: target.name });
		} else if (!thread.displayName) {
			change(thread, { displayName: personName || target.name || address.formatAddress(target.addr, serviceName) });
		}
		keys.set(key, thread._id);
		return thread;
	}

	async function channelFor(serviceName, remoteId) {
		const key = serviceName + "|" + remoteId;
		if (!channels.has(key)) {
			const found = await db.find({ from: CHANNEL_KIND, where: [
				{ prop: "serviceName", op: "=", val: serviceName }, { prop: "remoteId", op: "=", val: remoteId }] }).catch(() => []);
			channels.set(key, found.find((c) => !c._del) || null);
		}
		return channels.get(key) || undefined;
	}

	async function linkChannel(channel, threadId) {
		if (!channel || channel.chatThreadId === threadId || channelLinkRefused) { return; }
		try {
			await db.merge([{ _id: channel._id, chatThreadId: threadId }]);
			channel.chatThreadId = threadId;
		} catch (e) {
			// The app links it when the channel is opened; say once why we could not.
			channelLinkRefused = true;
			log.error("threader: could not link imchannel " + channel._id + " to thread " + threadId + ": " + ((e && e.message) || e));
		}
	}

	async function channelThread(msg, target) {
		const serviceName = msg.serviceName;
		const remoteId = target.addr;
		const norm = address.normalizeAddress(remoteId, serviceName);
		const key = "chan:" + serviceName + "|" + remoteId;
		const channel = await channelFor(serviceName, remoteId);
		let thread = keys.has(key) ? await getThread(keys.get(key)) : undefined;
		if (!thread && channel && channel.chatThreadId) { thread = await getThread(channel.chatThreadId); }
		if (!thread) {
			const found = (await findThreads([{ prop: "normalizedAddress", op: "=", val: norm }]))
				.filter((t) => !t.personId && (!t.replyService || t.replyService === serviceName));
			thread = found.find((t) => channel && t.channelId === channel._id) || found[0];
		}
		const title = [msg.channelDisplayName, channel && channel.displayName].find((n) => !isRawId(n, remoteId));
		if (!thread) {
			thread = await create({
				displayName: title || msg.serverName || remoteId,
				replyAddress: remoteId, normalizedAddress: norm, replyService: serviceName,
				channelId: channel ? channel._id : undefined, serverId: channel ? channel.serverId : undefined,
			});
		} else {
			const fields = {};
			if (title && title !== thread.displayName) { fields.displayName = title; }
			if (channel && !thread.channelId) { fields.channelId = channel._id; fields.serverId = channel.serverId; }
			if (Object.keys(fields).length) { change(thread, fields); }
		}
		keys.set(key, thread._id);
		await linkChannel(channel, thread._id);
		return thread;
	}

	async function groupThread(msg, target) {
		const serviceName = msg.serviceName;
		const norm = address.normalizeAddress(target.addr, serviceName);
		const key = "group:" + norm + "|" + serviceName;
		let thread = keys.has(key) ? await getThread(keys.get(key)) : undefined;
		if (!thread) {
			thread = (await findThreads([{ prop: "normalizedAddress", op: "=", val: norm }]))
				.find((t) => !t.personId && !t.channelId && (!t.replyService || t.replyService === serviceName));
		}
		if (!thread) {
			thread = await create({ displayName: msg.groupChatDisplayName || target.addr,
				replyAddress: target.addr, normalizedAddress: norm, replyService: serviceName });
		}
		keys.set(key, thread._id);
		return thread;
	}

	// What a message does to its thread: the newest message sets the summary, the time and
	// whether it went out; an unread incoming one adds to the count; any incoming one shows the
	// thread again if it was hidden. History that arrives late (a sync back-fills old messages)
	// is linked and counted but does not take the summary from a newer message.
	function apply(thread, msg) {
		if (msg.folder !== "inbox" && msg.folder !== "outbox") { return; }
		const incoming = message.isIncoming(msg);
		if (!message.isVisible(msg) && !incoming) { return; }
		const fields = { flags: { visible: true } };
		const at = msg.localTimestamp || msg.timestamp || now();
		if (at >= (thread.timestamp || 0) || !thread.summary) {
			fields.timestamp = Math.max(at, thread.timestamp || 0);
			fields.summary = message.messageText(msg);
			fields.flags.outgoing = msg.folder === "outbox";
			if (msg.serviceName) { fields.replyService = msg.serviceName; }
		}
		if (message.isUnread(msg) && !message.isReplacement(msg)) {
			fields.unreadCount = (thread.unreadCount || 0) + 1;
		}
		change(thread, fields);
		if (incoming && message.isUnread(msg) && !message.isReplacement(msg) && !(msg.flags && msg.flags.noNotification)) {
			const prev = notify.get(thread._id);
			if (!prev || (prev.localTimestamp || 0) <= at) { notify.set(thread._id, msg); }
		}
	}

	// The thread(s) of one message, updated in memory; the message's link is queued unless
	// `link` is false (putMessage stores the message itself, with its conversations).
	async function thread(msg, { link = true } = {}) {
		const ids = [];
		for (const target of message.threadTargets(msg)) {
			let t;
			if (target.type === "channel") { t = await channelThread(msg, target); }
			else if (target.type === "group") { t = await groupThread(msg, target); }
			else { t = await addressThread(msg, target); }
			if (ids.indexOf(t._id) === -1) {
				ids.push(t._id);
				apply(t, msg);
			}
		}
		const conversations = Array.from(new Set((msg.conversations || []).concat(ids)));
		msg.conversations = conversations;
		if (link && msg._id) { links.push({ _id: msg._id, conversations }); }
		return ids;
	}

	// The message is already in these threads (a reply the app knows the thread of).
	async function update(msg, threadIds) {
		const ids = [];
		for (const id of threadIds) {
			const t = await getThread(id);
			if (t) { apply(t, msg); ids.push(id); }
		}
		return ids;
	}

	// Write every message link, then every changed thread: two merges for the whole run. Links
	// first: a message once linked is never threaded (and counted) again, while a thread whose
	// merge was lost is put right by the next recount of its messages.
	async function flush() {
		const ls = links.splice(0, links.length);
		const merges = Array.from(dirty.entries()).map(([id, fields]) => Object.assign({ _id: id }, fields));
		dirty.clear();
		if (ls.length) { await db.merge(ls); }
		if (merges.length) { await db.merge(merges); }
		return { threads: merges.length, messages: ls.length };
	}

	return { thread, update, flush, getThread, notifications: () => new Map(notify), threads };
}

module.exports = { createRun, isRawId, THREAD_KIND, CHANNEL_KIND };
