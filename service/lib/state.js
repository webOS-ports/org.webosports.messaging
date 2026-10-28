/* state.js - the revisions each watch has handled, kept across restarts.
 *
 * The activities in configuration/activities start from revision 0 when they are created at
 * boot. For the unthreaded-message watch that costs one empty query, but the read and delete
 * watches would recount every thread with any history in it. So the last revision of each is
 * kept in a small JSON file, and a callback starts from whichever is later: its parameter or
 * the file. A missing or unreadable file is revision 0 throughout.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FILE = "/var/preferences/org.webosports.service.messaging/state.json";

function createState({ file = DEFAULT_FILE, log = console } = {}) {
	let data = null;

	function load() {
		if (data) { return data; }
		try { data = JSON.parse(fs.readFileSync(file, "utf8")) || {}; }
		catch (e) { data = {}; }
		if (typeof data !== "object" || Array.isArray(data)) { data = {}; }
		return data;
	}

	function get(key) {
		const v = Number(load()[key]);
		return Number.isFinite(v) ? v : 0;
	}

	function set(key, value) {
		const d = load();
		if (d[key] === value) { return; }
		d[key] = value;
		try {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			const tmp = file + ".tmp";
			fs.writeFileSync(tmp, JSON.stringify(d));
			fs.renameSync(tmp, file);
		} catch (e) {
			log.error("state: could not save " + file + ": " + ((e && e.message) || e));
		}
	}

	return { get, set, file };
}

module.exports = { createState, DEFAULT_FILE };
