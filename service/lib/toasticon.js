/* toasticon.js - the icon a message's toast shows: its protocol's.
 *
 * The shell stacks Messaging's toasts by protocol (toasttext.group), and each stack shows the
 * icon of its toasts, so a Telegram stack carries Telegram's icon and SMS its bubble. The icon is
 * the one the account template gives its MESSAGING provider (an SMS provider names no
 * serviceName; it is the "sms" group), as the app's AccountService.getIconPath finds it for the
 * same toasts while the app runs. A protocol no template names, or one with no icon file, keeps
 * the Messaging icon.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const APP_ICON = "/usr/palm/applications/org.webosports.app.messaging/assets/notification-large-messaging.png";

// Where account templates are installed: the system ones, and those of apps from the catalog
// (authchat.js reads the same).
const TEMPLATE_DIRS = ["/usr/palm/public/accounts", "/media/cryptofs/apps/usr/palm/public/accounts"];

// A template's icon path is relative to the template's folder; an absolute one stays as it is.
function iconFile(dir, icon) {
	const rel = icon && (icon.loc_48x48 || icon.loc_32x32);
	if (typeof rel !== "string" || !rel) { return ""; }
	return path.isAbsolute(rel) ? rel : path.join(dir, rel);
}

// group -> the icon file of its MESSAGING provider, from every <dir>/<templateId>/*.json. The
// first template that names a group wins; a folder or file that is missing or does not parse, and
// an icon whose file is not there, are left out.
function readIcons(dirs = TEMPLATE_DIRS, log = console) {
	const out = new Map();
	for (const dir of dirs) {
		let ids = [];
		try { ids = fs.readdirSync(dir); } catch (e) { continue; }
		for (const id of ids) {
			const folder = path.join(dir, id);
			let files = [];
			try { files = fs.readdirSync(folder).filter((f) => f.endsWith(".json")); } catch (e) { continue; }
			for (const f of files) {
				let templates;
				try { templates = JSON.parse(fs.readFileSync(path.join(folder, f), "utf8")); }
				catch (e) { log.error("toasticon: could not read " + path.join(folder, f) + ": " + ((e && e.message) || e)); continue; }
				for (const t of [].concat(templates || [])) {
					for (const p of (t && t.capabilityProviders) || []) {
						if (!p || p.capability !== "MESSAGING") { continue; }
						const group = p.capabilitySubtype === "SMS" ? "sms" : p.serviceName;
						if (typeof group !== "string" || !group || out.has(group)) { continue; }
						const file = iconFile(folder, p.icon);
						if (file && fs.existsSync(file)) { out.set(group, file); }
					}
				}
			}
		}
	}
	return out;
}

// The icon for a toast in the group, from icons as readIcons gives them.
function iconFor(icons, group) {
	return (icons && icons.get(group)) || APP_ICON;
}

module.exports = { readIcons, iconFor, APP_ICON, TEMPLATE_DIRS };
