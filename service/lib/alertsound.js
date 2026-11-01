/* alertsound.js - the sound a new-message toast carries, from the Messaging app's preferences.
 *
 * The same table as the app's util/messageAlerts.toastSound, kept here because the two share no
 * runtime; tests/unit/service-alertsound.test.js holds them to the same answers. Both follow
 * webOS 2.2.4's com.palm.app.messaging NotificationAssistant.setNotificationSound: soundClass
 * "notifications" for the system sound, the same with the chosen file for a ringtone, "vibrate",
 * and "none" for mute or anything unknown. "alert" is what the legacy app stored for System Sound,
 * "system" what this app's picker stores. notificationmgr passes the fields to the shell, which
 * plays them; the ringer switch and a disabled toast are the system's to apply.
 */
"use strict";

const SOUND_CLASS = "notifications";

function ringtonePath(prefs) {
	const ringtone = prefs && prefs.ringtone;
	// The 2.2.4 picker stored { name, path }, the 3.0.x one { name, fullPath }.
	const path = ringtone && (ringtone.path || ringtone.fullPath);
	return (typeof path === "string" && path.startsWith("/")) ? path : undefined;
}

function toastSound(prefs) {
	const choice = (prefs && prefs.notificationSound !== undefined) ? prefs.notificationSound : "system";
	switch (choice) {
	case "alert":
	case "system":
		return { soundClass: SOUND_CLASS };
	case "ringtone": {
		const path = ringtonePath(prefs);
		return path ? { soundClass: SOUND_CLASS, soundFile: path } : { soundClass: SOUND_CLASS };
	}
	case "vibrate":
		return { soundClass: "vibrate" };
	default:
		return { soundClass: "none" };
	}
}

module.exports = { toastSound, SOUND_CLASS };
