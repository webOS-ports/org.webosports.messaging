/**
 * In-browser stand-in for db8, so the app can be developed and exercised without a device.
 *
 * The Mojo app used a `MockDb` kind per query; the same idea here, but one store keyed by db kind
 * with a small `where`/`orderBy` evaluator, so every service can share it. Timestamps are computed
 * relative to "now" at load time so the date-bucket dividers (Today / weekday / Last week /
 * month) all have rows to show.
 *
 * Only used when `window.PalmSystem` is absent.
 */

var DAY = 24 * 60 * 60 * 1000;
var now = Date.now();

function ago(days, hours) {
    return now - (days * DAY) - ((hours || 0) * 60 * 60 * 1000);
}

// --- people ------------------------------------------------------------------------------

var people = [
    {
        _id: "person-anna", _kind: "com.palm.person:1", favorite: true,
        contactIds: ["contact-anna"],
        name: { givenName: "Anna", familyName: "Kowalski" },
        nickname: "Ania",
        organization: { name: "Wayfarer Ltd" },
        emails: [{ value: "anna@example.com", type: "type_work" }],
        phoneNumbers: [
            { value: "+15015551212", type: "type_mobile" },
            { value: "+15015559090", type: "type_work" }
        ],
        ims: [{ value: "anna.k", type: "type_telegram" }],
        photos: { squarePhotoPath: "assets/list-avatar-default.png" }
    },
    {
        _id: "person-ben", _kind: "com.palm.person:1", favorite: true,
        contactIds: ["contact-ben"],
        name: { givenName: "Ben", familyName: "Okafor" },
        emails: [],
        phoneNumbers: [{ value: "+442071838750", type: "type_mobile" }],
        ims: [{ value: "44207183875@s.whatsapp.net", type: "type_whatsapp" }],
        photos: { squarePhotoPath: "assets/list-avatar-default.png" }
    },
    {
        _id: "person-chi", _kind: "com.palm.person:1", favorite: false,
        contactIds: ["contact-chi"],
        name: { givenName: "Chi", familyName: "Nguyen" },
        phoneNumbers: [{ value: "5551234567", type: "type_home" }],
        ims: [{ value: "chi_ng", type: "type_discord" }],
        photos: { squarePhotoPath: "assets/list-avatar-default.png" }
    },
    {
        _id: "person-dora", _kind: "com.palm.person:1", favorite: false,
        contactIds: ["contact-dora"],
        name: { givenName: "Dora", familyName: "Silva" },
        phoneNumbers: [{ value: "+5511987654321", type: "type_mobile" }],
        ims: [{ value: "dora.silva", type: "type_telegram" }],
        photos: { squarePhotoPath: "assets/list-avatar-default.png" }
    },
    {
        // A favorite with no messaging accounts at all, to exercise the "Tap here to add contact
        // info" state in the favorites list.
        _id: "person-eli", _kind: "com.palm.person:1", favorite: true,
        contactIds: ["contact-eli"],
        name: { givenName: "Eli", familyName: "Bergman" },
        phoneNumbers: [],
        ims: [],
        photos: {}
    }
];

// --- chat threads ------------------------------------------------------------------------

var chatthreads = [
    {
        _id: "thread-anna", _kind: "com.palm.chatthread:1",
        personId: "person-anna", displayName: "Anna Kowalski",
        replyAddress: "anna.k", normalizedAddress: "anna.k", replyService: "type_telegram",
        summary: "See you at the station then 🙂",
        timestamp: ago(0, 1), unreadCount: 2,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        _id: "thread-ben", _kind: "com.palm.chatthread:1",
        personId: "person-ben", displayName: "Ben Okafor",
        replyAddress: "44207183875@s.whatsapp.net", normalizedAddress: "44207183875",
        replyService: "type_whatsapp",
        summary: "file:///media/internal/downloads/voice-note-0143.opus",
        timestamp: ago(0, 5), unreadCount: 0,
        flags: { visible: true, outgoing: true, locked: false }
    },
    {
        _id: "thread-sms", _kind: "com.palm.chatthread:1",
        personId: "person-chi", displayName: "Chi Nguyen",
        replyAddress: "5551234567", normalizedAddress: "5551234567", replyService: "sms",
        summary: "Running about ten minutes late, sorry!",
        timestamp: ago(1, 3), unreadCount: 1,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        // Group chat: no personId, so the row falls back to the service logo.
        _id: "thread-group", _kind: "com.palm.chatthread:1",
        displayName: "Weekend plans",
        replyAddress: "-100234567", normalizedAddress: "-100234567",
        replyService: "type_telegram", serviceName: "type_telegram",
        summary: "Dora: I can bring the tent",
        timestamp: ago(2, 2), unreadCount: 5,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        _id: "thread-dora", _kind: "com.palm.chatthread:1",
        personId: "person-dora", displayName: "Dora Silva",
        replyAddress: "dora.silva", normalizedAddress: "dora.silva", replyService: "type_telegram",
        summary: "poll:eyJuYW1lIjoiV2hpY2ggZGF5PyJ9",
        timestamp: ago(9), unreadCount: 0,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        _id: "thread-old", _kind: "com.palm.chatthread:1",
        personId: "person-chi", displayName: "Chi Nguyen",
        replyAddress: "chi_ng", normalizedAddress: "chi_ng", replyService: "type_discord",
        summary: "Thanks for the write-up",
        timestamp: ago(45), unreadCount: 0,
        flags: { visible: true, outgoing: true, locked: false }
    },
    {
        // A channel thread: visible, but ThreadList filters it out of the conversations list and
        // the Servers tab shows it instead.
        _id: "thread-channel", _kind: "com.palm.chatthread:1",
        displayName: "LuneOS Announcements",
        channelId: "channel-luneos", serverId: "server-telegram",
        replyAddress: "-100999", normalizedAddress: "-100999",
        replyService: "type_telegram", serviceName: "type_telegram",
        summary: "Build 2026-08-05 is up",
        timestamp: ago(0, 3), unreadCount: 12,
        flags: { visible: true, outgoing: false, locked: false }
    }
];

// --- buddies (presence lives in tempdb) --------------------------------------------------

var buddies = [
    {
        _id: "buddy-anna", _kind: "com.palm.imbuddystatus:1",
        personId: "person-anna", username: "anna.k", serviceName: "type_telegram",
        displayName: "Anna Kowalski", availability: 0, personAvailability: 0,
        status: "At the office ☕", group: "Buddies", offline: false, primary: true,
        groupAvailability: "0"
    },
    {
        _id: "buddy-dora", _kind: "com.palm.imbuddystatus:1",
        personId: "person-dora", username: "dora.silva", serviceName: "type_telegram",
        displayName: "Dora Silva", availability: 2, personAvailability: 2,
        status: "In a meeting", group: "Buddies", offline: false, primary: true,
        groupAvailability: "2"
    },
    {
        _id: "buddy-chi", _kind: "com.palm.imbuddystatus.libpurple:1",
        personId: "person-chi", username: "chi_ng", serviceName: "type_discord",
        displayName: "Chi Nguyen", availability: 4, personAvailability: 4,
        status: "Away &amp; not reading", group: "Work", offline: true, primary: true,
        groupAvailability: "4"
    },
    {
        _id: "buddy-ben", _kind: "com.palm.imbuddystatus:1",
        personId: "person-ben", username: "44207183875@s.whatsapp.net",
        serviceName: "type_whatsapp", displayName: "Ben Okafor",
        availability: 0, personAvailability: 0,
        status: "", group: "Buddies", offline: false, primary: true,
        groupAvailability: "0"
    }
];

// --- messages ----------------------------------------------------------------------------

var messages = [
    // thread-anna: a normal back-and-forth with a reply, a reaction and a read receipt.
    {
        _id: "msg-a1", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "inbox", messageText: "Morning! Are we still on for today?",
        localTimestamp: ago(0, 4), timestamp: ago(0, 4), status: "successful",
        serviceName: "type_telegram", from: { addr: "anna.k", name: "Anna Kowalski" },
        flags: { visible: true, read: true }
    },
    {
        _id: "msg-a2", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "outbox", messageText: "Yes — 14:30 at the north entrance",
        localTimestamp: ago(0, 3), timestamp: ago(0, 3), status: "successful",
        serviceName: "type_telegram", deliveryStatus: "read",
        to: [{ addr: "anna.k" }], flags: { visible: true }
    },
    {
        _id: "msg-a3", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "inbox", messageText: "Perfect &#128512;",
        localTimestamp: ago(0, 2), timestamp: ago(0, 2), status: "successful",
        serviceName: "type_telegram", from: { addr: "anna.k", name: "Anna Kowalski" },
        replyTo: { from: "You", text: "Yes — 14:30 at the north entrance" },
        reactions: [{ emoji: "&#128077;", count: 2, mine: true }],
        flags: { visible: true, read: false }
    },
    {
        _id: "msg-a4", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "inbox", messageText: "See you at the station then &#128578;",
        localTimestamp: ago(0, 1), timestamp: ago(0, 1), status: "successful",
        serviceName: "type_telegram", from: { addr: "anna.k", name: "Anna Kowalski" },
        flags: { visible: true, read: false }
    },

    // thread-ben: an image, a voice note, and a failed send to exercise the error bubble.
    {
        _id: "msg-b1", _kind: "com.palm.message:1", conversations: ["thread-ben"],
        folder: "inbox", messageText: "Here's the shot from yesterday https://example.com/pier.jpg",
        localTimestamp: ago(0, 7), timestamp: ago(0, 7), status: "successful",
        serviceName: "type_whatsapp", from: { addr: "44207183875@s.whatsapp.net", name: "Ben Okafor" },
        flags: { visible: true, read: true }
    },
    {
        _id: "msg-b2", _kind: "com.palm.message:1", conversations: ["thread-ben"],
        folder: "outbox", messageText: "file:///media/internal/downloads/voice-note-0143.opus",
        localTimestamp: ago(0, 5), timestamp: ago(0, 5), status: "successful",
        serviceName: "type_whatsapp", deliveryStatus: "delivered",
        to: [{ addr: "44207183875@s.whatsapp.net" }], flags: { visible: true }
    },
    {
        _id: "msg-b3", _kind: "com.palm.message:1", conversations: ["thread-ben"],
        folder: "outbox", messageText: "Did that come through?",
        localTimestamp: ago(0, 4), timestamp: ago(0, 4),
        status: "failed", errorCategory: "smsnetworkerror", networkErrorCode: 41,
        serviceName: "type_whatsapp",
        to: [{ addr: "44207183875@s.whatsapp.net" }], flags: { visible: true }
    },

    // thread-sms: plain SMS.
    {
        _id: "msg-s1", _kind: "com.palm.smsmessage:1", conversations: ["thread-sms"],
        folder: "inbox", messageText: "Running about ten minutes late, sorry!",
        localTimestamp: ago(1, 3), timestamp: ago(1, 3), status: "successful",
        serviceName: "sms", smsType: 0, from: { addr: "5551234567" },
        flags: { visible: true, read: false }
    },
    {
        _id: "msg-s0", _kind: "com.palm.smsmessage:1", conversations: ["thread-sms"],
        folder: "outbox", messageText: "No rush, I've got us a table",
        localTimestamp: ago(1, 2), timestamp: ago(1, 2), status: "successful",
        serviceName: "sms", smsType: 0, deliveryStatus: "delivered",
        to: [{ addr: "5551234567" }], flags: { visible: true }
    },

    // thread-group: sender names on incoming messages, plus a shared location.
    {
        _id: "msg-g1", _kind: "com.palm.message:1", conversations: ["thread-group"],
        folder: "inbox", messageText: "Who's driving on Saturday?",
        localTimestamp: ago(2, 4), timestamp: ago(2, 4), status: "successful",
        serviceName: "type_telegram", chatType: "groupchat", channelName: "Weekend plans",
        from: { addr: "anna.k", name: "Anna Kowalski" },
        flags: { visible: true, read: true }
    },
    {
        _id: "msg-g2", _kind: "com.palm.message:1", conversations: ["thread-group"],
        folder: "inbox", messageText: "Meeting point\nNorth car park\ngeo:52.3676,4.9041",
        localTimestamp: ago(2, 3), timestamp: ago(2, 3), status: "successful",
        serviceName: "type_telegram", chatType: "groupchat", channelName: "Weekend plans",
        from: { addr: "dora.silva", name: "Dora Silva" },
        flags: { visible: true, read: true }
    },
    {
        _id: "msg-g3", _kind: "com.palm.message:1", conversations: ["thread-group"],
        folder: "inbox", messageText: "I can bring the tent",
        localTimestamp: ago(2, 2), timestamp: ago(2, 2), status: "successful",
        serviceName: "type_telegram", chatType: "groupchat", channelName: "Weekend plans",
        from: { addr: "dora.silva", name: "Dora Silva" },
        flags: { visible: true, read: false }
    },

    // thread-dora: a poll, and a system message.
    {
        _id: "msg-d1", _kind: "com.palm.message:1", conversations: ["thread-dora"],
        folder: "system", messageText: "Dora Silva joined the chat",
        localTimestamp: ago(9, 2), timestamp: ago(9, 2), status: "successful",
        serviceName: "type_telegram", flags: { visible: true, read: true }
    },
    {
        _id: "msg-d2", _kind: "com.palm.message:1", conversations: ["thread-dora"],
        folder: "inbox",
        // base64 of {"name":"Which day?","options":["Friday","Saturday"],"multiple":false}
        messageText: "poll:eyJuYW1lIjoiV2hpY2ggZGF5PyIsIm9wdGlvbnMiOlsiRnJpZGF5IiwiU2F0dXJkYXkiXSwibXVsdGlwbGUiOmZhbHNlfQ",
        localTimestamp: ago(9, 1), timestamp: ago(9, 1), status: "successful",
        serviceName: "type_telegram", from: { addr: "dora.silva", name: "Dora Silva" },
        flags: { visible: true, read: true }
    },

    {
        _id: "msg-o1", _kind: "com.palm.message:1", conversations: ["thread-old"],
        folder: "outbox", messageText: "Thanks for the write-up",
        localTimestamp: ago(45), timestamp: ago(45), status: "successful",
        serviceName: "type_discord", deliveryStatus: "read",
        to: [{ addr: "chi_ng" }], flags: { visible: true }
    },

    {
        _id: "msg-c1", _kind: "com.palm.message:1", conversations: ["thread-channel"],
        folder: "inbox", messageText: "Build 2026-08-05 is up",
        localTimestamp: ago(0, 3), timestamp: ago(0, 3), status: "successful",
        serviceName: "type_telegram", channelName: "LuneOS Announcements",
        from: { addr: "-100999", name: "LuneOS" },
        flags: { visible: true, read: false }
    }
];

// --- IM login states ---------------------------------------------------------------------

var loginstates = [
    {
        _id: "login-telegram", _kind: "com.palm.imloginstate:1",
        accountId: "acct-telegram", serviceName: "type_telegram", username: "you@telegram",
        state: "online", availability: 0, customMessage: ""
    },
    {
        _id: "login-whatsapp", _kind: "com.palm.imloginstate:1",
        accountId: "acct-whatsapp", serviceName: "type_whatsapp", username: "+15555550100",
        state: "online", availability: 0, customMessage: ""
    },
    {
        _id: "login-discord", _kind: "com.palm.imloginstate:1",
        accountId: "acct-discord", serviceName: "type_discord", username: "you#0001",
        state: "offline", availability: 4, customMessage: ""
    }
];

// --- accounts (the listAccounts response shape) -------------------------------------------

var accounts = [
    {
        _id: "acct-telegram", templateId: "org.webosports.telegram",
        username: "you@telegram", alias: "Telegram", loc_name: "Telegram",
        capabilityProviders: [{
            _id: "cap-telegram", capability: "MESSAGING", capabilitySubtype: "IM",
            id: "org.webosports.telegram.im", serviceName: "type_telegram",
            loc_name: "Telegram", loc_shortName: "TG",
            icon: { loc_32x32: "assets/messaging-48x48.png", loc_48x48: "assets/messaging-48x48.png" },
            dbkinds: { imcommand: "com.palm.imcommand.telegram:1", immessage: "com.palm.immessage.telegram:1" },
            chatWithNonBuddies: true,
            reactions: { supported: true },
            authContacts: ["Telegram"]
        }]
    },
    {
        _id: "acct-whatsapp", templateId: "org.webosports.whatsapp",
        username: "+15555550100", alias: "WhatsApp", loc_name: "WhatsApp",
        capabilityProviders: [{
            _id: "cap-whatsapp", capability: "MESSAGING", capabilitySubtype: "IM",
            id: "org.webosports.whatsapp.im", serviceName: "type_whatsapp",
            loc_name: "WhatsApp", loc_shortName: "WA",
            icon: { loc_32x32: "assets/messaging-48x48.png", loc_48x48: "assets/messaging-48x48.png" },
            dbkinds: { imcommand: "com.palm.imcommand.whatsapp:1" },
            chatWithNonBuddies: true,
            reactions: { supported: true }
        }, {
            _id: "cap-whatsapp-phone", capability: "PHONE",
            serviceName: "type_whatsapp", videoFormat: "both"
        }]
    },
    {
        _id: "acct-discord", templateId: "org.webosports.discord",
        username: "you#0001", alias: "Discord", loc_name: "Discord",
        capabilityProviders: [{
            _id: "cap-discord", capability: "MESSAGING", capabilitySubtype: "IM",
            id: "org.webosports.discord.im", serviceName: "type_discord",
            loc_name: "Discord", loc_shortName: "DC",
            icon: { loc_32x32: "assets/messaging-48x48.png", loc_48x48: "assets/messaging-48x48.png" },
            dbkinds: { imcommand: "com.palm.imcommand.discord:1" },
            chatWithNonBuddies: false
        }]
    },
    {
        _id: "acct-sms", templateId: "com.palm.palmprofile",
        username: "", alias: "Text Messaging", loc_name: "Text Messaging",
        capabilityProviders: [{
            _id: "cap-sms", capability: "MESSAGING", capabilitySubtype: "SMS",
            id: "com.palm.sms", serviceName: "sms",
            loc_name: "Text Messaging", loc_shortName: "SMS",
            icon: { loc_32x32: "assets/messaging-48x48.png", loc_48x48: "assets/messaging-48x48.png" }
        }]
    }
];

// --- servers / channels -------------------------------------------------------------------

var servers = [
    {
        _id: "server-telegram", _kind: "com.palm.imserver:1",
        accountId: "acct-telegram", serviceName: "type_telegram",
        displayName: "Telegram", unreadCount: 12
    },
    {
        _id: "server-discord", _kind: "com.palm.imserver:1",
        accountId: "acct-discord", serviceName: "type_discord",
        displayName: "LuneOS Discord", unreadCount: 3
    }
];

var channels = [
    {
        _id: "channel-luneos", _kind: "com.palm.imchannel:1",
        serverId: "server-telegram", serviceName: "type_telegram",
        displayName: "LuneOS Announcements", threadId: "thread-channel", unreadCount: 12
    },
    {
        _id: "channel-general", _kind: "com.palm.imchannel:1",
        serverId: "server-discord", serviceName: "type_discord",
        displayName: "#general", threadId: "thread-old", unreadCount: 3
    },
    {
        _id: "channel-dev", _kind: "com.palm.imchannel:1",
        serverId: "server-discord", serviceName: "type_discord",
        displayName: "#development", threadId: "thread-old", unreadCount: 0
    }
];

// --- store & query evaluation -------------------------------------------------------------

var store = {
    "com.palm.person:1": people,
    "com.palm.chatthread:1": chatthreads,
    "com.palm.imbuddystatus:1": buddies,
    "com.palm.imbuddystatus.libpurple:1": buddies,
    "com.palm.message:1": messages,
    "com.palm.smsmessage:1": messages,
    "com.palm.imloginstate:1": loginstates,
    "com.palm.imserver:1": servers,
    "com.palm.imchannel:1": channels
};

/** Resolve a dotted property path, so "flags.visible" works the way db8 indexes it. */
function valueAt(record, path) {
    var parts = String(path).split(".");
    var value = record;
    for (var i = 0; i < parts.length && value !== undefined && value !== null; i++) {
        value = value[parts[i]];
    }
    return value;
}

function matchesClause(record, clause) {
    var actual = valueAt(record, clause.prop);
    var expected = clause.val;

    // db8 treats an array value as "any of these".
    if (expected instanceof Array) {
        for (var i = 0; i < expected.length; i++) {
            if (matchesClause(record, { prop: clause.prop, op: clause.op, val: expected[i] })) {
                return true;
            }
        }
        return false;
    }

    switch (clause.op) {
        case "=":
            if (actual instanceof Array) {
                return actual.indexOf(expected) !== -1;
            }
            return actual === expected;
        case "!=":
            return actual !== expected;
        case "<":  return actual < expected;
        case "<=": return actual <= expected;
        case ">":  return actual > expected;
        case ">=": return actual >= expected;
        case "%":  // prefix match, case-insensitive
            return String(actual || "").toLowerCase()
                .indexOf(String(expected || "").toLowerCase()) === 0;
        case "?":  // full-text-ish: substring anywhere
            return String(actual || "").toLowerCase()
                .indexOf(String(expected || "").toLowerCase()) !== -1;
        default:
            return true;
    }
}

module.exports = {
    /** True when the app is running outside a device and should use these fixtures. */
    enabled: !('PalmSystem' in window),

    store: store,
    accounts: accounts,

    /** Evaluate a db8-style query against the fixtures. */
    find: function (query) {
        query = query || {};
        var records = store[query.from] || [];
        var results = [];
        var i, j;

        for (i = 0; i < records.length; i++) {
            var ok = true;
            var where = query.where || [];
            for (j = 0; j < where.length; j++) {
                if (!matchesClause(records[i], where[j])) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                results.push(records[i]);
            }
        }

        if (query.orderBy) {
            var key = query.orderBy;
            results.sort(function (a, b) {
                var av = valueAt(a, key), bv = valueAt(b, key);
                if (av === bv) { return 0; }
                return av > bv ? 1 : -1;
            });
            if (query.desc) {
                results.reverse();
            }
        }

        if (query.limit) {
            results = results.slice(0, query.limit);
        }

        // Hand back copies so a view mutating a row cannot corrupt the fixtures.
        return { returnValue: true, results: JSON.parse(JSON.stringify(results)) };
    },

    /** db8 `get` by id. */
    get: function (ids) {
        var results = [];
        for (var kind in store) {
            if (!store.hasOwnProperty(kind)) { continue; }
            var records = store[kind];
            for (var i = 0; i < records.length; i++) {
                if (ids.indexOf(records[i]._id) !== -1 && results.indexOf(records[i]) === -1) {
                    results.push(records[i]);
                }
            }
        }
        return { returnValue: true, results: JSON.parse(JSON.stringify(results)) };
    },

    /** The listAccounts response shape. */
    listAccounts: function () {
        return { returnValue: true, accounts: JSON.parse(JSON.stringify(accounts)), templates: accounts };
    },

    /** db8 `merge`/`put`: apply the change to the fixtures so the UI reflects it. */
    merge: function (objects) {
        var results = [];
        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];
            var records = store[obj._kind] || [];
            var found = false;
            for (var j = 0; j < records.length; j++) {
                if (records[j]._id === obj._id) {
                    for (var k in obj) {
                        if (obj.hasOwnProperty(k)) { records[j][k] = obj[k]; }
                    }
                    found = true;
                    break;
                }
            }
            if (!found && obj._kind && store[obj._kind]) {
                obj._id = obj._id || (obj._kind + "-" + Date.now() + "-" + i);
                store[obj._kind].push(obj);
            }
            results.push({ id: obj._id, rev: Date.now() });
        }
        return { returnValue: true, results: results };
    },

    /** db8 `del`. */
    del: function (ids) {
        var results = [];
        for (var kind in store) {
            if (!store.hasOwnProperty(kind)) { continue; }
            var records = store[kind];
            for (var i = records.length - 1; i >= 0; i--) {
                if (ids.indexOf(records[i]._id) !== -1) {
                    results.push({ id: records[i]._id });
                    records.splice(i, 1);
                }
            }
        }
        return { returnValue: true, results: results };
    }
};
