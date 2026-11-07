/**
 * The files waiting to go with the next message, and how they go.
 *
 * A message carries one file (its filePath, which the transport uploads), so several files go as
 * that many messages, in the order they were picked, with the typed text on the first one: the
 * networks send a file with its caption the same way. A file picked twice is staged once, and at
 * most MAX are staged at a time.
 */

var MAX = 10;

/** The files the system file picker returns ([{ fullPath, name?, attachmentType }]) as staged ones. */
function fromPicked(files) {
    var out = [];
    for (var i = 0; files && i < files.length; i++) {
        var f = files[i];
        if (f && typeof f.fullPath === "string" && f.fullPath) {
            out.push({
                path: f.fullPath,
                name: f.name || f.fullPath.slice(f.fullPath.lastIndexOf("/") + 1),
                type: f.attachmentType
            });
        }
    }
    return out;
}

/**
 * staged with more added: those not staged already, up to MAX in all. Returns { list, dropped },
 * dropped being how many did not fit.
 */
function add(staged, more) {
    var list = (staged || []).slice(), seen = {}, dropped = 0;
    for (var i = 0; i < list.length; i++) {
        seen[list[i].path] = true;
    }
    for (var j = 0; more && j < more.length; j++) {
        var a = more[j];
        if (!a || !a.path || Object.prototype.hasOwnProperty.call(seen, a.path)) {
            continue;
        }
        if (list.length >= MAX) {
            dropped++;
            continue;
        }
        seen[a.path] = true;
        list.push(a);
    }
    return { list: list, dropped: dropped };
}

/** staged without the one at index. */
function remove(staged, index) {
    var list = (staged || []).slice();
    if (index >= 0 && index < list.length) {
        list.splice(index, 1);
    }
    return list;
}

/**
 * The messages to send for text and the staged files, as [{ text, file }]: one per file, the
 * text on the first; just the text when there are none (or canCarry is false, as for SMS). Empty
 * for nothing to send.
 */
function messages(text, staged, canCarry) {
    var files = canCarry ? (staged || []) : [];
    if (!files.length) {
        return text ? [{ text: text, file: null }] : [];
    }
    return files.map(function (f, i) {
        return { text: i === 0 ? (text || "") : "", file: f };
    });
}

module.exports = { MAX: MAX, fromPicked: fromPicked, add: add, remove: remove, messages: messages };
