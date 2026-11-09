/**
 * MMS: the record the app writes for a text message that takes files along, and what it reads
 * back from one.
 *
 * webos-telephonyd sends com.palm.mmsmessage:1 outbox records through mmsd (its
 * src/telephonyservice_mms.c) and stores received MMS as inbox records of that kind. Both keep
 * the shape the webOS Messaging apps have always read an MMS in - serviceName "mms" and an
 * attachments array, text as { mimeType: "text/plain", partText }, a file as
 * { mimeType, path, name } - plus messageText (all the text) and filePath (the first file), which
 * the conversation view draws for every other message.
 *
 * An MMS can only be sent when telephonyd says so: mmsStatusQuery answers { available } - whether
 * mmsd has a service, i.e. a SIM with an MMS context.
 */

var KIND = "com.palm.mmsmessage:1";

var TYPES = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    bmp: "image/bmp", heic: "image/heic",
    "3gp": "video/3gpp", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm",
    amr: "audio/amr", m4a: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", ogg: "audio/ogg",
    oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
    txt: "text/plain", vcf: "text/x-vcard", vcs: "text/x-vcalendar", ics: "text/calendar",
    pdf: "application/pdf"
};

/** The content type for a file name by its extension; "" when unknown (telephonyd guesses then). */
function mimeTypeOf(path) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(path || ""));
    return (m && TYPES[m[1].toLowerCase()]) || "";
}

function nameOf(file) {
    var path = String(file.path);
    return file.name || path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The one outbox record for text and files sent as an MMS: base is the SMS record the view built
 * (folder, status, conversations, flags, to, ...), files the staged ones ({ path, name? }) in the
 * order picked. All of them go in this one message.
 */
function record(base, text, files) {
    var r = JSON.parse(JSON.stringify(base));
    r._kind = KIND;
    r.serviceName = "mms";
    r.messageText = text || "";
    var parts = files.map(function (f) {
        var a = { path: f.path, name: nameOf(f) };
        var type = mimeTypeOf(f.path);
        if (type) {
            a.mimeType = type;
        }
        return a;
    });
    // The text as a text/plain part too: the threader and the toasts read an MMS's text there.
    // telephonyd sends messageText and skips this part when there is one.
    if (r.messageText) {
        parts.unshift({ mimeType: "text/plain", partText: r.messageText });
    }
    r.attachments = parts;
    r.filePath = files[0].path;
    return r;
}

/** Whether an mmsStatusQuery reply says MMS can be sent now. */
function availableFrom(reply) {
    return !!reply && reply.returnValue !== false && reply.available === true;
}

function isMms(message) {
    return !!message && message._kind === KIND;
}

/** The files of an MMS that has them (attachments with a path), in order. */
function files(message) {
    var out = [];
    var parts = (message && message.attachments) || [];
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p && typeof p.path === "string" && p.path.charAt(0) === "/") {
            out.push({ path: p.path, mimeType: p.mimeType || mimeTypeOf(p.path), name: p.name || "" });
        }
    }
    return out;
}

/**
 * Whether an MMS record holds its content - one telephonyd received or the app wrote, both with
 * serviceName "mms" - rather than being the TouchPad's note that an MMS reached the paired phone.
 */
function hasContent(message) {
    return isMms(message) && message.serviceName === "mms" &&
        (!!message.messageText || !!message.filePath || files(message).length > 0);
}

/** The files after the first: filePath draws the first one, these go below it. */
function moreFiles(message) {
    var first = message && message.filePath;
    return files(message).filter(function (f) { return f.path !== first; });
}

/**
 * Text a phone message carries is plain text as the network sent it, not HTML: telephonyd stores
 * SMS and MMS text unescaped, while the IM transports store HTML they sanitized.
 */
function isPlainTextKind(message) {
    var kind = message && message._kind;
    return kind === KIND || kind === "com.palm.smsmessage:1";
}

module.exports = {
    KIND: KIND,
    mimeTypeOf: mimeTypeOf,
    record: record,
    availableFrom: availableFrom,
    isMms: isMms,
    files: files,
    hasContent: hasContent,
    moreFiles: moreFiles,
    isPlainTextKind: isPlainTextKind
};
