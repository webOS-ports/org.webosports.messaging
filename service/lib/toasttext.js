/* toasttext.js - a message as the single line of plain text a toast shows.
 *
 * The service's copy of messagingUtils.message.getNotificationText in the app: the two do not share
 * a runtime, and service-toasttext.test.js holds them to the same answers. The service has no $L,
 * and the labels would lose their emoji here anyway, so they are written without.
 *
 * Message bodies are not text. libpurple transports store HTML, escaped; Telegram sends a photo as
 * <img src="file://...">; other transports send "file://..." with a caption on the next line, or a
 * poll:/event:/geo: token the conversation view turns into a chip.
 */
"use strict";

const message = require("./message.js");

const MMS_KIND = "com.palm.mmsmessage:1";
const MMS_TEXT = "New MMS on your phone";
const HTML_KINDS = ["com.palm.immessage.libpurple:1", "com.palm.immessage.skypem:1", "com.palm.iminvitation:1"];

const MEDIA_URL = /(?:https?|file):\/\/[^\s<>"']+?\.(jpg|jpeg|png|gif|webp|bmp|mp3|m4a|aac|ogg|oga|opus|flac|wav|amr|mp4|m4v|mov|webm|mkv|3gp|data|pdf|doc|docx|xls|xlsx|ppt|pptx)(?:\?[^\s<>"']*)?/gi;
const LOCAL_FILE = /file:\/\/[^\s<>"']+/gi;

const tidy = (text) => text.replace(/\s+/g, " ").trim();

// What the transports store emoji as: no JS runtime on the old devices kept them as UTF-8.
function decodeNumericEntities(text) {
	return text.replace(/&#(?:x([0-9a-fA-F]+)|(\d+));/g, (ent, hex, dec) => {
		const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
		return cp >= 0x2000 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : ent;
	});
}

// A toast cannot show emoji: drop them, with the joiners and variation selectors that go with them.
function plain(text) {
	return decodeNumericEntities(String(text || ""))
		.replace(/[\u{10000}-\u{10FFFF}\uD800-\uDFFF�‍︎️]/gu, "")
		.replace(/[ \t]{2,}/g, " ")
		.replace(/\s+([.,!?;:])/g, "$1")
		.trim();
}

function removeHtml(text) {
	return text.replace(/<script[^>]*>[\S\s]*?<\/script>/gim, "")
		.replace(/<\w+(\s+("[^"]*"|'[^']*'|[^>])+)?>|<\/\w+>/gi, "");
}

function unescapeText(text) {
	return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");
}

function summarizeTokens(text) {
	const kinds = [
		[/poll:[A-Za-z0-9_-]+/, "Poll"],
		[/event:[A-Za-z0-9_-]+/, "Event"],
		[/geo:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/, "Location"],
	];
	const found = kinds.find(([re]) => re.test(text));
	return found ? tidy(text.replace(found[0], "")) || found[1] : text;
}

function mediaLabel(ext) {
	if (/^(jpg|jpeg|png|gif|webp|bmp)$/.test(ext)) { return "Photo"; }
	if (/^(mp4|m4v|mov|webm|mkv|3gp)$/.test(ext)) { return "Video"; }
	if (/^(mp3|m4a|aac|ogg|oga|opus|flac|wav|amr|data)$/.test(ext)) { return "Voice message"; }
	if (/^(pdf|docx?|xlsx?|pptx?)$/.test(ext)) { return "Document received"; }
	return "Attachment";
}

function summarizeMedia(input) {
	const text = summarizeTokens(input);
	const media = text.match(new RegExp(MEDIA_URL.source, "i"));
	if (!media && !text.match(new RegExp(LOCAL_FILE.source, "i"))) { return text; }
	return tidy(text.replace(MEDIA_URL, "").replace(LOCAL_FILE, "")) ||
		mediaLabel(media ? media[1].toLowerCase() : "");
}

// "" when nothing is left to show: notificationmgr refuses a toast with an empty message, so the
// caller decides what to say instead.
function notificationText(msg) {
	if (msg && msg._kind === MMS_KIND) { return MMS_TEXT; }
	let text = message.messageText(msg);
	if (msg && HTML_KINDS.includes(msg._kind)) {
		text = removeHtml(text.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi, " $1 "));
	}
	return tidy(plain(summarizeMedia(unescapeText(text))).replace(/\r|\n|\\r|\\n/g, " "));
}

module.exports = { notificationText, plain };
