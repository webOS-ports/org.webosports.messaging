/* commands.js - the service's methods.
 *
 *   assignMessages   {lastCheckedRev}   thread new messages (the message watch)
 *   readChanges      {lastReadRev}      recount threads whose messages were read (read watch)
 *   messagesDeleted  {lastDeletedRev}   update threads that lost messages (delete watch)
 *   putMessage       {message}          thread a message and store it -> {threadids}
 *   deleteChatthread {threadId}         delete a thread; its messages go too, unless they are
 *                                       also in another thread, which keeps them
 *   updateThreadValues {threadId}       recount a thread from its messages
 *
 * Everything that writes threads runs through one serial queue (serial.js). Whichever watch
 * fires first after an update first puts right what the old threader left (migrate.js): on a
 * device with history that is the read watch, at boot, as its revision starts from 0.
 */
"use strict";

const { missingArgs, badArgs } = require("./errors.js");
const { createRun } = require("./threader.js");
const { createAssigner } = require("./assign.js");
const { recountThreads } = require("./recount.js");
const { rearm } = require("./activity.js");
const { migrate, VERSION: MIGRATION } = require("./migrate.js");

const MESSAGE_KIND = "com.palm.message:1";
const CHANNEL_KIND = "com.palm.imchannel:1";
const PAGE = 500;

function createCommands({ db, tempdb, call, notifier, state, serial, log = console, now }) {
	const assigner = createAssigner({ db, tempdb, notifier, log, now });

	function startRev(params, key) {
		const given = Number(params[key]) || 0;
		return state ? Math.max(given, state.get(key)) : given;
	}

	async function finish(method, key, rev, params) {
		if (state) { state.set(key, rev); }
		try { await rearm({ call, log }, method, rev, params.$activity); }
		catch (e) { log.error("commands: re-arming " + method + " failed: " + ((e && e.message) || e)); }
	}

	// The threads touched by messages matching `where`, and the highest of `revProp` among them.
	async function touched(where, revProp, select) {
		const found = await db.find({ from: MESSAGE_KIND, select, where });
		let rev = 0;
		const ids = [];
		for (const m of found) {
			rev = Math.max(rev, Number(m[revProp]) || 0);
			ids.push(...(m.conversations || []));
		}
		return { ids, rev, count: found.length };
	}

	// Once per migration version, recorded in the state file; without a state file (a test that
	// does not ask for it) never.
	async function migrateOnce() {
		if (!state || state.get("migration") >= MIGRATION) { return; }
		try {
			const r = await migrate({ db, tempdb, log, now });
			log.log("commands: migration " + MIGRATION + " done: " + JSON.stringify(r));
			state.set("migration", MIGRATION);
		} catch (e) {
			log.error("commands: migration " + MIGRATION + " failed, trying again next time: " + ((e && e.message) || e));
		}
	}

	async function assignMessages(params) {
		const from = startRev(params, "lastCheckedRev");
		const r = await serial.run(async () => {
			await migrateOnce();
			return assigner.assign(from);
		});
		await finish("assignMessages", "lastCheckedRev", r.rev, params);
		return { rev: r.rev, threaded: r.threaded, parked: r.parked, notified: r.notified };
	}

	async function readChanges(params) {
		const from = startRev(params, "lastReadRev");
		const r = await serial.run(async () => {
			await migrateOnce();
			const t = await touched([{ prop: "readRevSet", op: ">", val: from }], "readRevSet", ["conversations", "readRevSet"]);
			const threads = await recountThreads(db, t.ids);
			return { rev: Math.max(from, t.rev), threads: threads.length };
		});
		await finish("readChanges", "lastReadRev", r.rev, params);
		return r;
	}

	async function messagesDeleted(params) {
		const from = startRev(params, "lastDeletedRev");
		const r = await serial.run(async () => {
			await migrateOnce();
			const t = await touched([{ prop: "_del", op: "=", val: true }, { prop: "_rev", op: ">", val: from }], "_rev", ["conversations", "_rev"]);
			const threads = await recountThreads(db, t.ids);
			return { rev: Math.max(from, t.rev), threads: threads.length };
		});
		await finish("messagesDeleted", "lastDeletedRev", r.rev, params);
		return r;
	}

	async function putMessage(params) {
		const msg = params.message;
		if (!msg || typeof msg !== "object") { throw missingArgs("message is required"); }
		if (!msg._kind) { throw badArgs("message needs its _kind"); }
		if (!msg.to && !msg.from && !msg.channelName && !msg.groupChatName) { throw badArgs("message needs to or from"); }
		return serial.run(async () => {
			const run = createRun({ db, tempdb, log, now });
			const record = Object.assign({}, msg);
			const known = (record.conversations || []).filter(Boolean);
			const ids = known.length ? await run.update(record, known) : await run.thread(record, { link: false });
			record.conversations = known.length ? known : ids;
			const [stored] = await db.put([record]);
			await run.flush();
			return { threadids: record.conversations, id: stored && stored.id };
		});
	}

	async function deleteChatthread(params) {
		const threadId = params.threadId;
		if (!threadId || typeof threadId !== "string") { throw missingArgs("threadId is required"); }
		return serial.run(async () => {
			let deleted = 0, kept = 0;
			// Each pass changes the set it reads, so read the first page again until it is empty.
			// Every pass removes the thread from all it read, so a thread of n messages takes
			// n / PAGE passes; the bound only stops a db that does not apply our writes.
			for (let pass = 0; pass < 10000; pass++) {
				const { results } = await db.findPage({ from: MESSAGE_KIND, limit: PAGE,
					where: [{ prop: "conversations", op: "=", val: threadId }] });
				const msgs = results.filter((m) => !m._del);
				if (!msgs.length) { break; }
				const dels = [], merges = [];
				for (const m of msgs) {
					const rest = (m.conversations || []).filter((id) => id !== threadId);
					if (rest.length) { merges.push({ _id: m._id, conversations: rest }); }
					else { dels.push(m._id); }
				}
				if (merges.length) { await db.merge(merges); kept += merges.length; }
				if (dels.length) { await db.del(dels); deleted += dels.length; }
			}
			// A channel that pointed at the thread starts a new one with its next message.
			const channels = await db.find({ from: CHANNEL_KIND, where: [{ prop: "chatThreadId", op: "=", val: threadId }] }).catch(() => []);
			if (channels.length) {
				await db.merge(channels.map((c) => ({ _id: c._id, chatThreadId: null }))).catch((e) =>
					log.error("deleteChatthread: could not unlink its channel: " + ((e && e.message) || e)));
			}
			await db.del([threadId]);
			return { deleted, kept };
		});
	}

	async function updateThreadValues(params) {
		const threadId = params.threadId;
		if (!threadId || typeof threadId !== "string") { throw missingArgs("threadId is required"); }
		const merges = await serial.run(() => recountThreads(db, [threadId]));
		return { updated: merges.length };
	}

	const timeoutMs = 300000;
	return {
		assignMessages: { handler: assignMessages, timeoutMs },
		readChanges: { handler: readChanges, timeoutMs },
		messagesDeleted: { handler: messagesDeleted, timeoutMs },
		putMessage: { handler: putMessage },
		deleteChatthread: { handler: deleteChatthread, timeoutMs },
		updateThreadValues: { handler: updateThreadValues },
	};
}

module.exports = { createCommands };
