/* db.js - db8 over the bus, as the threader uses it.
 *
 *   const db = createDb({ call, service: "luna://com.palm.db" });
 *   await db.find(query)            -> every matching record (all pages; { pages: n } to stop early)
 *   await db.findPage(query)        -> { results, next }
 *   await db.get(ids)               -> the records found
 *   await db.put(objects)           -> [{ id, rev }]
 *   await db.merge(objects)         -> [{ id, rev }]
 *   await db.del(ids)               -> [{ id, rev }]
 *
 * luna://com.palm.db, not com.webos.service.db: db8's ACG groups only list the legacy name
 * (see the trigger note in the activity files). tempdb is the same API on com.palm.tempdb.
 * db8 takes at most 500 objects per write, so larger writes go in chunks.
 */
"use strict";

const MAX_WRITE = 500;

function createDb({ call, service = "luna://com.palm.db" }) {
	async function findPage(query) {
		const r = await call(service + "/find", { query });
		return { results: r.results || [], next: r.next };
	}

	async function find(query, { pages = Infinity } = {}) {
		const all = [];
		let q = Object.assign({}, query);
		for (let n = 0; n < pages; n++) {
			const { results, next } = await findPage(q);
			all.push(...results);
			if (!next || (query.limit && all.length >= query.limit)) { break; }
			q = Object.assign({}, query, { page: next });
		}
		return all;
	}

	async function chunked(method, key, list) {
		const out = [];
		for (let i = 0; i < list.length; i += MAX_WRITE) {
			const r = await call(service + "/" + method, { [key]: list.slice(i, i + MAX_WRITE) });
			out.push(...(r.results || []));
		}
		return out;
	}

	async function get(ids) {
		if (!ids.length) { return []; }
		return chunked("get", "ids", ids);
	}

	return {
		find, findPage, get,
		put: (objects) => chunked("put", "objects", objects),
		merge: (objects) => chunked("merge", "objects", objects),
		del: (ids) => chunked("del", "ids", ids),
	};
}

module.exports = { createDb, MAX_WRITE };
