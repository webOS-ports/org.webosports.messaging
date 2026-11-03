/**
 * Per-sender avatars for group chats and channels.
 *
 * A 1:1 conversation belongs to one person, so every bubble can use the thread's avatar. A group
 * chat or a server channel has no person behind it, so its bubbles need each sender's own photo,
 * found by the address the transport wrote into from.addr. Only people with a contact on this
 * device have one (for Discord: friends), so anyone else keeps the default image.
 *
 * The cache maps a "serviceName|address" key to a photo path, or to null while a lookup is on its
 * way or after it found none, so the same sender is never asked for twice.
 */

function isGroupMessage(message) {
    return !!(message && (message.channelName || message.chatType === "groupchat"));
}

function isIncoming(message) {
    return message.folder === "inbox";
}

function keyFor(serviceName, address) {
    return (serviceName || "") + "|" + address;
}

module.exports = {
    isGroupMessage: isGroupMessage,
    keyFor: keyFor,

    /**
     * Addresses of incoming group senders the cache has no answer for yet, grouped by service.
     * @returns {Object<string, string[]>} serviceName -> addresses, each listed once
     */
    addressesToLookUp: function (messages, cache) {
        var wanted = {}, seen = {};
        (messages || []).forEach(function (m) {
            var address = m && m.from && m.from.addr;
            if (!address || !isGroupMessage(m) || !isIncoming(m)) {
                return;
            }
            var key = keyFor(m.serviceName, address);
            if (seen[key] || cache.hasOwnProperty(key)) {
                return;
            }
            seen[key] = true;
            (wanted[m.serviceName || ""] = wanted[m.serviceName || ""] || []).push(address);
        });
        return wanted;
    },

    /** Note addresses as asked, so a sender is not asked for again while the answer is on its way. */
    markAsked: function (cache, wanted) {
        Object.keys(wanted || {}).forEach(function (serviceName) {
            wanted[serviceName].forEach(function (address) {
                cache[keyFor(serviceName, address)] = null;
            });
        });
    },

    /**
     * Record the photos a person lookup found. Each IM address a person has is keyed on its own
     * service (ims[].type is the serviceName), so a WhatsApp contact with the same handle does not
     * lend a Discord sender its face. Only addresses that were asked about are filled in.
     * @returns {boolean} whether any sender got a photo
     */
    remember: function (cache, persons) {
        var changed = false;
        (persons || []).forEach(function (p) {
            var path = p && p.photos && p.photos.squarePhotoPath;
            if (!path) {
                return;
            }
            (p.ims || []).forEach(function (im) {
                var key = im && im.value && keyFor(im.type, im.value);
                if (key && cache.hasOwnProperty(key) && !cache[key]) {
                    cache[key] = path;
                    changed = true;
                }
            });
        });
        return changed;
    },

    /**
     * The avatar a bubble should show: its sender's photo for an incoming group message, the
     * thread's own avatar otherwise.
     */
    imageFor: function (message, cache, threadImage, defaultImage) {
        if (!isGroupMessage(message) || !isIncoming(message)) {
            return threadImage;
        }
        var address = message.from && message.from.addr;
        var path = address ? cache[keyFor(message.serviceName, address)] : null;
        return path || defaultImage;
    }
};
