/* authchat.js - the login chat goes once the account has signed in.
 *
 * A connector that needs a code or a password asks for it in a chat with a pseudo-contact: the
 * account template's MESSAGING provider names it in "authContacts" (Telegram's "Telegram"). The
 * user's answers stay in that chat as plain messages, a two-factor password among them. Once
 * the account is signed in, the chat has done its job, so its thread and messages are deleted.
 *
 * Signed in is what imlibpurpleservice writes to com.palm.imloginstate on LOGIN_SUCCESS,
 * "retrieving-buddies", or the "online" that follows. A service with a second account still
 * signing in keeps the chat, as that account may still be asking in it.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { normalizeAddress } = require("./address.js");

const LOGINSTATE_KIND = "com.palm.imloginstate:1";
const THREAD_KIND = "com.palm.chatthread:1";
const SIGNED_IN = new Set(["retrieving-buddies", "online"]);

// Where account templates are installed: the system ones, and those of apps from the catalog.
const TEMPLATE_DIRS = ["/usr/palm/public/accounts", "/media/cryptofs/apps/usr/palm/public/accounts"];

// serviceName -> the auth contacts its templates name, from every <dir>/<templateId>/*.json.
// A folder or file that is missing or does not parse is left out.
function readAuthContacts(dirs = TEMPLATE_DIRS, log = console) {
	const out = new Map();
	for (const dir of dirs) {
		let ids = [];
		try { ids = fs.readdirSync(dir); } catch (e) { continue; }
		for (const id of ids) {
			let files = [];
			try { files = fs.readdirSync(path.join(dir, id)).filter((f) => f.endsWith(".json")); } catch (e) { continue; }
			for (const f of files) {
				let templates;
				try { templates = JSON.parse(fs.readFileSync(path.join(dir, id, f), "utf8")); }
				catch (e) { log.error("authchat: could not read " + path.join(dir, id, f) + ": " + ((e && e.message) || e)); continue; }
				for (const t of [].concat(templates || [])) {
					for (const p of (t && t.capabilityProviders) || []) {
						if (p.capability !== "MESSAGING" || !p.serviceName || !Array.isArray(p.authContacts)) { continue; }
						const list = out.get(p.serviceName) || [];
						for (const c of p.authContacts) { if (c && list.indexOf(c) === -1) { list.push(String(c)); } }
						out.set(p.serviceName, list);
					}
				}
			}
		}
	}
	return out;
}

// The services all of whose accounts are signed in.
function signedInServices(states) {
	const all = new Map();
	for (const s of states) {
		if (s._del || !s.serviceName) { continue; }
		all.set(s.serviceName, (all.get(s.serviceName) !== false) && SIGNED_IN.has(s.state));
	}
	return Array.from(all).filter(([, ok]) => ok).map(([name]) => name);
}

// The login-chat threads of the signed-in services: a 1:1 thread on the service whose address is
// one of its auth contacts, matched as the threader keys it (lower case for an IM service).
async function authThreads(db, states, authContacts) {
	const found = [];
	for (const serviceName of signedInServices(states)) {
		const contacts = authContacts.get(serviceName) || [];
		if (!contacts.length) { continue; }
		const norms = Array.from(new Set(contacts.map((c) => normalizeAddress(c, serviceName))));
		const threads = await db.find({ from: THREAD_KIND, where: [{ prop: "normalizedAddress", op: "=", val: norms }] });
		// A contact linked to the address does not make it someone else's chat: it is still the
		// address the connector asks for codes from.
		found.push(...threads.filter((t) => !t._del && t.replyService === serviceName && !t.channelId && !t.groupChatId));
	}
	return found;
}

// The login states as they are now, and the highest revision among them.
async function loginStates(db) {
	const states = await db.find({ from: LOGINSTATE_KIND });
	const rev = states.reduce((r, s) => Math.max(r, Number(s._rev) || 0), 0);
	return { states, rev };
}

module.exports = { TEMPLATE_DIRS, SIGNED_IN, readAuthContacts, signedInServices, authThreads, loginStates };
