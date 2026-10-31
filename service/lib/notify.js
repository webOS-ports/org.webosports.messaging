/* notify.js - the toast for new messages while the Messaging app is not running.
 *
 * While the app runs, its DashboardManager raises these itself (and knows which thread is open),
 * so the service stays quiet then. Otherwise it follows the same rules as the app: nothing when
 * notifications are off in the app's preferences, nothing for a message older than notifyMaxAgeMinutes (a transport back-filling history after
 * sign-in would otherwise toast every old message), and one toast per thread per batch. A muted
 * chat's messages (flags.noNotification) never get here: the threader leaves them out of what it
 * hands over.
 */
"use strict";

const toasttext = require("./toasttext.js");

const APP_ID = "org.webosports.app.messaging";
const PREFS_KIND = "com.palm.app.messagingprefs:1";
const DEFAULT_MAX_AGE_MINUTES = 60;

function createNotifier({ db, call, log = console, now = () => Date.now() }) {
	async function appRunning() {
		try {
			const r = await call("luna://com.webos.service.applicationmanager/running", {});
			return (r.running || []).some((a) => a && a.id === APP_ID);
		} catch (e) {
			// Not knowing is no reason to stay silent: a duplicate beats a missed message.
			log.error("notify: could not ask which apps run: " + ((e && e.message) || e));
			return false;
		}
	}

	async function prefs() {
		try { return (await db.find({ from: PREFS_KIND, limit: 1 }, { pages: 1 }))[0] || {}; }
		catch (e) { return {}; }
	}

	// newest: Map threadId -> newest incoming message; threads: Map threadId -> thread.
	async function notify(newest, threads) {
		if (!newest.size) { return 0; }
		const p = await prefs();
		if (p.enableNotification === false) { return 0; }
		const maxAge = p.notifyMaxAgeMinutes === undefined ? DEFAULT_MAX_AGE_MINUTES : p.notifyMaxAgeMinutes;
		const due = Array.from(newest.entries()).filter(([, msg]) =>
			(maxAge === -1 || now() - (msg.localTimestamp || msg.timestamp || 0) <= maxAge * 60000));
		if (!due.length || await appRunning()) { return 0; }
		let sent = 0;
		for (const [threadId, msg] of due) {
			const thread = threads.get(threadId) || {};
			const sender = (msg.from && (msg.from.name || msg.from.addr)) || thread.displayName || "";
			const title = toasttext.plain(thread.displayName || sender);
			const body = toasttext.notificationText(msg) || "New message";
			try {
				await call("luna://com.webos.notification/createToast", {
					sourceId: APP_ID,
					title,
					message: body,
					iconUrl: "/usr/palm/applications/" + APP_ID + "/assets/notification-large-messaging.png",
					onclick: { appId: APP_ID, params: { threadId } },
				});
				sent++;
			} catch (e) {
				log.error("notify: createToast failed: " + ((e && e.message) || e));
			}
		}
		return sent;
	}

	return { notify };
}

module.exports = { createNotifier, APP_ID };
