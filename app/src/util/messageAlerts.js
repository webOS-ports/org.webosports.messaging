/**
 * What a new message sets off while the app runs: a toast, a sound alone, or nothing - and which
 * sound. After webOS 2.2.4's com.palm.app.messaging (app/controllers/notification-assistant.js:
 * considerForNotification, setNotificationSound; chatview-assistant.js: considerForNotification)
 * and the TouchPad 3.0.x app this one is ported from (app/dashboards/DashboardManager.js:
 * getSoundOptions; BannerThrottler.js).
 *
 * 2.2.4 put its sound on the banner: soundClass "notifications" with no file for the system sound,
 * the same class with the chosen file for a ringtone, "vibrate", or "none" for mute. 3.0.x played
 * "alerts" with its own audios/received.mp3, which this app does not ship, so the system sound is
 * 2.2.4's. createToast takes the same two fields and the shell plays them, so a toast here carries
 * them as the banner did. The ringer switch and a disabled toast are the system's to apply, as
 * they were LunaSysMgr's: neither app read the switch.
 *
 * For the thread on screen in the foreground both raised no banner and only played the sound
 * (playSoundOnly in 2.2.4). PalmSystem has no playSoundNotification under WAM and the app may not
 * call audiod's playSound, so the sound alone is a system sound played through
 * systemsounds/playFeedback on the alerts sink.
 *
 * The service keeps the same table in service/lib/alertsound.js for when the app is not running;
 * tests/unit/service-alertsound.test.js holds the two to the same answers.
 */

var DEFAULT_MAX_AGE_MINUTES = 60;

/** The sound class of a message alert. "notifications" in the legacy app, for both choices. */
var SOUND_CLASS = "notifications";

/** The system sound for an alert without a toast: /usr/share/systemsounds/sysmgr_notification.pcm */
var FEEDBACK = { name: "sysmgr_notification", sink: "palerts" };

function ringtonePath(prefs) {
    var ringtone = prefs && prefs.ringtone;
    // The 2.2.4 picker stored { name, path }, the 3.0.x one { name, fullPath }.
    var path = ringtone && (ringtone.path || ringtone.fullPath);
    return (typeof path === "string" && path.charAt(0) === "/") ? path : undefined;
}

/**
 * The sound fields for a message toast, from the prefs' notificationSound. "alert" is what the
 * legacy app stored for System Sound and "system" what this app's picker stores. A ringtone with
 * no file chosen plays the system sound, as an unset soundFile did on webOS. Anything else is
 * mute, as it was in the legacy switch.
 */
function toastSound(prefs) {
    var choice = (prefs && prefs.notificationSound !== undefined) ? prefs.notificationSound : "system";
    switch (choice) {
    case "alert":
    case "system":
        return { soundClass: SOUND_CLASS };
    case "ringtone":
        var path = ringtonePath(prefs);
        return path ? { soundClass: SOUND_CLASS, soundFile: path } : { soundClass: SOUND_CLASS };
    case "vibrate":
        return { soundClass: "vibrate" };
    default:
        return { soundClass: "none" };
    }
}

/**
 * The playFeedback request for a sound with no toast, or null when the prefs want none. Vibrate
 * has no feedback sound, and the app holds no vibrate permission, so it stays silent here.
 */
function feedbackSound(prefs) {
    var sound = toastSound(prefs);
    if (sound.soundClass !== SOUND_CLASS) {
        return null;
    }
    return { name: FEEDBACK.name, sink: FEEDBACK.sink };
}

/**
 * What one incoming, unread message sets off: "toast", "sound" (the thread is on screen in the
 * foreground) or null.
 *
 * ctx.prefs           the messaging prefs record, or undefined before it has loaded
 * ctx.filterAll       true while every notification is held back
 * ctx.onScreenThread  the id of the thread on screen in a foregrounded app, if any
 * ctx.now             the time now, in ms
 */
function decide(message, ctx) {
    var prefs = ctx.prefs;
    if (prefs && prefs.enableNotification === false) {
        return null;
    }
    if (ctx.filterAll) {
        return null;
    }
    // A muted chat: the legacy processChanges skipped these, as the service's threader does.
    if (message.flags && message.flags.noNotification) {
        return null;
    }
    // During a history sync the transports back-fill old messages with their original send time,
    // so only messages inside the configured window alert at all.
    var maxAge = (prefs && prefs.notifyMaxAgeMinutes !== undefined) ?
        prefs.notifyMaxAgeMinutes : DEFAULT_MAX_AGE_MINUTES;
    if (maxAge !== -1) {
        var age = ctx.now - (message.localTimestamp || message.timestamp || 0);
        if (age > maxAge * 60 * 1000) {
            return null;
        }
    }
    var threadId = message.conversations && message.conversations[0];
    if (ctx.onScreenThread && ctx.onScreenThread === threadId) {
        return "sound";
    }
    return "toast";
}

/**
 * The alerts for one batch of new messages: the toasts to raise, each with the sound fields it
 * carries, and the feedback sound to play, if any. One batch makes one sound - the first toast
 * carries it, and the others are silent; a batch with no toast but a message in the thread on
 * screen plays the feedback sound once.
 *
 * ctx is as for decide(), plus throttled(threadId), which says whether that thread alerted too
 * recently (and records that it alerts now when it did not).
 */
function plan(messages, ctx) {
    var toasts = [];
    var soundOnly = false;
    for (var i = 0; i < messages.length; i++) {
        var message = messages[i];
        var what = decide(message, ctx);
        if (!what) {
            continue;
        }
        var threadId = message.conversations && message.conversations[0];
        if (ctx.throttled && ctx.throttled(threadId)) {
            continue;
        }
        if (what === "sound") {
            soundOnly = true;
        } else {
            toasts.push({ message: message, threadId: threadId, sound: {} });
        }
    }
    if (toasts.length > 0) {
        toasts[0].sound = toastSound(ctx.prefs);
        return { toasts: toasts, feedback: null };
    }
    return { toasts: toasts, feedback: soundOnly ? feedbackSound(ctx.prefs) : null };
}

module.exports = {
    SOUND_CLASS: SOUND_CLASS,
    toastSound: toastSound,
    feedbackSound: feedbackSound,
    decide: decide,
    plan: plan
};
