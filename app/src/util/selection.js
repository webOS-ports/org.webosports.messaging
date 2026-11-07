/**
 * Selecting several messages in a chat (Select, in the message menu), to copy, forward or delete
 * them together. The selection is a set of message _ids; what is done with it goes in the order
 * the messages are in the chat, whatever order they were tapped in. A message deleted for
 * everyone cannot be selected: there is nothing of it to copy or forward.
 */

var messageState = require('./messageState');

/** A selection holding just message, or none when it cannot be selected. */
function start(message) {
    var ids = {};
    if (selectable(message)) {
        ids[message._id] = true;
    }
    return ids;
}

function selectable(message) {
    return !!(message && message._id && !messageState.isDeleted(message));
}

/** ids with message added, or taken off when it was in. A new object; ids is not changed. */
function toggle(ids, message) {
    var out = {};
    for (var k in ids) {
        if (Object.prototype.hasOwnProperty.call(ids, k)) {
            out[k] = true;
        }
    }
    if (!selectable(message)) {
        return out;
    }
    if (Object.prototype.hasOwnProperty.call(out, message._id)) {
        delete out[message._id];
    } else {
        out[message._id] = true;
    }
    return out;
}

function has(ids, message) {
    return !!(message && ids && Object.prototype.hasOwnProperty.call(ids, message._id));
}

/** The selected messages in chat order (messages is oldest first). Gone ones drop out. */
function picked(messages, ids) {
    var out = [];
    for (var i = 0; messages && i < messages.length; i++) {
        if (has(ids, messages[i])) {
            out.push(messages[i]);
        }
    }
    return out;
}

module.exports = { start: start, selectable: selectable, toggle: toggle, has: has, picked: picked };
