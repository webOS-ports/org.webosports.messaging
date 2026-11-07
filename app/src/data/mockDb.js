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

// Pictures for the fixtures live in app/mock (a devAssets folder, so production packs leave it out;
// tools/make-mock-media.py makes them). Message bodies need an absolute http(s)/file URL before
// ConversationItem treats them as an image, so build one from wherever index.html is served.
var MOCK_URL = String(window.location.href).replace(/[?#].*$/, "").replace(/[^\/]*$/, "") + "mock/";

function avatar(name) {
    return { squarePhotoPath: "mock/avatars/" + name + ".svg" };
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
        photos: avatar("anna")
    },
    {
        _id: "person-ben", _kind: "com.palm.person:1", favorite: true,
        contactIds: ["contact-ben"],
        name: { givenName: "Ben", familyName: "Okafor" },
        emails: [],
        phoneNumbers: [{ value: "+442071838750", type: "type_mobile" }],
        ims: [{ value: "44207183875@s.whatsapp.net", type: "type_whatsapp" }],
        photos: avatar("ben")
    },
    {
        _id: "person-chi", _kind: "com.palm.person:1", favorite: false,
        contactIds: ["contact-chi"],
        name: { givenName: "Chi", familyName: "Nguyen" },
        phoneNumbers: [{ value: "5551234567", type: "type_home" }],
        ims: [{ value: "chi_ng", type: "type_discord" }],
        photos: avatar("chi")
    },
    {
        _id: "person-dora", _kind: "com.palm.person:1", favorite: false,
        contactIds: ["contact-dora"],
        name: { givenName: "Dora", familyName: "Silva" },
        phoneNumbers: [{ value: "+5511987654321", type: "type_mobile" }],
        ims: [{ value: "dora.silva", type: "type_telegram" }],
        photos: avatar("dora")
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
    },
    {
        _id: "person-marta", _kind: "com.palm.person:1", favorite: true,
        contactIds: ["contact-marta"],
        name: { givenName: "Marta", familyName: "Lindqvist" },
        phoneNumbers: [{ value: "+46701234567", type: "type_mobile" }],
        ims: [{ value: "+46701234567", type: "type_whatsapp" }, { value: "+46701234567", type: "type_signal" }],
        photos: avatar("marta")
    },
    {
        _id: "person-sam", _kind: "com.palm.person:1", favorite: false,
        contactIds: ["contact-sam"],
        name: { givenName: "Sam", familyName: "Patel" },
        phoneNumbers: [{ value: "5559876543", type: "type_mobile" }],
        ims: [],
        photos: avatar("sam")
    },
    {
        _id: "person-yuki", _kind: "com.palm.person:1", favorite: true,
        contactIds: ["contact-yuki"],
        name: { givenName: "Yuki", familyName: "Tanaka" },
        phoneNumbers: [],
        ims: [{ value: "yuki.t", type: "type_telegram" }],
        photos: avatar("yuki")
    },
    {
        _id: "person-tomas", _kind: "com.palm.person:1", favorite: false,
        contactIds: ["contact-tomas"],
        name: { givenName: "Tomás", familyName: "Rivera" },
        phoneNumbers: [],
        ims: [{ value: "tomas_r", type: "type_discord" }],
        photos: avatar("tomas")
    },
    {
        _id: "person-mum", _kind: "com.palm.person:1", favorite: true,
        contactIds: ["contact-mum"],
        name: { givenName: "Mum" },
        phoneNumbers: [{ value: "+15015550142", type: "type_mobile" }],
        ims: [{ value: "+15015550142", type: "type_whatsapp" }],
        photos: avatar("mum")
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
        replyAddress: "44207183875@s.whatsapp.net", normalizedAddress: "+44207183875",
        replyService: "type_whatsapp",
        summary: "file:///media/internal/downloads/voice-note-0143.opus",
        timestamp: ago(0, 5), unreadCount: 0,
        flags: { visible: true, outgoing: true, locked: false }
    },
    {
        _id: "thread-marta", _kind: "com.palm.chatthread:1",
        personId: "person-marta", displayName: "Marta Lindqvist",
        replyAddress: "46701234567@s.whatsapp.net", normalizedAddress: "+46701234567",
        replyService: "type_whatsapp",
        summary: "Photos from the lake are up!",
        timestamp: ago(0, 6), unreadCount: 1,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        _id: "thread-family", _kind: "com.palm.chatthread:1",
        displayName: "Family",
        replyAddress: "120363041234567890@g.us", normalizedAddress: "120363041234567890@g.us",
        replyService: "type_whatsapp", serviceName: "type_whatsapp",
        summary: "Mum: Lovely. Six o'clock, and bring a jacket, we'll eat outside",
        timestamp: ago(0, 3.5), unreadCount: 3,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        _id: "thread-sam", _kind: "com.palm.chatthread:1",
        personId: "person-sam", displayName: "Sam Patel",
        replyAddress: "5559876543", normalizedAddress: "5559876543", replyService: "sms",
        summary: "Got it, thanks. Leaving now",
        timestamp: ago(1, 6), unreadCount: 0,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        _id: "thread-yuki", _kind: "com.palm.chatthread:1",
        personId: "person-yuki", displayName: "Yuki Tanaka",
        replyAddress: "yuki.t", normalizedAddress: "yuki.t", replyService: "type_telegram",
        summary: "ありがとう! See you on Friday",
        timestamp: ago(3, 1), unreadCount: 0,
        flags: { visible: true, outgoing: false, locked: false }
    },
    {
        _id: "thread-tomas", _kind: "com.palm.chatthread:1",
        personId: "person-tomas", displayName: "Tomás Rivera",
        replyAddress: "tomas_r", normalizedAddress: "tomas_r", replyService: "type_discord",
        summary: "Pushed the fix, can you have a look?",
        timestamp: ago(12), unreadCount: 0,
        flags: { visible: true, outgoing: false, locked: false }
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
    },
    {
        _id: "buddy-marta", _kind: "com.palm.imbuddystatus:1",
        personId: "person-marta", username: "46701234567@s.whatsapp.net",
        serviceName: "type_whatsapp", displayName: "Marta Lindqvist",
        availability: 0, personAvailability: 0,
        status: "Back from the mountains", group: "Buddies", offline: false, primary: true,
        groupAvailability: "0"
    },
    {
        _id: "buddy-yuki", _kind: "com.palm.imbuddystatus:1",
        personId: "person-yuki", username: "yuki.t", serviceName: "type_telegram",
        displayName: "Yuki Tanaka", availability: 2, personAvailability: 2,
        status: "Travelling", group: "Buddies", offline: false, primary: true,
        groupAvailability: "2"
    },
    {
        _id: "buddy-tomas", _kind: "com.palm.imbuddystatus.libpurple:1",
        personId: "person-tomas", username: "tomas_r", serviceName: "type_discord",
        displayName: "Tomás Rivera", availability: 0, personAvailability: 0,
        status: "Hacking on LuneOS", group: "Work", offline: false, primary: true,
        groupAvailability: "0"
    }
];

// --- messages ----------------------------------------------------------------------------

var messages = [
    // thread-anna: a normal back-and-forth with a reply, a reaction and a read receipt.
    {
        _id: "msg-a0a", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "inbox", messageText: "Did you get the tickets for the exhibition?",
        localTimestamp: ago(1, 5), timestamp: ago(1, 5), status: "successful",
        serviceName: "type_telegram", from: { addr: "anna.k", name: "Anna Kowalski" },
        flags: { visible: true, read: true }
    },
    {
        _id: "msg-a0b", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "outbox", messageText: "Two for tomorrow afternoon. They had student prices too!",
        localTimestamp: ago(1, 4.9), timestamp: ago(1, 4.9), status: "successful",
        serviceName: "type_telegram", deliveryStatus: "read",
        to: [{ addr: "anna.k" }], flags: { visible: true }
    },
    {
        _id: "msg-a0c", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "inbox", messageText: "Amazing, thank you &#127881;",
        localTimestamp: ago(1, 4.8), timestamp: ago(1, 4.8), status: "successful",
        serviceName: "type_telegram", from: { addr: "anna.k", name: "Anna Kowalski" },
        flags: { visible: true, read: true }
    },
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
        // The network's id for it, which a reply quoting it names (quotedMessageId).
        serviceMessageId: "tg-4471",
        localTimestamp: ago(0, 3), timestamp: ago(0, 3), status: "successful",
        serviceName: "type_telegram", deliveryStatus: "read",
        to: [{ addr: "anna.k" }], flags: { visible: true }
    },
    {
        _id: "msg-a3", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "inbox", messageText: "Perfect &#128512;",
        localTimestamp: ago(0, 2), timestamp: ago(0, 2), status: "successful",
        serviceName: "type_telegram", from: { addr: "anna.k", name: "Anna Kowalski" },
        // The field names the transports actually stamp on a reply (see ConversationItem.buildQuote).
        quotedFrom: "You",
        quotedText: "Yes — 14:30 at the north entrance",
        quotedMessageId: "tg-4471",
        reactions: [{ emoji: "&#128077;", count: 2, mine: true }],
        flags: { visible: true, read: false }
    },
    {
        // A file the transport saved on the device, drawn as a chip; forwarding it takes the file.
        _id: "msg-a3f", _kind: "com.palm.message:1", conversations: ["thread-anna"],
        folder: "inbox", messageText: "",
        filePath: "/media/internal/downloads/exhibition-tickets.pdf",
        localTimestamp: ago(0, 1.5), timestamp: ago(0, 1.5), status: "successful",
        serviceName: "type_telegram", from: { addr: "anna.k", name: "Anna Kowalski" },
        serviceMessageId: "tg-4475",
        flags: { visible: true, read: true }
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
        folder: "inbox", messageText: "Here's the shot from yesterday " + MOCK_URL + "photos/pier.jpg",
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

    // thread-marta: Signal first, then WhatsApp with a photo; the dividers start again on the
    // change of service, since both share the number.
    {
        _id: "msg-m0", _kind: "com.palm.message:1", conversations: ["thread-marta"],
        folder: "inbox", messageText: "Landed! Phone's almost dead, more later",
        localTimestamp: ago(1, 2), timestamp: ago(1, 2), status: "successful",
        serviceName: "type_signal", from: { addr: "+46701234567", name: "Marta Lindqvist" },
        flags: { visible: true, read: true }
    },
    {
        _id: "msg-m0b", _kind: "com.palm.message:1", conversations: ["thread-marta"],
        folder: "outbox", messageText: "Welcome back! Charge up and send pictures 📸",
        localTimestamp: ago(1, 1.9), timestamp: ago(1, 1.9), status: "successful",
        serviceName: "type_signal", deliveryStatus: "read",
        to: [{ addr: "+46701234567" }], flags: { visible: true }
    },
    {
        _id: "msg-m1", _kind: "com.palm.message:1", conversations: ["thread-marta"],
        folder: "outbox", messageText: "How was the trip?",
        localTimestamp: ago(0, 8), timestamp: ago(0, 8), status: "successful",
        serviceName: "type_whatsapp", deliveryStatus: "read",
        to: [{ addr: "+46701234567" }], flags: { visible: true }
    },
    {
        _id: "msg-m2", _kind: "com.palm.message:1", conversations: ["thread-marta"],
        folder: "inbox", messageText: MOCK_URL + "photos/lake.jpg Photos from the lake are up!",
        localTimestamp: ago(0, 6), timestamp: ago(0, 6), status: "successful",
        serviceName: "type_whatsapp", from: { addr: "+46701234567", name: "Marta Lindqvist" },
        flags: { visible: true, read: false }
    },

    // thread-family: a WhatsApp group with three senders.
    {
        _id: "msg-f1", _kind: "com.palm.message:1", conversations: ["thread-family"],
        folder: "inbox", messageText: "Dinner at ours on Sunday?",
        localTimestamp: ago(0, 4.5), timestamp: ago(0, 4.5), status: "successful",
        serviceName: "type_whatsapp", chatType: "groupchat", channelName: "Family",
        from: { addr: "+15015550142", name: "Mum" },
        flags: { visible: true, read: false }
    },
    {
        // Deleted for everyone, as imlibpurpleservice's DeleteHandler leaves it.
        _id: "msg-f1d", _kind: "com.palm.message:1", conversations: ["thread-family"],
        folder: "inbox", messageText: "This message was deleted.", deleted: true,
        localTimestamp: ago(0, 4.2), timestamp: ago(0, 4.2), status: "successful",
        serviceName: "type_whatsapp", chatType: "groupchat", channelName: "Family",
        from: { addr: "+46701234567", name: "Marta Lindqvist" },
        flags: { visible: true, read: false }
    },
    {
        _id: "msg-f2", _kind: "com.palm.message:1", conversations: ["thread-family"],
        folder: "inbox", messageText: "Yes please! I'll bring dessert &#127856;",
        localTimestamp: ago(0, 4), timestamp: ago(0, 4), status: "successful",
        serviceName: "type_whatsapp", chatType: "groupchat", channelName: "Family",
        serviceMessageId: "3EB0C4F1A2",
        from: { addr: "+46701234567", name: "Marta Lindqvist" },
        flags: { visible: true, read: false }
    },
    {
        _id: "msg-f3", _kind: "com.palm.message:1", conversations: ["thread-family"],
        folder: "inbox", messageText: "Lovely. Six o'clock, and bring a jacket, we'll eat outside",
        localTimestamp: ago(0, 3.5), timestamp: ago(0, 3.5), status: "successful",
        serviceName: "type_whatsapp", chatType: "groupchat", channelName: "Family",
        from: { addr: "+15015550142", name: "Mum" },
        quotedFrom: "Marta Lindqvist", quotedText: "Yes please! I'll bring dessert", quotedMessageId: "3EB0C4F1A2",
        // Edited after it was sent (EditHandler).
        edited: true,
        flags: { visible: true, read: false }
    },

    // thread-sam: SMS.
    {
        _id: "msg-p1", _kind: "com.palm.smsmessage:1", conversations: ["thread-sam"],
        folder: "outbox", messageText: "It's 12 Harbour Road, second floor. Ring twice",
        localTimestamp: ago(1, 7), timestamp: ago(1, 7), status: "successful",
        serviceName: "sms", smsType: 0, deliveryStatus: "delivered",
        to: [{ addr: "5559876543" }], flags: { visible: true }
    },
    {
        _id: "msg-p2", _kind: "com.palm.smsmessage:1", conversations: ["thread-sam"],
        folder: "inbox", messageText: "Got it, thanks. Leaving now",
        localTimestamp: ago(1, 6), timestamp: ago(1, 6), status: "successful",
        serviceName: "sms", smsType: 0, from: { addr: "5559876543" },
        flags: { visible: true, read: true }
    },

    // thread-yuki and thread-tomas: short 1:1 chats.
    {
        _id: "msg-y1", _kind: "com.palm.message:1", conversations: ["thread-yuki"],
        folder: "outbox", messageText: "Left your book at the front desk",
        localTimestamp: ago(3, 2), timestamp: ago(3, 2), status: "successful",
        serviceName: "type_telegram", deliveryStatus: "read",
        to: [{ addr: "yuki.t" }], flags: { visible: true }
    },
    {
        _id: "msg-y2", _kind: "com.palm.message:1", conversations: ["thread-yuki"],
        folder: "inbox", messageText: "ありがとう! See you on Friday",
        localTimestamp: ago(3, 1), timestamp: ago(3, 1), status: "successful",
        serviceName: "type_telegram", from: { addr: "yuki.t", name: "Yuki Tanaka" },
        flags: { visible: true, read: true }
    },
    {
        _id: "msg-t1", _kind: "com.palm.message:1", conversations: ["thread-tomas"],
        folder: "inbox", messageText: "Pushed the fix, can you have a look?",
        localTimestamp: ago(12), timestamp: ago(12), status: "successful",
        serviceName: "type_discord", from: { addr: "tomas_r", name: "Tomás Rivera" },
        flags: { visible: true, read: true }
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
        _id: "login-signal", _kind: "com.palm.imloginstate:1",
        accountId: "acct-signal", serviceName: "type_signal", username: "+15555550100",
        state: "online", availability: 0, customMessage: ""
    },
    {
        _id: "login-discord", _kind: "com.palm.imloginstate:1",
        accountId: "acct-discord", serviceName: "type_discord", username: "you#0001",
        state: "offline", availability: 4, customMessage: ""
    }
];

// --- accounts (the listAccounts response shape) -------------------------------------------

// Names and icon fields as the device's account templates (/usr/palm/public/accounts) carry them,
// "splitter" included: the small icon the message dividers show, as in the legacy app. The icons
// themselves are the connectors' and are not in this repo; tools/screenshots/shoot.sh copies them
// into mock/accounts from a device. Without them the app hides the icons that fail to load.
function templateIcons(templateId, name) {
    var dir = "mock/accounts/" + templateId + "/images/" + name;
    return { loc_32x32: dir + "-32x32.png", loc_48x48: dir + "-48x48.png", splitter: dir + "-32x32.png" };
}

function imAccount(service, name, username, extra) {
    var templateId = "com.palm." + service;
    var cap = {
        _id: "cap-" + service, capability: "MESSAGING", capabilitySubtype: "IM",
        id: templateId + ".im", serviceName: "type_" + service,
        loc_shortName: name, icon: templateIcons(templateId, service),
        dbkinds: { imcommand: "com.palm.imcommand." + service + ":1" },
        chatWithNonBuddies: true
    };
    for (var k in extra || {}) {
        if (extra.hasOwnProperty(k)) { cap[k] = extra[k]; }
    }
    return {
        _id: "acct-" + service, templateId: templateId, username: username, alias: name,
        loc_name: name, icon: templateIcons(templateId, service),
        capabilityProviders: [cap].concat(cap.phone ? [{
            _id: "cap-" + service + "-phone", capability: "PHONE",
            id: templateId + ".call", serviceName: "type_" + service, videoFormat: "both"
        }] : [])
    };
}

var accounts = [
    imAccount("telegram", "Telegram", "you@telegram", {
        dbkinds: { imcommand: "com.palm.imcommand.telegram:1", immessage: "com.palm.immessage.telegram:1" },
        reactions: { supported: true }, authContacts: ["Telegram"]
    }),
    imAccount("whatsapp", "WhatsApp", "+15555550100", { reactions: { supported: true }, phone: true }),
    imAccount("signal", "Signal", "+15555550100", { reactions: { supported: true } }),
    imAccount("discord", "Discord", "you#0001", { chatWithNonBuddies: false }),
    {
        _id: "acct-sms", templateId: "com.palm.palmprofile",
        username: "", alias: "HP webOS Account", loc_name: "HP webOS Account",
        capabilityProviders: [{
            _id: "cap-sms", capability: "MESSAGING", capabilitySubtype: "SMS",
            id: "com.palm.palmprofile.sms", serviceName: "sms",
            loc_name: "SMS Account", loc_shortName: "Text",
            icon: templateIcons("com.palm.palmprofile", "sms")
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
    },
    {
        _id: "server-irc", _kind: "com.palm.imserver:1",
        serviceName: "type_irc", remoteId: "irc.libera.chat",
        displayName: "irc.libera.chat", name: "irc.libera.chat", unreadCount: 0
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
    },
    {
        _id: "channel-irc-webos", _kind: "com.palm.imchannel:1",
        serverId: "server-irc", serviceName: "type_irc", remoteId: "#webos@irc.libera.chat",
        displayName: "#webos", name: "#webos", position: 0, unreadCount: 0
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

/**
 * Resolve a dotted property path, so "flags.visible" works the way db8 indexes it. Through an
 * array it collects the field from every element, as db8 does for "ims.value": the result is then
 * an array, which "=" matches when any element does.
 */
function valueAt(record, path) {
    return walk(record, String(path).split("."), 0);
}

function walk(value, parts, i) {
    for (; i < parts.length && value !== undefined && value !== null; i++) {
        if (value instanceof Array) {
            var found = [];
            for (var j = 0; j < value.length; j++) {
                var v = walk(value[j], parts, i);
                if (v !== undefined && v !== null) {
                    found.push(v);
                }
            }
            return found;
        }
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

/**
 * As db8's merge: an object in the merge is merged into the object it meets, anything else
 * (arrays too) replaces what was there. A flags merge keeps the flags it does not name.
 */
function mergeInto(target, source) {
    for (var k in source) {
        if (Object.prototype.hasOwnProperty.call(source, k)) {
            var v = source[k], old = target[k];
            if (v && typeof v === "object" && !Array.isArray(v) &&
                    old && typeof old === "object" && !Array.isArray(old)) {
                mergeInto(old, v);
            } else {
                target[k] = v;
            }
        }
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
            // A transport's own message kind (com.palm.immessage.telegram:1) extends
            // com.palm.message:1 in the real db, so a send in a mock IM chat is kept with the rest.
            if (obj._kind && !store[obj._kind] && /^com\.palm\.immessage\./.test(obj._kind)) {
                store[obj._kind] = messages;
            }
            var records = store[obj._kind] || [];
            var found = false;
            for (var j = 0; j < records.length; j++) {
                if (records[j]._id === obj._id) {
                    mergeInto(records[j], obj);
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
