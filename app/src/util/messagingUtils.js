/**
 * Shared messaging logic, ported from com.palm.app.messaging/utilities/utils.js.
 *
 * The Mojo app hangs this off the global `enyo.messaging`; under Enyo 2 it is a plain module.
 * Namespaces and function names are kept identical so the ported views read the same as their
 * Mojo originals.
 *
 * Two Mojo dependencies do not exist under Enyo 2 and are reimplemented locally:
 *   enyo.g11n.PhoneNumber/PhoneFmt -> the phone helpers at the bottom of `utils`
 *   ContactsLib.Person             -> person.getDisplayName()
 */

var $L = require('enyo/i18n').$L;

var messaging = module.exports = {
    MAX_BOTTOM_HEIGHT_FOR_SNAP: 300,

    CONSTANTS: {
        NO_SEARCH_RESULTS: $L("No search results found.")
    },

    im: {
        availability: {
            AVAILABLE: 0,
            BUSY: 2,
            INVISIBLE: 3,
            OFFLINE: 4,
            NO_PRESENCE: 4   // used to be 6, when "none" and "offline" were distinguished
        },
        availabilityCaptions: {
            "available": $L("Available"),
            "away": $L("Busy"),
            "invisible": $L("Invisible"),
            "offline": $L("Offline")
        },
        availabilities: {
            "available": 0,
            "available-partial": 1,
            "away": 2,
            "invisible": 3,
            "offline": 4
        },
        buddyAvailabilities: {
            "6": "nopresence",
            "5": "pending",
            "4": "offline",
            "3": "invisible",
            "2": "away",
            "1": "mobile",
            "0": "available"
        },
        availabilityClasses: ["available", "available-partial", "away", "invisible", "offline"]
    },

    buddyAvailability_TRANSIENT_MESSAGES_Template: {
        "6": $L("{name} is offline"),
        "5": $L("{name} is offline"),
        "4": $L("{name} is offline"),
        "3": $L("{name} is offline"),
        "2": $L("{name} is busy"),
        "1": $L("{name} is mobile"),
        "0": $L("{name} is available")
    },

    imLoginState: {
        dbKind: "com.palm.imloginstate:1",
        TRANSPORT_STATE: {
            OFFLINE: "offline",
            LOGGING_ON: "logging-on",
            RETRIEVING_DATA: "retrieving-buddies",
            ONLINE: "online",
            LOGGING_OUT: "logging-out"
        },

        /** Collapse a set of loginStates into a single "best representation" state. */
        getAggregatedLoginState: function (loginStates) {
            if (!loginStates || !loginStates.length) {
                return undefined;   // no IM account exists
            }

            var state = {
                bestAvailability: messaging.im.availability.OFFLINE,
                identicalStates: true,
                identicalAvailabilities: true,
                identicalCustomMessages: true,
                hasOffline: false,
                hasPending: false,
                customMessage: undefined
            };
            var currState, currAvailability, currCustomMessage, i;

            // Normalize customMessage so the "identical" comparison below is meaningful.
            for (i = 0; i < loginStates.length; i++) {
                if (!loginStates[i].customMessage) {
                    loginStates[i].customMessage = "";
                }
            }

            for (i = 0; i < loginStates.length; i++) {
                var loginState = loginStates[i];
                var transportState = loginState.state;

                if (currState === undefined) {
                    currState = transportState;
                } else if (currState !== transportState) {
                    state.identicalStates = false;
                }

                if (currAvailability === undefined) {
                    currAvailability = loginState.availability;
                } else if (currAvailability !== loginState.availability) {
                    state.identicalAvailabilities = false;
                }

                if (currCustomMessage === undefined) {
                    currCustomMessage = loginState.customMessage;
                } else if (currCustomMessage !== loginState.customMessage) {
                    state.identicalCustomMessages = false;
                }

                if (transportState === this.TRANSPORT_STATE.ONLINE ||
                        transportState === this.TRANSPORT_STATE.RETRIEVING_DATA) {
                    // retrieving-buddies means the account is CONNECTED: messages already flow, it is
                    // only still syncing a (possibly huge) buddy list. Treat it as online so the
                    // indicator shows the real availability instead of sitting on "Signing in..." for
                    // minutes. Only LOGGING_ON/LOGGING_OUT count as pending.
                    if (loginState.availability < state.bestAvailability) {
                        state.bestAvailability = loginState.availability;
                    }
                } else if (transportState === this.TRANSPORT_STATE.OFFLINE) {
                    state.hasOffline = true;
                } else if (loginState.availability !== messaging.im.availability.OFFLINE) {
                    if (transportState === this.TRANSPORT_STATE.LOGGING_ON ||
                            transportState === this.TRANSPORT_STATE.LOGGING_OUT) {
                        state.hasPending = true;
                    }
                }
            }

            state.customMessage = state.identicalCustomMessages ? loginStates[0].customMessage : undefined;
            return state;
        },

        getAvailability: function (loginState) {
            return loginState.state === this.TRANSPORT_STATE.OFFLINE ?
                messaging.im.availability.OFFLINE : loginState.availability;
        },

        /**
         * What imlibpurpletransport puts in a login state's errorCode. The set is the one the
         * service itself carries - `strings /usr/sbin/imlibpurpleservice` - not a guess.
         *
         * Credentials_Not_Found is the one worth knowing: the transport's getCredentialsResult
         * treats an EMPTY stored password as "no credentials" and gives up before it ever
         * attempts a login, so the account sits offline having never tried. The validators work
         * around it by storing a non-empty sentinel.
         */
        ERRORS: {
            "AcctMgr_No_Error": "",
            "AcctMgr_Bad_Username": $L("That user name was not accepted."),
            "AcctMgr_Bad_Password": $L("That password was not accepted."),
            "AcctMgr_Bad_Authentication": $L("Sign-in was refused."),
            "AcctMgr_Credentials_Not_Found": $L("No saved sign-in. Sign in again."),
            "AcctMgr_Name_In_Use": $L("This account is signed in somewhere else."),
            "AcctMgr_Network_Error": $L("Could not reach the service."),
            "AcctMgr_Generic_Error": $L("Sign-in failed.")
        },

        /**
         * A line explaining why an account is not signed in, or "" when there is nothing to
         * explain. An unrecognised code is shown as itself rather than swallowed, so a new one
         * is still diagnosable from the screen.
         */
        getErrorMessage: function (loginState) {
            var code = loginState && loginState.errorCode;
            if (!code || code === "AcctMgr_No_Error") {
                return "";
            }
            var known = this.ERRORS[code];
            return known === undefined ? code : known;
        }
    },

    message: {
        dbKind: "com.palm.message:1",
        FOLDERS: {
            INBOX: "inbox",
            OUTBOX: "outbox",
            DRAFTS: "drafts",
            TRANSIENT: "transient",
            SYSTEM: "system"
        },
        SMS: { dbKind: "com.palm.smsmessage:1" },
        MMS: { dbKind: "com.palm.mmsmessage:1" },
        SOUND_CLASSES: {
            SYSTEM: "notification",
            VIBRATE: "vibrate",
            RINGTON: "alerts"
        },
        SOUND_PATHS: {
            SENT: "audios/sent.mp3",
            RECEIVED: "audios/received.mp3"
        },
        MESSAGE_STATUS: {
            SUCCESS: "successful",
            PENDING: "pending",
            FAILED: "failed",
            UNDELIVERABLE: "permanent-fail",
            WAITING_FOR_DATA_TO_CONNECT: "waiting-for-connection",
            DELAYED_DELIVERY: "delayed",
            RETRIEVING_CONTENT: "retrieving"
        },
        ERROR_CATEGORIES: {
            // SMS
            "unknownscaddress": $L("Unknown service center address. Contact your carrier."),
            "smsnetworkerror": $L("Could not send your message due to a network error. Try again. {networkErrorCode}"),
            "fdnrestricted": $L("Number is FDN restricted"),
            // MMS
            "mmsErrorUnspecified": $L("Unknown error while downloading the message."),
            "mmsErrorMessageTooLarge": $L("The attachment is too large."),
            "mmsErrorMessageNotFound": $L("Message not found on server."),
            "mmsErrorNetwork": $L("A network error occurred."),
            "mmsErrorExpired": $L("Message expired or not available."),
            "mmsErrorCorrupt": $L("Message is corrupt."),
            "mmsErrorBadUrl": $L("Unable to connect to MMS server."),
            "mmsErrorDbError": $L("Database failure."),
            "mmsErrorRejected": $L("Message content rejected."),
            "mmsErrorServiceNotInitialized": $L("Message transport not initialized."),
            "mmsErrorUnsupportedMessage": $L("Unknown error while sending the message."),
            "mmsErrorContentCorrupt": $L("Message content is corrupt."),
            "mmsOutOfMediaMemory": $L("Device is full. Delete files to clear space."),
            "mmsErrorServiceDenied": $L("Service not activated on network."),
            "mmsErrorSendingAddressUnresolved": $L("Invalid destination address."),
            "mmsErrorAttachmentTooLarge": $L("Attachment file size exceeds the maximum allowed."),
            // IM
            "error: unable to message a non-buddy": $L("Unable to send messages to screen names that are not in the buddy list.")
        },

        getMessageErrorFromCode: function (errorCode, messageData) {
            var template = this.ERROR_CATEGORIES[errorCode];
            if (template === undefined) {
                return messageData && messageData.status === "permanent-fail" ?
                    $L("Could not send your message.") :
                    $L("Could not send your message. Try again.");
            }
            if (messageData === undefined) {
                return template;
            }
            return template.replace(/\{(\w+)\}/g, function (match, key) {
                return messageData[key] !== undefined ? messageData[key] : match;
            });
        },

        isVisible: function (rawMessage) {
            return !(rawMessage.flags && rawMessage.flags.visible === false);
        },

        isUnread: function (rawMessage) {
            return (rawMessage.folder === "inbox" &&
                (rawMessage.flags === undefined ||
                (rawMessage.flags.read !== true && rawMessage.flags.visible !== false)));
        },

        /**
         * SMS types 0x41..0x47 indicate replacement messages. The sms service locates the message
         * being replaced and edits it in place, so the app has nothing to do for these beyond
         * leaving the unread count alone.
         */
        isReplacementMessage: function (rawMessage) {
            if (!rawMessage) {
                return false;
            }
            return (rawMessage.smsType >= 0x41 && rawMessage.smsType <= 0x47);
        },

        isMMSMessage: function (message) {
            return message ? message._kind === messaging.message.MMS.dbKind : false;
        },
        getMMSDisplayMessage: function () {
            return $L("New MMS on your phone");
        },
        isMMSThread: function (thread) {
            return thread ? thread.replyService === "mms" : false;
        },
        getMMSThreadSummary: function () {
            return $L("MMS received on phone");
        },

        getMessageText: function (rawMessage) {
            var messageText;
            if (rawMessage) {
                if (rawMessage.subject) {
                    messageText = rawMessage.subject;
                } else if (rawMessage.serviceName === "mms") {
                    // MMS keeps its body in the first text/plain attachment, not in messageText.
                    if (rawMessage.attachments) {
                        for (var i = 0; i < rawMessage.attachments.length; i++) {
                            if (rawMessage.attachments[i].mimeType === "text/plain" &&
                                    rawMessage.attachments[i].partText) {
                                messageText = rawMessage.attachments[i].partText;
                                break;
                            }
                        }
                    }
                } else {
                    messageText = rawMessage.messageText;
                }
            }
            return messageText ? messageText : "";
        },

        /** The kinds whose transports store messageText as HTML, not as plain text. */
        HTML_MESSAGE_KINDS: ["com.palm.immessage.libpurple:1", "com.palm.immessage.skypem:1",
            "com.palm.iminvitation:1"],

        /** Returns an array of CommunicationAddress objects. */
        getAddressesForThreading: function (rawMessage) {
            var addresses;
            if (rawMessage) {
                if (rawMessage.groupChatName) {
                    addresses = [{ addr: rawMessage.groupChatName }];
                } else if (rawMessage.folder === "outbox") {
                    addresses = rawMessage.to;
                } else if (rawMessage.from !== undefined) {
                    addresses = [rawMessage.from];
                }
            }
            return addresses || [];
        },

        // The escape in "<\\/script>" has to survive minification: enyo pack --production
        // inlines all the JS into index.html, and a bare script-end sequence in a string literal ends
        // the inline script element there. \/ is just / to the regex engine.
        _scriptsRe: new RegExp("<script[^>]*>([\\S\\s]*?)<\\/script>", "gim"),
        _tagsRe: new RegExp(/<\w+(\s+("[^"]*"|'[^']*'|[^>])+)?>|<\/\w+>/gi),

        /**
         * Strip tags without escaping the result, unlike the framework helper this replaces.
         * Coerces first: display names and status text reach this straight off db records, which
         * are not guaranteed to hold strings.
         */
        removeHtml: function (inHtml) {
            if (!inHtml) { return inHtml; }
            return String(inHtml).replace(messaging.message._scriptsRe, "")
                .replace(messaging.message._tagsRe, "");
        },

        /** Enyo 2 has no enyo.string.escapeHtml, so escape here. */
        escapeHtml: function (inText) {
            if (inText === undefined || inText === null) { return ""; }
            return String(inText)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        },

        unescapeText: function (inText) {
            if (!inText) { return inText; }
            return String(inText).replace(/&amp;/g, '&').replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                .replace(/&#39;/g, "'");
        },

        // --- Unicode emoji as inline images -------------------------------------------------
        // No device font covers the astral-plane emoji (U+1F300-1FAFF), so they render as tofu.
        // Substitute the bundled EmojiOne images, matching the webOS smiley look.
        _emojiBase: null,
        getEmojiBase: function () {
            var m = messaging.message;
            if (m._emojiBase === null) {
                var h = (window.location && window.location.href) || "";
                m._emojiBase = h.replace(/[?#].*$/, "").replace(/[^\/]*$/, "") + "assets/emoji/";
            }
            return m._emojiBase;
        },

        // One emoji "cluster": a flag (two regional indicators), or a base emoji (BMP symbol range
        // or astral surrogate pair) plus optional variation selector, skin-tone modifier, and
        // ZWJ-joined continuation parts.
        _emojiRe: new RegExp(
            "[\\uD83C][\\uDDE6-\\uDDFF][\\uD83C][\\uDDE6-\\uDDFF]" +
            "|(?:(?:[\\u2600-\\u27BF\\u2300-\\u23FF\\u2B00-\\u2BFF\\u2B50\\u2B55]" +
            "|[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF])" +
            "(?:\\uFE0F|\\uFE0E)?(?:[\\uD83C][\\uDFFB-\\uDFFF])?" +
            "(?:\\u200D(?:[\\u2600-\\u27BF]|[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF])(?:\\uFE0F)?(?:[\\uD83C][\\uDFFB-\\uDFFF])?)*)",
            "g"),

        /** Image key for a cluster: code points (minus variation selectors) as lowercase hex. */
        _emojiKey: function (cluster) {
            var keys = [], i = 0, cp;
            while (i < cluster.length) {
                cp = cluster.charCodeAt(i);
                if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < cluster.length) {
                    cp = (cp - 0xD800) * 0x400 + (cluster.charCodeAt(i + 1) - 0xDC00) + 0x10000;
                    i += 2;
                } else {
                    i += 1;
                }
                if (cp === 0xFE0F || cp === 0xFE0E) { continue; }
                keys.push(cp.toString(16));
            }
            return keys.join("-");
        },

        /** String.fromCodePoint replacement (old WebKit lacks it). */
        _fromCodePoint: function (cp) {
            if (cp <= 0xFFFF) { return String.fromCharCode(cp); }
            cp -= 0x10000;
            return String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        },

        /**
         * Decode numeric HTML entities in the emoji/symbol range (&#128557; / &#x1f62d;) back to
         * characters, leaving ASCII entities (&lt; etc.) intact. Transports store astral emoji as
         * numeric entities because they cannot survive the device JS runtimes as raw UTF-8.
         */
        decodeNumericEntities: function (text) {
            if (!text) { return text; }
            var m = messaging.message;
            return String(text).replace(/&#(?:x([0-9a-fA-F]+)|(\d+));/g, function (ent, hex, dec) {
                var cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
                if (cp >= 0x2000 && cp <= 0x1FFFFF) {
                    try { return m._fromCodePoint(cp); } catch (e) { return ent; }
                }
                return ent;
            });
        },

        /**
         * Replace Unicode emoji in an (already HTML-ready) string with inline <img> tags. Only call
         * this on text rendered with allowHtml:true. Unmapped emoji fall back to their original
         * character via the onerror handler, so nothing shows a broken-image icon.
         */
        emojify: function (inHtml) {
            if (!inHtml) { return inHtml; }
            var m = messaging.message;
            var base = m.getEmojiBase();
            inHtml = m.decodeNumericEntities(inHtml);
            return inHtml.replace(m._emojiRe, function (cluster) {
                var key = m._emojiKey(cluster);
                if (!key) { return cluster; }
                return '<img class="emoji" src="' + base + key + '.png" alt="' + cluster +
                    '" onerror="window.__messagingEmojiFallback&amp;&amp;window.__messagingEmojiFallback(this)">';
            });
        },

        /** Swap a missing emoji image back to its text, so unmapped emoji degrade gracefully. */
        emojiFallback: function (img) {
            try {
                var t = document.createTextNode(img.getAttribute("alt") || "");
                img.parentNode.replaceChild(t, img);
            } catch (e) {}
        },

        /**
         * Emoji-render a plain-text NAME/label (buddy/thread/server/channel name, status message).
         * Names are not HTML-sanitized and can contain <, > and &, so decode emoji entities, escape
         * the rest, THEN imageify. Use on allowHtml:true fields only.
         */
        emojifyEscaped: function (text) {
            if (!text) { return text; }
            var m = messaging.message;
            return m.emojify(m.escapeHtml(m.decodeNumericEntities(text)));
        },

        /**
         * For plain-text contexts that cannot show inline images (notification banners): drop emoji
         * entirely rather than leaving tofu or a literal "&#128557;".
         */
        stripEmojiForPlainText: function (text) {
            if (!text) { return text; }
            text = messaging.message.decodeNumericEntities(text);
            text = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
                .replace(/[\uD800-\uDFFF]/g, "")
                .replace(/[\uFFFD\u200D\uFE0E\uFE0F]/g, "");
            return text.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1")
                .replace(/^\s+|\s+$/g, "");
        },

        /**
         * A message as the single line of plain text a toast shows, or "" when nothing is left to
         * show (a toast with an empty message is refused, so the caller supplies a fallback).
         * DashboardManager.getDisplayText of the Mojo app, with one addition: an <img> keeps its
         * URL long enough to be labelled, since Telegram sends a photo as nothing but that tag.
         * service/lib/toasttext.js does the same for the service; the tests hold them together.
         */
        getNotificationText: function (rawMessage) {
            var m = messaging.message;
            if (m.isMMSMessage(rawMessage)) { return m.getMMSDisplayMessage(); }
            var text = m.getMessageText(rawMessage);
            if (rawMessage && m.HTML_MESSAGE_KINDS.indexOf(rawMessage._kind) !== -1) {
                text = m.removeHtml(text.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi, " $1 "));
            }
            text = m.stripEmojiForPlainText(m.summarizeMedia(m.unescapeText(text)));
            return (text || "").replace(/\r|\n|\\r|\\n/g, " ").replace(/\s+/g, " ")
                .replace(/^\s+|\s+$/g, "");
        },

        // --- Inline media player helpers -----------------------------------------------------
        audioFmt: function (s) {
            s = (s && isFinite(s)) ? Math.floor(s) : 0;
            var m = Math.floor(s / 60), r = s % 60;
            return m + ":" + (r < 10 ? "0" : "") + r;
        },
        audioMeta: function (a) {
            try {
                var t = a.parentNode.getElementsByClassName("msg-audio-time")[0];
                if (t) { t.innerHTML = messaging.message.audioFmt(a.duration); }
            } catch (e) {}
        },
        audioTime: function (a) {
            try {
                var p = a.parentNode, m = messaging.message,
                    f = p.getElementsByClassName("msg-audio-fill")[0],
                    t = p.getElementsByClassName("msg-audio-time")[0];
                if (f && a.duration) { f.style.width = (a.currentTime / a.duration * 100) + "%"; }
                if (t) { t.innerHTML = m.audioFmt(a.currentTime) + " / " + m.audioFmt(a.duration); }
            } catch (e) {}
        },
        audioEnded: function (a) {
            try {
                // Pause before seeking: seeking while still "playing" makes old WebKit resume and loop.
                a.pause();
                var p = a.parentNode,
                    b = p.getElementsByClassName("msg-audio-btn")[0],
                    f = p.getElementsByClassName("msg-audio-fill")[0],
                    t = p.getElementsByClassName("msg-audio-time")[0];
                if (b) { b.className = "msg-audio-btn"; }
                if (f) { f.style.width = "0%"; }
                if (t) { t.innerHTML = messaging.message.audioFmt(a.duration); }
            } catch (e) {}
        },
        videoEnded: function (a) {
            // Keep fullscreen open (if it was) but drop "playing" so the play button reappears.
            try {
                a.pause();
                var p = a.parentNode;
                if (p) {
                    p.className = (p.className.indexOf("fullscreen") >= 0) ?
                        "msg-video-player fullscreen" : "msg-video-player";
                }
            } catch (e) {}
        },

        /**
         * An inline message <img> finished loading. Old WebKit reserves the FULL aspect-ratio height
         * for an <img> that CSS max-height caps, leaving phantom empty space below the painted
         * image. Lock the element box to the real displayed size so no phantom height remains, and
         * remember it per URL so the next render emits the size directly.
         */
        imageLoaded: function (a) {
            var m = messaging.message;
            var key = "";
            try { key = (a && (a.getAttribute("data-open") || a.src)) || ""; } catch (e) {}
            try {
                var maxH = 320;   // keep in sync with .message-image max-height
                var contW = (a && a.parentNode && a.parentNode.clientWidth) || (a && a.clientWidth) || 0;
                if (a && contW > 10 && a.naturalWidth > 0 && a.naturalHeight > 0) {
                    var w = Math.min(contW, a.naturalWidth);
                    var h = w * a.naturalHeight / a.naturalWidth;
                    if (h > maxH) { h = maxH; w = h * a.naturalWidth / a.naturalHeight; }
                    w = Math.round(w); h = Math.round(h);
                    a.style.width = w + "px";
                    a.style.height = h + "px";
                    if (key) {
                        if (!m._imgDims) { m._imgDims = {}; }
                        m._imgDims[key] = { w: w, h: h };
                    }
                }
            } catch (e) {}
            try {
                var cl = messaging.activeConversationList;
                if (cl && cl.noteInlineImageLoaded) {
                    // Re-measure only ONCE per image URL: a re-render creates a fresh <img> whose
                    // onload fires again, which would otherwise loop and jitter the row forever.
                    if (!cl._relaidOutImages) { cl._relaidOutImages = {}; }
                    if (!key || !cl._relaidOutImages[key]) {
                        if (key) { cl._relaidOutImages[key] = true; }
                        cl.noteInlineImageLoaded();
                    }
                }
            } catch (e) {}
        },

        /**
         * Replace poll:/event:/geo: tokens with a friendly label, so thread previews and
         * notification banners do not show the raw "poll:eyJuYW1l..." token.
         */
        summarizeTokens: function (text) {
            var pollRe = /poll:[A-Za-z0-9_-]+/, eventRe = /event:[A-Za-z0-9_-]+/,
                geoRe = /geo:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/;
            var kind, re;
            if (pollRe.test(text)) { kind = "poll"; re = pollRe; }
            else if (eventRe.test(text)) { kind = "event"; re = eventRe; }
            else if (geoRe.test(text)) { kind = "location"; re = geoRe; }
            else { return text; }

            var stripped = text.replace(re, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
            if (stripped) { return stripped; }
            if (kind === "poll") { return "📊 " + $L("Poll"); }
            if (kind === "event") { return "📅 " + $L("Event"); }
            return "📍 " + $L("Location");
        },

        /**
         * Replace a bare media URL (or local attachment path) in a message body with a friendly
         * label, so previews show "Voice message" instead of a raw file:// / http URL. If there is
         * real text alongside the URL, keep the text and drop the URL. A local file of any other
         * type is an attachment too: a file:// is never something to show a person.
         */
        summarizeMedia: function (text) {
            if (!text) { return text; }
            text = messaging.message.summarizeTokens(text);
            var re = /(?:https?|file):\/\/[^\s<>"']+?\.(jpg|jpeg|png|gif|webp|bmp|mp3|m4a|aac|ogg|oga|opus|flac|wav|amr|mp4|m4v|mov|webm|mkv|3gp|data|pdf|doc|docx|xls|xlsx|ppt|pptx)(?:\?[^\s<>"']*)?/gi;
            var fileRe = /file:\/\/[^\s<>"']+/gi;
            var m = re.exec(text);
            if (!m && !fileRe.test(text)) { return text; }
            var stripped = text.replace(re, "").replace(fileRe, "").replace(/\s+/g, " ")
                .replace(/^\s+|\s+$/g, "");
            if (stripped) { return stripped; }
            var ext = m ? m[1].toLowerCase() : "";
            if (/^(jpg|jpeg|png|gif|webp|bmp)$/.test(ext)) { return "📷 " + $L("Photo"); }
            if (/^(mp4|m4v|mov|webm|mkv|3gp)$/.test(ext)) { return "🎥 " + $L("Video"); }
            if (/^(mp3|m4a|aac|ogg|oga|opus|flac|wav|amr|data)$/.test(ext)) { return "🎤 " + $L("Voice message"); }
            if (/^(pdf|docx?|xlsx?|pptx?)$/.test(ext)) { return "📄 " + $L("Document received"); }
            return "📎 " + $L("Attachment");
        }
    },

    person: {
        /** Drawn when a person has no photo, or the photo cannot be read. */
        DEFAULT_IMAGE: "assets/list-avatar-default.svg",

        /** Attributes selected when reading a person from db8. */
        selectAttributes: ["_id", "_kind", "favorite", "contactIds", "name", "names", "nickname",
            "organization", "emails", "phoneNumbers", "ims", "photos.squarePhotoPath"],

        /**
         * ContactsLib.Person().generateDisplayName() replacement: assemble a display name from the
         * person record, preferring a full name, then nickname, then organization, then the first
         * usable address.
         */
        getDisplayName: function (person) {
            if (!person) { return ""; }
            if (person.displayName) { return person.displayName; }

            var name = person.name || (person.names && person.names[0]);
            if (name) {
                var parts = [name.honorificPrefix, name.givenName, name.middleName,
                    name.familyName, name.honorificSuffix];
                var assembled = [];
                for (var i = 0; i < parts.length; i++) {
                    if (parts[i]) { assembled.push(parts[i]); }
                }
                if (assembled.length) { return assembled.join(" "); }
            }
            if (person.nickname) { return person.nickname; }
            if (person.organization && person.organization.name) { return person.organization.name; }

            var fallback = this.getDisplayNameFromAccounts(person.ims) ||
                this.getDisplayNameFromAccounts(person.phoneNumbers) ||
                this.getDisplayNameFromAccounts(person.emails);
            return fallback || "";
        },

        isNotBlank: function (str) {
            return !!(str && str.length > 0);
        },

        getDisplayNameFromAccounts: function (accnts) {
            if (accnts && accnts.length > 0 && accnts[0].value) {
                return accnts[0].value;
            }
            return "";
        },

        /**
         * Path to the person's avatar, or the default silhouette. Mojo re-requested a missing photo
         * through com.palm.service.contacts/refetchPhoto; that is done by the caller here since this
         * module stays free of service plumbing.
         */
        getDisplayImage: function (inPerson) {
            if (inPerson && inPerson.photos && inPerson.photos.squarePhotoPath) {
                return inPerson.photos.squarePhotoPath;
            }
            return messaging.person.DEFAULT_IMAGE;
        },

        /**
         * An avatar <img> that failed to load. The photo paths come from the transports' own
         * caches, so the file can be gone, half-written, or unreadable to the app - libpurple
         * writes its buddy icons 0600 root, and the app runs as another user - and the browser
         * then draws its broken-image glyph in the middle of the row. Fall back to the
         * silhouette, once, so a silhouette that is itself missing cannot loop.
         */
        avatarFailed: function (img) {
            if (img && img.getAttribute("src") !== messaging.person.DEFAULT_IMAGE) {
                img.setAttribute("src", messaging.person.DEFAULT_IMAGE);
            }
        },

        hasMessagingAccounts: function (person) {
            return !!(person && person.ims && person.ims.length > 0);
        },

        hasSMSAccounts: function (person) {
            return !!(person && person.phoneNumbers && person.phoneNumbers.length > 0);
        }
    },

    thread: {
        dbKind: "com.palm.chatthread:1",

        /**
         * Updates a raw chatthread to reflect a newly added message. Returns the updated record;
         * persisting it is the caller's job (the Enyo 2 app goes through ThreadModel/db8Source
         * rather than Mojo's enyo.DbService).
         */
        updateFromNewMessage: function (rawChatThread, rawMessage, addressObj) {
            // Ignore messages that should not change the chatthread: invisible ones, or ones in a
            // folder other than inbox/outbox.
            if (!rawMessage || (rawMessage.folder !== "outbox" && rawMessage.folder !== "inbox") ||
                    !messaging.message.isVisible(rawMessage)) {
                return rawChatThread;
            }

            if (rawChatThread) {
                if (!rawChatThread.flags) { rawChatThread.flags = {}; }
                rawChatThread.flags.outgoing = (rawMessage.folder === "outbox");
                rawChatThread.flags.visible = true;
            } else {
                rawChatThread = {
                    _kind: this.dbKind,
                    unreadCount: 0,
                    flags: { outgoing: (rawMessage.folder === "outbox") }
                };
            }

            rawChatThread.timestamp = rawMessage.localTimestamp || Date.now();
            rawChatThread.summary = messaging.message.getMessageText(rawMessage);
            rawChatThread.replyService = rawMessage.serviceName;

            if (!addressObj) {
                var addressList = messaging.message.getAddressesForThreading(rawMessage);
                var address = (addressList && addressList[0]) ?
                    addressList[0].addr : messaging.utils.kMissingAddress;
                addressObj = {
                    addr: address,
                    normalizedAddress: messaging.utils.normalizeAddress(address, rawMessage.serviceName)
                };
            }
            if (!addressObj.normalizedAddress) {
                addressObj.normalizedAddress =
                    messaging.utils.normalizeAddress(addressObj.addr, rawMessage.serviceName);
            }

            rawChatThread.replyAddress = addressObj.addr;
            rawChatThread.normalizedAddress = addressObj.normalizedAddress;

            if (messaging.message.isUnread(rawMessage)) {
                // Replacement messages edit an existing message in place, so they must not bump the
                // unread count.
                if (!messaging.message.isReplacementMessage(rawMessage)) {
                    rawChatThread.unreadCount = (rawChatThread.unreadCount || 0) + 1;
                }
            }

            return rawChatThread;
        }
    },

    utils: {
        phoneNumberLabels: {
            "type_mobile": $L("Mobile"),
            "type_home": $L("Home"),
            "type_home2": $L("Home 2"),
            "type_work": $L("Work"),
            "type_work2": $L("Work 2"),
            "type_main": $L("Main"),
            "type_personal_fax": $L("Fax"),
            "type_work_fax": $L("Fax"),
            "type_pager": $L("Pager"),
            "type_personal": $L("Personal"),
            "type_sim": $L("SIM"),
            "type_assistant": $L("Assistant"),
            "type_car": $L("Car"),
            "type_radio": $L("Radio"),
            "type_company": $L("Company"),
            "type_other": $L("Other")
        },

        _phoneTypeServiceNames: {
            "sms": true, "mms": true,
            "type_home": true, "type_work": true, "type_mobile": true, "type_home_fax": true,
            "type_business": true, "type_car": true, "type_pager": true, "type_work_fax": true,
            "type_sim": true, "type_primary": true, "type_other": true,
            "type_home2": true, "type_home_fax2": true, "type_work2": true, "type_business2": true,
            "type_mobile2": true, "type_car2": true, "type_pager2": true, "type_work_fax2": true,
            "type_sim2": true, "type_primary2": true, "type_other2": true
        },

        kDefaultBuddyGroup: $L("Buddies"),
        kMissingAddress: $L("No Recipient"),
        cleanPhoneNumberRegex: /[^0-9\+\*\#]*/gi,

        /** True if the service is an SMS/MMS type. */
        isTextMessage: function (serviceName) {
            return (serviceName === undefined || serviceName === "" ||
                this._phoneTypeServiceNames[serviceName] === true);
        },

        /** Formatted version of an address for display. Mainly relevant for phone numbers. */
        formatAddress: function (address, serviceName) {
            if (!address) {
                return this.kMissingAddress;
            }
            if (this.isTextMessage(serviceName) && address.indexOf("@") === -1) {
                return this.formatPhoneNumber(address);
            }
            // WhatsApp/Signal are phone-based but store a routable id (a WhatsApp JID
            // "<phone>@s.whatsapp.net", or a Signal E.164/UUID). Show the human phone number where
            // one can be recovered; otherwise leave the value untouched.
            return this.phoneFromImAddress(address, serviceName) || address;
        },

        /**
         * Recover a human-readable phone number from a phone-based IM routable id, or "" when the id
         * carries no phone (WhatsApp @lid, Signal UUID). Display only: the stored replyAddress keeps
         * the routable id so sending is unaffected.
         */
        phoneFromImAddress: function (address, serviceName) {
            if (serviceName !== "type_whatsapp" && serviceName !== "type_signal") {
                return "";
            }
            var s = String(address).toLowerCase();
            var at = s.indexOf("@");
            if (at !== -1) {
                if (s.substring(at) !== "@s.whatsapp.net") {
                    return "";   // "<id>@lid" carries no phone number
                }
                s = s.substring(0, at);
            }
            if (/[a-z\-]/.test(s)) {
                return "";   // a Signal UUID, not a phone number
            }
            var digits = s.replace(/[^0-9]/g, "");
            if (digits.length < 7) {
                return "";
            }
            return this.formatPhoneNumber("+" + digits);
        },

        normalizeAddress: function (address, serviceName) {
            if (!address) {
                address = this.kMissingAddress;
            }
            if (typeof address === "object") {
                address = address.addr || address.value || this.kMissingAddress;
            }

            var normalizedAddress = String(address).replace(/^\s*/, "").replace(/\s*$/, "");
            if (this.isTextMessage(serviceName) && normalizedAddress.indexOf("@") === -1) {
                var normalizedShortcode = this.normalizeShortcode(normalizedAddress);
                if (normalizedShortcode !== false) {
                    normalizedAddress = normalizedShortcode;
                } else {
                    normalizedAddress = this.subscriberNumber(normalizedAddress) || normalizedAddress;
                }
            } else {
                normalizedAddress = normalizedAddress.toLowerCase();
            }

            // WhatsApp: unify the address variants so an outgoing "+<phone>" and an incoming
            // "<phone>@s.whatsapp.net" (and a bare "<phone>") key the SAME conversation instead of
            // splitting it, as E.164 "+<phone>": the form the contacts framework keeps a WhatsApp
            // im in, so the thread also finds its contact. The opaque "<id>@lid" is left alone.
            // The messaging service keys threads the same way (service/lib/address.js).
            if (serviceName === "type_whatsapp") {
                var waAddr = normalizedAddress.toLowerCase();
                var waAt = waAddr.indexOf("@");
                if (waAt !== -1 && waAddr.substring(waAt) === "@s.whatsapp.net") {
                    waAddr = waAddr.substring(0, waAt);
                }
                if (/^[0-9]+$/.test(waAddr)) {
                    waAddr = "+" + waAddr;
                }
                normalizedAddress = waAddr;
            }
            return normalizedAddress;
        },

        normalizeShortcode: function (shortcode) {
            if (shortcode) {
                var normalizedShortcode = shortcode.replace(/\D*/g, "");
                // Valid for most, not all, countries.
                if (normalizedShortcode.length > 1 && normalizedShortcode.length < 7) {
                    return normalizedShortcode;
                }
            }
            return false;
        },

        isEmail: function (addr) {
            return addr ? addr.indexOf("@") !== -1 : false;
        },

        cleanPhoneNumber: function (value, type) {
            if (value && type === "phone" && !this.isEmail(value)) {
                return value.replace(messaging.utils.cleanPhoneNumberRegex, "");
            }
            return value;
        },

        /**
         * enyo.g11n.PhoneNumber.subscriberNumber replacement: the significant digits used to match
         * two numbers as the same subscriber. Country/trunk prefixes vary, so compare on the last 7+
         * digits, which is what the Mojo behaviour amounts to for threading purposes.
         */
        subscriberNumber: function (address) {
            var digits = String(address).replace(/[^0-9]/g, "");
            if (digits.length < 7) {
                return "";
            }
            return digits.slice(-10);
        },

        /**
         * enyo.g11n.PhoneFmt replacement. Enyo 2 ships no phone formatter, so group the digits in
         * the common readable shapes and otherwise return the number unchanged.
         */
        formatPhoneNumber: function (address) {
            var raw = String(address);
            var plus = raw.charAt(0) === "+";
            var digits = raw.replace(/[^0-9]/g, "");

            if (!digits) { return raw; }
            if (!plus && digits.length === 10) {
                return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
            }
            if (!plus && digits.length === 7) {
                return digits.slice(0, 3) + "-" + digits.slice(3);
            }
            if (!plus && digits.length === 11 && digits.charAt(0) === "1") {
                return "1 (" + digits.slice(1, 4) + ") " + digits.slice(4, 7) + "-" + digits.slice(7);
            }
            // +1 is the only country code with a fixed, known subscriber length (NANP, ten
            // digits), so it is the only one that can be grouped without a country-code table.
            // Grouping every international number on that assumption cut into the country code
            // instead: a Dutch +31612345678 came out as "+3 161 234 5678", which reads as a
            // different number. Anything else is shown as stored.
            if (plus && digits.length === 11 && digits.charAt(0) === "1") {
                return "+1 " + digits.slice(1, 4) + " " + digits.slice(4, 7) + " " + digits.slice(7);
            }
            return raw;
        },

        /** Join a lookup array onto a result set, as Mojo's utils.joinData did. */
        joinData: function (data, inData, inSource, inTarget, inField) {
            var lookUp = {}, i, d;
            for (i = 0; i < inData.length; i++) {
                d = inData[i];
                lookUp[d[inSource]] = d;
            }
            for (i = 0; i < data.results.length; i++) {
                d = data.results[i];
                d[inField] = lookUp[d[inTarget]];
            }
        }
    }
};

// The inline media markup rendered into message bubbles carries plain HTML event attributes, which
// can only reach globals — they run outside any Enyo control. Expose the handful of callbacks they
// need. The Mojo app reached `enyo.messaging.message.*` directly; under Enyo 2 there is no such
// global, so these thin shims stand in.
if (typeof window !== 'undefined') {
    window.__messagingEmojiFallback = function (img) { messaging.message.emojiFallback(img); };
    window.__messagingAvatarFailed = function (img) { messaging.person.avatarFailed(img); };
    window.__messagingImageLoaded = function (img) { messaging.message.imageLoaded(img); };
    window.__messagingAudioMeta = function (a) { messaging.message.audioMeta(a); };
    window.__messagingAudioTime = function (a) { messaging.message.audioTime(a); };
    window.__messagingAudioEnded = function (a) { messaging.message.audioEnded(a); };
    window.__messagingVideoEnded = function (a) { messaging.message.videoEnded(a); };
}
