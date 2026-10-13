/**
 * A single message bubble.
 * Ported from com.palm.app.messaging/app/conversations/ConversationItem.js.
 *
 * Beyond the plain text bubble this renders everything the transports deliver inside a message
 * body: inline images, audio/video players, attachment chips (documents, contact cards, locations,
 * events), polls, reactions and reply quotes.
 */

var kind = require('enyo/kind'),
    Image = require('enyo/Image'),
    Button = require('onyx/Button'),
    SwipeableItem = require('./widgets/SwipeableItem'),
    messagingUtils = require('../util/messagingUtils'),
    moment = require('moment'),
    $L = require('enyo/i18n').$L;

var FOLDERS = messagingUtils.message.FOLDERS;

module.exports = kind({
    name: "ConversationItem",
    kind: SwipeableItem,
    confirmCaption: $L("Delete"),
    classes: "chat-balloon",
    reactEnabled: true,

    published: {
        message: null
    },

    events: {
        onError: "",
        onSelectSender: "",
        onOpenAttachment: "",
        onInviteResponse: "",
        onReact: ""
    },

    components: [
        {
            name: "imageContainer", classes: "conversationContactImage", components: [
                { classes: "contact-image-border" },
                { name: "contactImage", kind: Image, classes: "contact-image" }
            ]
        },
        {
            name: "messageContainer", classes: "flex-one", components: [
                {
                    name: "message", components: [
                        // Sender name for incoming group/channel messages; hidden for 1:1 and
                        // outgoing messages.
                        {
                            name: "senderName", classes: "chat-sender-name", allowHtml: true,
                            showing: false, ontap: "senderTapped"
                        },
                        { name: "messageText", allowHtml: true, ontap: "messageTapped" },
                        {
                            classes: "flex-row", components: [
                                { name: "messageTime", classes: "message-time" },
                                {
                                    name: "receiptIcon", kind: Image, classes: "message-receipt",
                                    showing: false
                                },
                                {
                                    name: "errorIcon", kind: Image, src: "assets/header-warning-icon.svg",
                                    classes: "erroricon", showing: false, ontap: "showError"
                                }
                            ]
                        },
                        {
                            name: "invitationButtons", classes: "accept-decline-box", showing: false,
                            components: [
                                {
                                    name: "declineButton", kind: Button, classes: "onyx-negative",
                                    content: $L("Decline"), ontap: "declinedBuddy"
                                },
                                {
                                    name: "acceptButton", kind: Button, classes: "onyx-affirmative",
                                    content: $L("Accept"), ontap: "acceptedBuddy"
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ],

    messageChanged: function () {
        if (!this.message) {
            return;
        }
        var m = this.message;
        this.updateSenderName(m);
        this.updateMessageText(m, m.folder !== FOLDERS.OUTBOX && m.folder !== FOLDERS.INBOX);
        this.updateContactImage(m.personImage);
        this.updateSentReceived(m.folder);
        this.updateTime(m.localTimestamp);
        this.updateMessageStatus(m.status, m.errorCategory);
        this.updateDeliveryStatus(m.deliveryStatus, m.folder);
        this.updateInvite(m);
        this.updatePriority(m);
    },

    setMessage: function (message) {
        this.set('message', message);
        this.messageChanged();
    },

    // --- status ---------------------------------------------------------------------------

    /** Priorities: 0 normal, 1 interactive, 2 urgent, 3 emergency, 4 low. */
    updatePriority: function (message) {
        this.$.message.addRemoveClass("high-priority",
            !!(message.priority && (message.priority === 2 || message.priority === 3)));
    },

    updateMessageStatus: function (inStatus, errorCategory) {
        if (inStatus !== "successful") {
            this.$.message.setClasses("chat-balloon-error");
        }
        // Show/hide only — never toggle showing via re-creation. On a recycled row an ungenerated
        // node means a later show() renders nothing, and tapping the "!" would stop working.
        var failed = inStatus === messagingUtils.message.MESSAGE_STATUS.FAILED ||
            inStatus === messagingUtils.message.MESSAGE_STATUS.UNDELIVERABLE;
        this.$.errorIcon.setShowing(!!(errorCategory && failed));
    },

    /**
     * Who sent an incoming group/channel message. The transport writes the sender's display name
     * onto from.name for group messages; 1:1 IMs and outgoing messages carry no per-message sender
     * label because the conversation is already one person.
     */
    updateSenderName: function (inMessage) {
        var isIncoming = inMessage.folder === FOLDERS.INBOX;
        var isGroup = !!(inMessage.channelName || inMessage.chatType === "groupchat");
        var sender = (inMessage.from && inMessage.from.name) ? inMessage.from.name : "";

        if (isIncoming && isGroup && sender) {
            // from.name may carry astral-emoji entities from the transport: neutralise tags but keep
            // the entities so emojify() can turn them into inline images.
            var safe = String(sender).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            this.$.senderName.setContent(messagingUtils.message.emojify(safe));
            this.$.senderName.setShowing(true);
        } else {
            this.$.senderName.setShowing(false);
        }
    },

    updateContactImage: function (personImage) {
        this.$.contactImage.setAttribute("src",
            personImage || messagingUtils.person.getDisplayImage(null));
    },

    updateTime: function (localTimestamp) {
        this.$.messageTime.setContent(localTimestamp ? moment(localTimestamp).format("LT") : "");
    },

    updateSentReceived: function (inFolder) {
        if (inFolder === FOLDERS.INBOX) {
            this.$.message.setClasses("chat-balloon-received");
            this.$.imageContainer.setShowing(true);
        } else if (inFolder === FOLDERS.OUTBOX) {
            this.$.message.setClasses("chat-balloon-sent");
            this.$.imageContainer.setShowing(false);
        } else {
            this.$.message.setClasses("chat-balloon-system");
            this.$.imageContainer.setShowing(false);
        }
    },

    /**
     * Delivery/read receipt tick. Only outgoing messages get one: "delivered" shows a single check,
     * "read" a double check. The transport's receipt handler stamps deliveryStatus on the outbox
     * row. Rows are recycled, so this resets both ways.
     */
    updateDeliveryStatus: function (status, folder) {
        var isOutgoing = folder === FOLDERS.OUTBOX;
        if (isOutgoing && (status === "read" || status === "delivered")) {
            this.$.receiptIcon.setSrc(status === "read" ?
                "assets/msg-read.svg" : "assets/msg-delivered.svg");
            this.$.receiptIcon.show();
        } else {
            this.$.receiptIcon.hide();
        }
    },

    updateInvite: function (message) {
        var showInvite = message._kind === "com.palm.iminvitation:1" && message.accepted === "pending";
        this.$.invitationButtons.setShowing(showInvite);
        if (showInvite) {
            this.$.message.setClasses("chat-balloon-error");
            this.$.imageContainer.setShowing(false);
        }
    },

    // --- body rendering -------------------------------------------------------------------

    updateMessageText: function (inMessage, skipTextIndexer) {
        var raw = inMessage.messageText || "";
        var inText = raw;

        if (messagingUtils.message.isMMSMessage(inMessage)) {
            this.$.messageText.setContent(messagingUtils.message.getMMSDisplayMessage());
            return;
        }

        if (inMessage.folder === FOLDERS.INBOX) {
            // purple's strdup_withhtml stores each newline as "<br />\n" — the tag AND the literal
            // newline. Drop the newline that directly follows a break tag first, or the pass below
            // turns it into a SECOND <br> and doubles every line break.
            inText = inText.replace(/(<br\s*\/?>)[\r\n]+/gi, "$1").replace(/\r|\n|\\r|\\n/g, "<br>");
        } else if (inMessage.folder === FOLDERS.OUTBOX) {
            // Outgoing text needs sanitizing; incoming was sanitized on the way into the db.
            inText = messagingUtils.message.escapeHtml(inText);
        }

        // Media the networks deliver as URLs in the body (or a local attachment file): images
        // inline, audio/video/other as a tappable chip. The raw URL is stripped from the text so the
        // bubble reads "text + [image]" rather than "text + long-url + [image]".
        var media = this.extractMediaUrls(raw);
        var imagesHtml = "", chipsHtml = "";
        for (var i = 0; i < media.length; i++) {
            if (media[i].kind === "image") {
                imagesHtml += this.buildImageTag(media[i].url);
            } else {
                chipsHtml += this.buildAttachmentChip(media[i]);
            }
        }

        // A shared location arrives as "name\naddress\ngeo:lat,lng" text. There is no map-bubble UI,
        // but the geo: URI is parseable, so turn it into a tappable pin chip.
        var locationsHtml = "";
        var locations = this.extractLocations(raw);
        for (var li = 0; li < locations.length; li++) {
            locationsHtml += this.buildLocationChip(locations[li]);
        }

        // A shared event arrives as "name\nlocation\nevent:<base64-json>" — an "Add to Calendar" chip.
        var eventsHtml = "";
        var eventTokens = this.extractEvents(raw);
        for (var ei = 0; ei < eventTokens.length; ei++) {
            eventsHtml += this.buildEventChip(eventTokens[ei]);
        }

        // A poll arrives as a bare "poll:<base64-json>" token — a radio/checkbox list block.
        var pollsHtml = "";
        var pollTokens = this.extractPolls(raw);
        for (var pi = 0; pi < pollTokens.length; pi++) {
            pollsHtml += this.buildPollBlock(pollTokens[pi], inMessage);
        }

        // An outgoing message can carry a local file path (the file just sent). Images preview
        // inline, mirroring received images; other files show as a chip.
        var localAttachmentHtml = "";
        if (inMessage.filePath) {
            if (this.isImagePath(inMessage.filePath)) {
                localAttachmentHtml = this.buildLocalImageHtml(inMessage.filePath);
            } else {
                localAttachmentHtml = this.buildAttachmentChip({
                    url: inMessage.filePath,
                    kind: this.mediaKind(inMessage.filePath),
                    name: this.mediaName(inMessage.filePath)
                });
            }
        }

        // Pure-media message (the body was only media URLs): show just the media, no text line.
        if (media.length > 0 && this.isOnlyMedia(raw)) {
            this.$.messageText.setContent(this.buildQuote(inMessage) + imagesHtml + chipsHtml +
                localAttachmentHtml + this.buildReactions(inMessage));
            return;
        }

        // Drop the matched media URLs and any geo:/event:/poll: token from the displayed text —
        // they are now rendered as an image/chip/block below.
        inText = inText.replace(this.mediaUrlRe(), "").replace(this.geoUrlRe(), "")
            .replace(this.eventUrlRe(), "").replace(this.pollUrlRe(), "")
            .replace(/(?:\s|<br>)+$/g, "");

        if (!skipTextIndexer) {
            inText = this.linkifyPreservingUrls(inText);
        }

        // Media on top, caption below it. .message-image is display:block, so the caption flows onto
        // the next line with no separator. The caption often keeps a LEADING <br> where the stripped
        // media URL sat, so strip that to avoid a blank line between image and caption.
        var mediaHtml = imagesHtml + chipsHtml + locationsHtml + eventsHtml + pollsHtml +
            localAttachmentHtml;
        if (mediaHtml) {
            // The break can be <br>, <br/> or <br /> — match all spellings.
            inText = inText.replace(/^(?:\s|<br\s*\/?>)+/i, "");
            inText = (mediaHtml + inText).replace(/^(?:<br\s*\/?>)+/i, "");
        }

        // Emoji last, so it operates on the final HTML after linkification.
        this.$.messageText.setContent(this.buildQuote(inMessage) +
            messagingUtils.message.emojify(inText) + this.buildReactions(inMessage));
    },

    /**
     * Render a structured quoted-original as an inline card above the reply body, instead of the raw
     * "> ..." the networks fold into the text. quotedText/quotedFrom/quotedMessageId are set on the
     * message row by the transport from each network's native reply metadata.
     */
    buildQuote: function (inMessage) {
        var qt = inMessage && inMessage.quotedText;
        if (!qt) { return ""; }

        var safeText = messagingUtils.message.escapeHtml(String(qt)).replace(/\r|\n|\\r|\\n/g, "<br>");
        var from = inMessage.quotedFrom ?
            messagingUtils.message.escapeHtml(String(inMessage.quotedFrom)) : "";
        var idAttr = inMessage.quotedMessageId ?
            ' data-quoted-id="' + String(inMessage.quotedMessageId)
                .replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"' : '';

        return '<div class="reply-quote"' + idAttr + '>' +
            (from ? '<span class="reply-quote-from">' + from + '</span>' : '') +
            '<span class="reply-quote-text">' + messagingUtils.message.emojify(safeText) +
            '</span></div>';
    },

    /**
     * Render the message's `reactions` array as small inline badges on the bubble — one per distinct
     * emoji with a count — instead of a separate "reacted with X" message.
     */
    buildReactions: function (inMessage) {
        var rx = inMessage && inMessage.reactions;
        if (!rx || !rx.length) { return ""; }

        var counts = {}, order = [], mine = {};
        for (var i = 0; i < rx.length; i++) {
            var e = rx[i] && rx[i].emoji;
            if (!e) { continue; }
            if (counts[e] === undefined) { counts[e] = 0; order.push(e); }
            // Per-sender entries count as 1; aggregated entries carry the total directly.
            counts[e] += (rx[i].count > 0 ? rx[i].count : 1);
            // A reaction I placed: tag the badge so it is highlighted and a tap removes it.
            if (rx[i].sender === "me" || rx[i].mine) { mine[e] = true; }
        }
        if (!order.length) { return ""; }

        var html = "";
        for (var j = 0; j < order.length; j++) {
            var em = order[j];
            // data-reaction carries the exact stored emoji so a tap can toggle it; escape it for the
            // attribute so getAttribute round-trips the same string.
            var attr = String(em).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
            html += '<span class="reaction-badge' + (mine[em] ? ' reaction-mine' : '') +
                '" data-reaction="' + attr + '">' +
                messagingUtils.message.emojify(em) +
                (counts[em] > 1 ? '<span class="reaction-count">' + counts[em] + '</span>' : '') +
                '</span>';
        }
        return '<div class="message-reactions">' + html + '</div>';
    },

    // --- linkification --------------------------------------------------------------------

    _webUrlRe: function () { return /(?:https?:\/\/|www\.)[^\s<>"']+/gi; },
    _emailRe: function () { return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g; },

    /**
     * Linkify body text without letting a URL be torn apart. A long digit run inside a URL's query
     * or fragment reads as a phone number to a naive matcher, which would split the URL into a
     * half-link plus a bogus "phone" link on its own line. So pull whole web URLs out first
     * (swapping each for a digit-free placeholder), linkify what is left, then restore each URL as
     * a single anchor.
     */
    linkifyPreservingUrls: function (inText) {
        var urls = [], self = this;

        var stashed = inText.replace(this._webUrlRe(), function (m) {
            // Keep trailing sentence punctuation out of the link.
            var trail = "", mm = /[.,;:!?)\]]+$/.exec(m);
            if (mm) {
                trail = mm[0];
                m = m.slice(0, m.length - trail.length);
            }
            var idx = urls.length;
            urls.push(m);
            return "" + self._urlToken(idx) + "" + trail;
        });

        // Email addresses are safe to linkify directly — they cannot contain the sentinels.
        var indexed = stashed.replace(this._emailRe(), function (m) {
            return '<a href="mailto:' + m + '">' + m + '</a>';
        });

        return indexed.replace(/([a-j]+)/g, function (tok, letters) {
            var num = "";
            for (var k = 0; k < letters.length; k++) {
                num += String.fromCharCode(48 + (letters.charCodeAt(k) - 97));
            }
            var u = urls[parseInt(num, 10)];
            if (u === undefined) { return ""; }
            var href = (u.indexOf("www.") === 0) ? ("http://" + u) : u;
            return '<a href="' + href + '" target="_blank">' + u + '</a>';
        });
    },

    /** index -> placeholder using letters a-j for digits 0-9, so no digit survives for a matcher. */
    _urlToken: function (i) {
        var s = String(i), out = "";
        for (var k = 0; k < s.length; k++) {
            out += String.fromCharCode(97 + (s.charCodeAt(k) - 48));
        }
        return out;
    },

    // --- media extraction -----------------------------------------------------------------

    _imageExt: "jpg|jpeg|png|gif|webp|bmp|avif",
    _audioExt: "mp3|m4a|aac|ogg|oga|opus|flac|wav|wma|amr",
    _videoExt: "mp4|m4v|mov|webm|ogv|wmv|3gp|mkv|ts",
    // Documents render as a typed icon chip that opens in the associated app. A .vcf (shared contact
    // card) rides the same path but opens in Contacts.
    _docExt: "pdf|doc|docx|xls|xlsx|ppt|pptx|vcf",

    /**
     * Matches http(s)/file media URLs by extension, plus local ".data" files: WhatsApp voice notes
     * arrive as "file://<hash>.data" because the plugin does not always map the audio mimetype to an
     * extension, so those need surfacing as a chip too.
     */
    mediaUrlRe: function () {
        var exts = this._imageExt + "|" + this._audioExt + "|" + this._videoExt + "|" + this._docExt;
        return new RegExp(
            "(?:https?|file):\\/\\/[^\\s<>\"']+?\\.(?:" + exts + ")(?:\\?[^\\s<>\"']*)?" +
            "|file:\\/\\/[^\\s<>\"']+?\\.data(?:\\?[^\\s<>\"']*)?",
            "gi");
    },

    extractMediaUrls: function (text) {
        var re = this.mediaUrlRe(), urls = [], seen = {}, m;
        while ((m = re.exec(text)) !== null) {
            var url = m[0].replace(/&amp;/g, "&");
            if (seen[url]) { continue; }
            seen[url] = true;
            urls.push({ url: url, kind: this.mediaKind(url), name: this.mediaName(url) });
        }
        return urls;
    },

    geoUrlRe: function () { return /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/gi; },

    extractLocations: function (text) {
        var re = this.geoUrlRe(), locations = [], m;
        while ((m = re.exec(text)) !== null) {
            locations.push({ lat: m[1], lng: m[2] });
        }
        return locations;
    },

    /** A tappable location pin chip; data-open carries "lat,lng" for the Maps app. */
    buildLocationChip: function (loc) {
        return '<div class="msg-attachment" data-open="' + loc.lat + ',' + loc.lng +
            '" data-kind="location">' +
            '<div class="msg-attachment-icon msg-attachment-location"></div>' +
            '<div class="msg-attachment-name">' + $L("View location") + '</div></div>';
    },

    pollUrlRe: function () { return /poll:([A-Za-z0-9_-]+)/g; },

    extractPolls: function (text) {
        var re = this.pollUrlRe(), tokens = [], m;
        while ((m = re.exec(text)) !== null) { tokens.push(m[1]); }
        return tokens;
    },

    /**
     * Decode a "poll:" token into a real, tappable radio/checkbox list (max === 1 means single
     * select). Each row carries data-poll-option and data-poll-max so a tap can be acted on without
     * re-decoding the token. Checked state comes from message.myPollVote — the local optimistic
     * selection — rather than the static token, so it survives a row re-render.
     */
    buildPollBlock: function (token, inMessage) {
        var payload;
        try {
            var b64 = token.replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4) { b64 += "="; }
            payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
        } catch (e) {
            return "";
        }
        if (!payload || !payload.options || !payload.options.length) { return ""; }

        var max = payload.max || 0;
        var type = (max === 1) ? "radio" : "checkbox";
        var mine = (inMessage && inMessage.myPollVote && inMessage.myPollVote.length) ?
            inMessage.myPollVote : [];
        var rows = "";

        for (var i = 0; i < payload.options.length; i++) {
            var raw = String(payload.options[i]);
            var checked = (mine.indexOf(raw) >= 0);
            var opt = messagingUtils.message.emojify(messagingUtils.message.escapeHtml(raw));
            var optAttr = raw.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
            rows += '<label class="msg-poll-option' + (checked ? ' msg-poll-option-checked' : '') +
                '" data-poll-option="' + optAttr + '" data-poll-max="' + max + '">' +
                '<input type="' + type + '"' + (checked ? ' checked' : '') + '/><span>' + opt +
                '</span></label>';
        }

        var footer;
        if (max === 1) { footer = $L("Select one"); }
        else if (max > 1) { footer = $L("Select up to") + " " + max; }
        else { footer = $L("Select one or more"); }

        var question = messagingUtils.message.emojify(
            messagingUtils.message.escapeHtml(String(payload.name || "")));

        return '<div class="msg-poll"><div class="msg-poll-question">' + question + '</div>' +
            rows + '<div class="msg-poll-footer">' + footer + '</div></div>';
    },

    eventUrlRe: function () { return /event:([A-Za-z0-9_-]+)/g; },

    /** Tokens are decoded lazily so a malformed one cannot throw mid-render. */
    extractEvents: function (text) {
        var re = this.eventUrlRe(), tokens = [], m;
        while ((m = re.exec(text)) !== null) { tokens.push(m[1]); }
        return tokens;
    },

    buildEventChip: function (token) {
        return '<div class="msg-attachment" data-open="' + token + '" data-kind="event">' +
            '<div class="msg-attachment-icon msg-attachment-event"></div>' +
            '<div class="msg-attachment-name">' + $L("Add to Calendar") + '</div></div>';
    },

    /** True when the body is only media URLs plus whitespace, i.e. a pure media message. */
    isOnlyMedia: function (text) {
        return text.replace(this.mediaUrlRe(), "").replace(/\s|<br>|\\r|\\n|\r|\n/g, "") === "";
    },

    mediaKind: function (url) {
        var ext = this.urlExt(url).toLowerCase();
        // WhatsApp voice notes come through with an unmapped ".data" extension; treat as audio so
        // they get the play-icon chip.
        if (ext === "data") { return "audio"; }
        if (new RegExp("^(?:" + this._imageExt + ")$", "i").test(ext)) { return "image"; }
        if (new RegExp("^(?:" + this._audioExt + ")$", "i").test(ext)) { return "audio"; }
        if (new RegExp("^(?:" + this._videoExt + ")$", "i").test(ext)) { return "video"; }
        if (ext === "pdf") { return "pdf"; }
        if (ext === "doc" || ext === "docx") { return "doc"; }
        if (ext === "xls" || ext === "xlsx") { return "xls"; }
        if (ext === "ppt" || ext === "pptx") { return "ppt"; }
        if (ext === "vcf") { return "contact"; }
        return "file";
    },

    urlExt: function (url) {
        var p = String(url).split("?")[0].split("#")[0];
        var dot = p.lastIndexOf(".");
        return dot >= 0 ? p.substring(dot + 1) : "";
    },

    /** Human filename for a chip label: the last path segment, URL-decoded. */
    mediaName: function (url) {
        var p = String(url).split("?")[0].split("#")[0];
        var slash = p.lastIndexOf("/");
        var name = slash >= 0 ? p.substring(slash + 1) : p;
        try { name = decodeURIComponent(name); } catch (e) {}

        // A shared contact card is always named by content hash, so the plugin rides the real
        // display name along as a "?name=" query param instead.
        if (/\.vcf$/i.test(name)) {
            var qm = /[?&]name=([^&]*)/.exec(String(url));
            if (qm) {
                try { return decodeURIComponent(qm[1].replace(/\+/g, " ")); } catch (e) {}
            }
            return $L("Contact card");
        }

        // A bare "<hash>.<ext>" attachment has no meaningful name, so label it by kind. A named file
        // is not pure-hash and falls through to show its real name.
        if (/^[0-9a-f]{16,}\.[a-z0-9]+$/i.test(name)) {
            if (/\.(mp4|3gp|3gpp|mov|m4v|webm|mkv|avi)$/i.test(name)) { return $L("Video"); }
            if (/\.(ogg|opus|mp3|m4a|aac|amr|wav|data)$/i.test(name)) { return $L("Voice message"); }
            if (/\.pdf$/i.test(name)) { return $L("PDF document"); }
            if (/\.docx?$/i.test(name)) { return $L("Word document"); }
            if (/\.xlsx?$/i.test(name)) { return $L("Excel spreadsheet"); }
            if (/\.pptx?$/i.test(name)) { return $L("PowerPoint presentation"); }
            return $L("Attachment");
        }

        if (/\.data$/i.test(name)) { return $L("Voice message"); }
        if (!name) { return $L("Attachment"); }

        // Cap long names so the chip stays tidy, keeping the extension.
        if (name.length > 28) {
            var dot = name.lastIndexOf(".");
            var ext = (dot > 0 && name.length - dot <= 6) ? name.substring(dot) : "";
            name = name.substring(0, 25 - ext.length) + "…" + ext;
        }
        return name;
    },

    // --- media markup ---------------------------------------------------------------------

    buildImageTag: function (url) {
        var u = url.replace(/"/g, "%22");
        var onload = ' onload="window.__messagingImageLoaded&&window.__messagingImageLoaded(this)"';
        var sz = this.imageSizeStyle(u);

        if (u.indexOf("file://") === 0) {
            // data-open/data-kind make a tap open the image in the Photos app.
            return '<br><img class="message-image" src="' + u + '"' + sz + onload +
                ' data-open="' + u + '" data-kind="image"/>';
        }
        return '<br><a href="' + u + '" target="_blank"><img class="message-image" src="' + u +
            '"' + sz + onload + '/></a>';
    },

    /**
     * Inline px size for an image whose real dimensions were already measured this session. Baking
     * it into the row markup makes the row measure at the PAINTED height rather than old WebKit's
     * phantom aspect-ratio height, so the layout settles immediately with no jitter or gap.
     */
    imageSizeStyle: function (u) {
        try {
            var d = messagingUtils.message._imgDims && messagingUtils.message._imgDims[u];
            if (d && d.w > 0 && d.h > 0) {
                return ' style="width:' + d.w + 'px;height:' + d.h + 'px"';
            }
        } catch (e) {}
        return '';
    },

    buildAttachmentChip: function (item) {
        var open = (/^(?:https?|file):/i.test(item.url)) ? item.url : ("file://" + item.url);
        var openAttr = open.replace(/&/g, "&amp;").replace(/"/g, "%22");
        var name = messagingUtils.message.escapeHtml(item.name);

        if (item.kind === "video") {
            var vext = this.urlExt(item.url).toLowerCase();
            var vtype = /^(?:webm|mkv)$/.test(vext) ? "video/webm"
                : /^(?:3gp|3gpp)$/.test(vext) ? "video/3gpp"
                : /^(?:mov)$/.test(vext) ? "video/quicktime"
                : "video/mp4";
            // First-view preview: the plugin drops the sender's embedded JPEG thumbnail next to a
            // local video as "<base>.jpg". poster= loads it as a plain image, independent of the
            // clip's own data, so preload="none" stays crash-safe. If the .jpg is absent WebKit
            // simply shows no poster.
            var poster = (/^file:/i.test(openAttr) && vext) ?
                openAttr.slice(0, -vext.length) + "jpg" : "";

            return '<div class="msg-video-player" data-video-toggle="1" data-open="' + openAttr + '">' +
                '<video class="msg-video" preload="none"' + (poster ? ' poster="' + poster + '"' : '') +
                ' onended="window.__messagingVideoEnded&&window.__messagingVideoEnded(this)">' +
                '<source src="' + openAttr + '" type="' + vtype + '"></source>' +
                '</video><div class="msg-video-btn"></div></div>';
        }

        if (item.kind === "audio") {
            // WebKit will not load a bare src it cannot type: a WhatsApp voice note is
            // "file://<hash>.data" with no mapped extension, so there is no MIME to infer and it is
            // never handed to the media server. An explicit <source type> fixes that — WebKit trusts
            // the declared type and the media server typefinds the real codec regardless of the
            // filename. The declared type must be one WebKit's own gate accepts, which is why an
            // AAC-in-MP4 note is declared audio/aac rather than audio/mp4.
            var aext = this.urlExt(item.url).toLowerCase();
            var atype = /^(?:ogg|oga|opus|data)$/.test(aext) ? "audio/ogg"
                : /^(?:mp3)$/.test(aext) ? "audio/mpeg"
                : /^(?:m4a|aac|mp4)$/.test(aext) ? "audio/aac"
                : /^(?:wav)$/.test(aext) ? "audio/wav" : "audio/ogg";

            return '<div class="msg-audio-player">' +
                '<div class="msg-audio-btn" data-audio-toggle="1"></div>' +
                '<div class="msg-audio-body">' +
                '<div class="msg-audio-track"><div class="msg-audio-fill"></div></div>' +
                '<div class="msg-audio-time">0:00</div>' +
                '</div>' +
                // preload="none" like the video player: "metadata" spawns a media-pipeline process
                // per voice note on render, so a thread with several of them exhausts fds and
                // crashes the pipeline. The duration fills in on first play instead.
                '<audio class="msg-audio" preload="none"' +
                ' onloadedmetadata="window.__messagingAudioMeta&&window.__messagingAudioMeta(this)"' +
                ' ontimeupdate="window.__messagingAudioTime&&window.__messagingAudioTime(this)"' +
                ' onended="window.__messagingAudioEnded&&window.__messagingAudioEnded(this)">' +
                '<source src="' + openAttr + '" type="' + atype + '"></source>' +
                '</audio></div>';
        }

        return '<div class="msg-attachment" data-open="' + openAttr + '" data-kind="' + item.kind + '">' +
            '<div class="msg-attachment-icon msg-attachment-' + item.kind + '"></div>' +
            '<div class="msg-attachment-name">' + name + '</div></div>';
    },

    isImagePath: function (path) {
        return new RegExp("\\.(?:" + this._imageExt + ")$", "i").test(path || "");
    },

    buildLocalImageHtml: function (path) {
        var url = (path.indexOf("file://") === 0) ? path : ("file://" + path);
        url = url.replace(/"/g, "%22");
        return '<br><img class="message-image" src="' + url + '"' + this.imageSizeStyle(url) +
            ' onload="window.__messagingImageLoaded&&window.__messagingImageLoaded(this)"' +
            ' data-open="' + url + '" data-kind="image"/>';
    },

    // --- taps ------------------------------------------------------------------------------

    /**
     * Tap on the message body. If an attachment chip or a link was hit, open its target through the
     * system handler and swallow the tap — crucially cancelling the native navigation, because
     * letting the webview follow a file:// link (especially a binary attachment) loads it inside the
     * app card and crashes the window manager. Plain-text taps bubble through so the list's own
     * context menu still works.
     */
    messageTapped: function (inSender, inEvent) {
        var node = inEvent && (inEvent.target || (inEvent.domEvent && inEvent.domEvent.target));
        var root = this.hasNode();

        while (node && node !== root) {
            if (node.getAttribute) {
                // Inline video: mp4-family plays fullscreen in the stock player, since the media
                // server handles those. WebM/MKV plays inline — the media server cannot decode them
                // and there is no working fullscreen API in this webview.
                if (node.getAttribute("data-video-toggle")) {
                    var vtarget = node.getAttribute("data-open");
                    if (vtarget && /^(?:mp4|m4v|mov|3gp|avi)$/i.test(this.urlExt(vtarget))) {
                        this.cancelNativeNavigation(inEvent);
                        this.doOpenAttachment({
                            target: vtarget.replace(/&amp;/g, "&"), kind: "video"
                        });
                        return true;
                    }
                    this.toggleVideo(node);
                    return true;
                }

                if (node.getAttribute("data-audio-toggle")) {
                    this.toggleAudio(node);
                    return true;
                }

                var name = (node.nodeName || node.tagName || "").toUpperCase();
                var target = node.getAttribute("data-open") ||
                    (name === "A" ? node.getAttribute("href") : null);
                if (target) {
                    this.cancelNativeNavigation(inEvent);
                    var kind = node.getAttribute("data-kind") || this.mediaKind(target);
                    this.doOpenAttachment({ target: target.replace(/&amp;/g, "&"), kind: kind });
                    return true;
                }
            }
            node = node.parentNode;
        }
        return false;
    },

    cancelNativeNavigation: function (inEvent) {
        var de = (inEvent && inEvent.preventDefault) ? inEvent : (inEvent && inEvent.domEvent);
        if (de && de.preventDefault) {
            de.preventDefault();
        }
    },

    toggleVideo: function (node) {
        var video = node.getElementsByTagName ? node.getElementsByTagName("video")[0] : null;
        if (!video) { return; }

        if (video.paused) {
            // Replay from the start if it had finished; the position is left at the end.
            if (video.ended || (video.duration && video.currentTime >= video.duration - 0.15)) {
                try { video.currentTime = 0; } catch (e) {}
            }
            try { video.play(); } catch (e) {}
            node.className = "msg-video-player playing";
        } else {
            try { video.pause(); } catch (e) {}
            node.className = "msg-video-player";
        }
    },

    toggleAudio: function (node) {
        var box = node.parentNode;
        var audio = (box && box.getElementsByTagName) ? box.getElementsByTagName("audio")[0] : null;
        if (!audio) { return; }

        if (audio.paused) {
            if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.15)) {
                try { audio.currentTime = 0; } catch (e) {}
            }
            audio.play();
            node.className = "msg-audio-btn playing";
        } else {
            audio.pause();
            node.className = "msg-audio-btn";
        }
    },

    showError: function (inSender, inEvent) {
        this.doError({ message: this.message });
        return true;
    },

    /**
     * Tapping the sender name on a group message opens a 1:1 with that person. Bubble it up to the
     * list and return true so the normal message tap does not also fire.
     */
    senderTapped: function (inSender, inEvent) {
        this.doSelectSender({ index: this.index, message: this.message });
        return true;
    },

    acceptedBuddy: function () {
        this.doInviteResponse({ message: this.message, accepted: true });
        return true;
    },

    declinedBuddy: function () {
        this.doInviteResponse({ message: this.message, accepted: false });
        return true;
    }
});
