/* migrate.js - put right the threads the Foundations threader left, once.
 *
 *   const r = await migrate({ db, tempdb, log, now });
 *
 * 1. WhatsApp threads keyed the old way. The old rules stripped the "+" from a WhatsApp number
 *    (or kept the JID); threads are now keyed on E.164, "+<digits>", so an old thread would never
 *    be found again and the next message would start a second one. Each is re-keyed; where that
 *    makes two threads for the same chat, the older one's messages move into the other and it
 *    goes. Threads of two different contacts are never joined.
 * 2. Threads named after one of our own accounts. The old threader threaded an incoming message
 *    under its "to", which imlibpurpleservice sets to the account itself, so replies piled up in
 *    a conversation with ourselves. Their messages are threaded again, under their senders, and
 *    the thread goes once nothing is left in it.
 *
 * Every thread a message moved into is recounted at the end. No toasts: nothing here is new.
 * commands.js runs this ahead of the first watch callback and records it in the state file, so
 * it runs once; a migration that fails is logged and tried again on the next activation.
 */
"use strict";

const address = require("./address.js");
const { createRun, THREAD_KIND } = require("./threader.js");
const { recountThreads } = require("./recount.js");

const MESSAGE_KIND = "com.palm.message:1";
const LOGINSTATE_KIND = "com.palm.imloginstate:1";
const VERSION = 1;

async function messagesOf(db, threadId) {
	const found = await db.find({ from: MESSAGE_KIND, where: [{ prop: "conversations", op: "=", val: threadId }] });
	return found.filter((m) => !m._del);
}

// Move every message of `from` into `to`, and delete `from`.
async function joinThreads(db, from, to) {
	const msgs = await messagesOf(db, from._id);
	const merges = msgs.map((m) => ({ _id: m._id,
		conversations: Array.from(new Set((m.conversations || []).map((id) => (id === from._id ? to._id : id)))) }));
	if (merges.length) { await db.merge(merges); }
	await db.del([from._id]);
	return merges.length;
}

async function rekeyWhatsApp(db, log, touched) {
	// No index on replyService: read every thread, once.
	const threads = (await db.find({ from: THREAD_KIND }))
		.filter((t) => !t._del && t.replyService === "type_whatsapp" && !t.channelId && t.normalizedAddress);
	const groups = new Map();
	for (const t of threads) {
		const key = address.normalizeWhatsApp(t.normalizedAddress);
		if (!groups.has(key)) { groups.set(key, []); }
		groups.get(key).push(t);
	}
	let rekeyed = 0, joined = 0;
	for (const [key, list] of groups) {
		// The thread to keep: a contact's over an address-only one, then the newest.
		list.sort((a, b) => (b.personId ? 1 : 0) - (a.personId ? 1 : 0) || (b.timestamp || 0) - (a.timestamp || 0));
		const keep = list[0];
		for (const t of list.slice(1)) {
			if (t.personId && t.personId !== keep.personId) { continue; }
			const moved = await joinThreads(db, t, keep);
			log.log("migrate: joined WhatsApp thread " + t._id + " (" + t.normalizedAddress + ", " + moved + " messages) into " + keep._id);
			touched.add(keep._id);
			joined++;
		}
		const stale = list.filter((t) => t === keep || (t.personId && t.personId !== keep.personId))
			.filter((t) => t.normalizedAddress !== key);
		if (stale.length) {
			await db.merge(stale.map((t) => ({ _id: t._id, normalizedAddress: key })));
			rekeyed += stale.length;
		}
	}
	return { rekeyed, joined };
}

async function rethreadOwnAccounts({ db, tempdb, log, now }, touched) {
	const accounts = (await db.find({ from: LOGINSTATE_KIND })).filter((a) => !a._del && a.username);
	const own = new Set(accounts.map((a) => address.normalizeAddress(a.username, a.serviceName)));
	if (!own.size) { return { threads: 0, messages: 0 }; }
	const threads = (await db.find({ from: THREAD_KIND, where: [{ prop: "normalizedAddress", op: "=", val: Array.from(own) }] }))
		.filter((t) => !t._del && !t.channelId);
	let messages = 0, removed = 0;
	for (const t of threads) {
		const run = createRun({ db, tempdb, log, now });
		const msgs = await messagesOf(db, t._id);
		let stays = 0;
		for (const m of msgs) {
			const copy = Object.assign({}, m, { conversations: (m.conversations || []).filter((id) => id !== t._id) });
			const ids = await run.thread(copy);
			for (const id of ids) { touched.add(id); }
			if (copy.conversations.indexOf(t._id) !== -1) { stays++; }
		}
		await run.flush();
		messages += msgs.length;
		if (!stays) {
			await db.del([t._id]);
			touched.delete(t._id);
			removed++;
		}
		log.log("migrate: threaded " + msgs.length + " messages of own-account thread " + t._id + " (" + t.normalizedAddress + ") again");
	}
	return { threads: removed, messages };
}

async function migrate({ db, tempdb, log = console, now }) {
	const touched = new Set();
	const whatsapp = await rekeyWhatsApp(db, log, touched);
	const own = await rethreadOwnAccounts({ db, tempdb, log, now }, touched);
	const recounted = await recountThreads(db, Array.from(touched));
	return { version: VERSION, whatsapp, own, recounted: recounted.length };
}

module.exports = { migrate, VERSION };
