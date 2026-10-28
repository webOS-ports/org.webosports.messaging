/* activity.js - the db8 watches that wake the service, as activitymanager activities.
 *
 * Three watches, each an activity whose callback is one of our methods and whose trigger is a
 * db8 watch on the revision that callback handled last:
 *
 *   chatthreader-message-watch  messages with no conversation yet   -> assignMessages
 *   chatthreader-read-watch     messages whose flags.read changed    -> readChanges
 *   chatthreader-delete-watch   messages deleted                     -> messagesDeleted
 *
 * The files in configuration/activities create them at boot (tests/unit/service-commands.test.js
 * holds them to the specs here). After a callback has done its work, the activity is completed
 * with restart:true and a trigger moved on to the new revision, so it fires again only for what
 * is new. The trigger is luna://com.palm.db/watch: activitymanager checks that the creator may
 * call the trigger method, and db8's ACG groups name only com.palm.db.
 */
"use strict";

// activitymanager under its legacy name, as Foundations' Activity calls it. Its callbacks come in
// through LSCallProxy, on a connection luna-service2 then reuses for calls back to
// com.webos.service.activitymanager - and that connection may not carry outbound calls: complete
// and create are refused as "not allowed to make calls" (seen on the qemux86-64 VM, 2026-10-28).
// The legacy name is the same activitymanager, reached over a connection of our own.
const AM = "luna://com.palm.activitymanager";
const SERVICE = "luna://org.webosports.service.messaging";
const MESSAGE_KIND = "com.palm.message:1";

const WATCHES = {
	assignMessages: {
		name: "chatthreader-message-watch",
		description: "Assigns new messages to chat threads",
		revParam: "lastCheckedRev",
		query: (rev) => ({ from: MESSAGE_KIND, where: [
			{ prop: "conversations", op: "=", val: null },
			{ prop: "flags.visible", op: "=", val: true },
			{ prop: "flags.threadingError", op: "=", val: null },
			{ prop: "_rev", op: ">", val: rev }] }),
	},
	readChanges: {
		name: "chatthreader-read-watch",
		description: "Recounts unread messages when a message is read",
		revParam: "lastReadRev",
		query: (rev) => ({ from: MESSAGE_KIND, where: [{ prop: "readRevSet", op: ">", val: rev }] }),
	},
	messagesDeleted: {
		name: "chatthreader-delete-watch",
		description: "Updates chat threads when messages are deleted",
		revParam: "lastDeletedRev",
		query: (rev) => ({ from: MESSAGE_KIND, where: [
			{ prop: "_del", op: "=", val: true }, { prop: "_rev", op: ">", val: rev }] }),
	},
};

function trigger(method, rev) {
	return { key: "fired", method: "luna://com.palm.db/watch", params: { query: WATCHES[method].query(rev) } };
}

function callback(method, rev) {
	return { method: SERVICE + "/" + method, params: { [WATCHES[method].revParam]: rev } };
}

// The whole activity, as configuration/activities holds it (rev 0) and as it is re-created.
function activitySpec(method, rev = 0) {
	const w = WATCHES[method];
	return {
		activity: {
			name: w.name,
			description: w.description,
			type: { immediate: true, priority: "normal", persist: true, explicit: true, power: true, powerDebounce: true },
			trigger: trigger(method, rev),
			callback: callback(method, rev),
		},
		start: true,
		replace: true,
	};
}

// Arm the watch again from `rev` once a callback is done. Complete the activity that called us
// with restart; if activitymanager will not (it was not ours to complete, or it is gone), create
// it again, which replaces any old one of that name.
async function rearm({ call, log = console }, method, rev, $activity) {
	const id = $activity && $activity.activityId;
	if (id !== undefined) {
		try {
			await call(AM + "/complete", { activityId: id, restart: true, trigger: trigger(method, rev), callback: callback(method, rev) });
			return "completed";
		} catch (e) {
			log.log("activity: completing " + WATCHES[method].name + " (" + id + ") failed (" +
				((e && e.message) || e) + "), creating it again");
		}
	}
	await call(AM + "/create", activitySpec(method, rev));
	return "created";
}

module.exports = { WATCHES, activitySpec, trigger, callback, rearm };
