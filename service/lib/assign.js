/* assign.js - thread every message that has no conversation yet.
 *
 *   const assigner = createAssigner({ db, tempdb, notifier, log });
 *   const { rev } = await assigner.assign(lastRev);
 *
 * Reads the unthreaded messages after lastRev a page at a time (the forChatThreading index:
 * conversations null, visible, no threadingError, by _rev), threads them as one run, and returns
 * the revision to watch from next. A message that fails is logged and skipped, so it cannot hold
 * up the rest; the returned revision stops short of it, so it is tried again on the next run.
 * One that has failed `parkAfter` times is parked with flags.threadingError, which the query
 * leaves out, so a bad record cannot keep the activity firing for ever.
 */
"use strict";

const { createRun } = require("./threader.js");

const MESSAGE_KIND = "com.palm.message:1";

function unthreadedQuery(rev, limit) {
	return {
		from: MESSAGE_KIND,
		where: [
			{ prop: "conversations", op: "=", val: null },
			{ prop: "flags.visible", op: "=", val: true },
			{ prop: "flags.threadingError", op: "=", val: null },
			{ prop: "_rev", op: ">", val: rev },
		],
		limit,
	};
}

function createAssigner({ db, tempdb, notifier, log = console, now, pageSize = 200, maxPages = 10, parkAfter = 3 }) {
	const failures = new Map();   // message _id -> times it failed, across runs

	async function assign(lastRev) {
		let rev = Number(lastRev) || 0;
		let cursor = rev;
		let threaded = 0, parked = 0;
		let retryFrom = Infinity;   // lowest _rev of a failure still to retry
		const run = createRun({ db, tempdb, log, now });
		for (let page = 0; page < maxPages; page++) {
			const { results, next } = await db.findPage(unthreadedQuery(cursor, pageSize));
			for (const msg of results) {
				cursor = Math.max(cursor, msg._rev);
				try {
					await run.thread(msg);
					threaded++;
					failures.delete(msg._id);
				} catch (e) {
					const n = (failures.get(msg._id) || 0) + 1;
					log.error("assign: message " + msg._id + " failed (" + n + "x): " + ((e && e.stack) || e));
					if (n >= parkAfter) {
						failures.delete(msg._id);
						await db.merge([{ _id: msg._id, flags: { threadingError: true } }]);
						parked++;
					} else {
						failures.set(msg._id, n);
						retryFrom = Math.min(retryFrom, msg._rev);
					}
				}
			}
			if (!next || results.length < pageSize) { break; }
		}
		await run.flush();
		rev = retryFrom === Infinity ? cursor : Math.max(rev, retryFrom - 1);
		let notified = 0;
		if (notifier) {
			try { notified = await notifier.notify(run.notifications(), run.threads); }
			catch (e) { log.error("assign: notifying failed: " + ((e && e.message) || e)); }
		}
		return { rev, threaded, parked, notified, more: cursor > rev || retryFrom !== Infinity };
	}

	return { assign, failures };
}

module.exports = { createAssigner, unthreadedQuery, MESSAGE_KIND };
