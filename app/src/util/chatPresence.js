/**
 * Typing and reading, between a chat and the IM transport (com.palm.imlibpurple).
 *
 * Typing to us: the transport's watchTyping pushes { serviceName, username, from, state } for a
 * 1:1 chat each time it changes, state "typing", "paused" or "none". Typers keeps the latest per
 * buddy; one that never says it stopped is let go after TYPING_LAPSE_MS, as messengers do.
 *
 * Typing ourselves: the composer reports each change to its text and Composer says what to tell
 * the transport: "typing" at once and again every TYPING_REPEAT_MS while it goes on (the services
 * let a typing state lapse), "paused" after TYPING_PAUSE_MS without a key, "none" when the text is
 * emptied or sent. Group chats get none of it: libpurple has no typing state for them.
 *
 * Reading: opening a chat tells the transport it was read (markRead), which sends the service's
 * read receipts. Neither is sent for SMS, which has no transport here.
 */

var messagingUtils = require('./messagingUtils');

var TYPING_LAPSE_MS = 15000;
var TYPING_REPEAT_MS = 5000;
var TYPING_PAUSE_MS = 5000;

/** Whether a thread's chat goes through the IM transport: not SMS, and with somewhere to send. */
function isImChat(thread) {
    return !!(thread && thread.replyAddress && thread.replyService &&
        !messagingUtils.utils.isTextMessage(thread.replyService));
}

/**
 * Whether a thread is a group or channel chat, which has no typing state in libpurple: a server
 * channel's (channelId), or a group's as the call buttons tell one (groupChatId). The transport
 * sends no typing to a chat either way.
 */
function isGroupChat(thread) {
    return !!(thread && (thread.channelId || thread.groupChatId));
}

function addressKey(addr, serviceName) {
    return String(messagingUtils.utils.normalizeAddress(String(addr || ""), serviceName) || addr || "")
        .toLowerCase();
}

function key(serviceName, username, from) {
    return [serviceName, addressKey(username, serviceName), addressKey(from, serviceName)].join("\x1f");
}

/** Who is typing to us, from watchTyping's replies. now: a clock in ms (Date.now). */
function Typers() {
    this.entries = {};
}

/**
 * Take one watchTyping reply: the first carries "typing", the typers there are; each later one is
 * a change. Returns whether anything changed.
 */
Typers.prototype.apply = function (reply, now) {
    if (!reply) {
        return false;
    }
    var changed = false, self = this;
    var one = function (e) {
        if (!e || !e.serviceName || !e.username || !e.from) {
            return;
        }
        var k = key(e.serviceName, e.username, e.from);
        if (e.state === "typing" || e.state === "paused") {
            var was = self.entries[k];
            if (!was || was.state !== e.state) {
                changed = true;
            }
            self.entries[k] = { state: e.state, at: now };
        } else if (self.entries[k]) {
            delete self.entries[k];
            changed = true;
        }
    };
    if (Array.isArray(reply.typing)) {
        // A snapshot: what was kept before it is stale.
        if (Object.keys(this.entries).length) {
            changed = true;
        }
        this.entries = {};
        reply.typing.forEach(one);
    } else {
        one(reply);
    }
    return changed;
};

/**
 * Whether the buddy of a thread is typing to us now: "typing", "paused" or null. account: ours on
 * the thread's service ({ username }).
 */
Typers.prototype.stateFor = function (thread, account, now) {
    if (!isImChat(thread) || isGroupChat(thread) || !account || !account.username) {
        return null;
    }
    var k = key(thread.replyService, account.username, thread.replyAddress);
    var e = this.entries[k];
    if (!e) {
        return null;
    }
    if (now - e.at > TYPING_LAPSE_MS) {
        delete this.entries[k];
        return null;
    }
    return e.state;
};

/** The next time something kept here lapses, or null. For a timer to redraw on. */
Typers.prototype.nextLapse = function () {
    var next = null;
    for (var k in this.entries) {
        if (Object.prototype.hasOwnProperty.call(this.entries, k)) {
            var at = this.entries[k].at + TYPING_LAPSE_MS;
            next = (next === null || at < next) ? at : next;
        }
    }
    return next;
};

/** What we tell the transport about our own typing in one chat. */
function Composer() {
    this.sent = "none";
    this.sentAt = 0;
    this.lastKey = 0;
}

/**
 * The composer's text changed at now. Returns the state to send, or null for nothing to send.
 */
Composer.prototype.input = function (text, now) {
    if (!text) {
        return this.stop();
    }
    this.lastKey = now;
    if (this.sent !== "typing" || now - this.sentAt >= TYPING_REPEAT_MS) {
        this.sent = "typing";
        this.sentAt = now;
        return "typing";
    }
    return null;
};

/** A timer fired at now: "paused" once the keys stopped for TYPING_PAUSE_MS, else null. */
Composer.prototype.tick = function (now) {
    if (this.sent === "typing" && now - this.lastKey >= TYPING_PAUSE_MS) {
        this.sent = "paused";
        this.sentAt = now;
        return "paused";
    }
    return null;
};

/** The text was sent, emptied, or the chat left: "none" when something else was sent, else null. */
Composer.prototype.stop = function () {
    if (this.sent === "none") {
        return null;
    }
    this.sent = "none";
    return "none";
};

/** The sendTyping payload for a thread, or null when the chat has no typing. */
function sendTypingPayload(thread, account, state) {
    if (!isImChat(thread) || isGroupChat(thread) || !account || !account.username || !state) {
        return null;
    }
    return {
        serviceName: thread.replyService, username: account.username,
        usernameTo: thread.replyAddress, state: state
    };
}

/** The markRead payload for a thread, or null for one the transport does not carry. */
function markReadPayload(thread, account) {
    if (!isImChat(thread) || !account || !account.username) {
        return null;
    }
    return { serviceName: thread.replyService, username: account.username, usernameTo: thread.replyAddress };
}

module.exports = {
    TYPING_LAPSE_MS: TYPING_LAPSE_MS,
    TYPING_REPEAT_MS: TYPING_REPEAT_MS,
    TYPING_PAUSE_MS: TYPING_PAUSE_MS,
    isImChat: isImChat,
    isGroupChat: isGroupChat,
    Typers: Typers,
    Composer: Composer,
    sendTypingPayload: sendTypingPayload,
    markReadPayload: markReadPayload
};
