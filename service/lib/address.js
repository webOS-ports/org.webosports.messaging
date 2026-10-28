/* address.js - the keys a conversation is found by.
 *
 * A chatthread is matched on normalizedAddress, which the app computes too when it creates a
 * thread itself (compose, tapping a channel). The two must agree to the character, or the app and
 * the service each start their own thread for the same contact, so app/src/util/messagingUtils.js
 * has the same rules and tests/unit/service-address.test.js holds them to it.
 *
 *   phone services (sms, mms, the phone types) - a 2-6 digit shortcode as digits, otherwise the
 *     last ten digits of the number (seven at least), so +1 555 123 4567 and (555) 123-4567 meet.
 *   WhatsApp - E.164: "+<digits>". The transport sends "<digits>@s.whatsapp.net" one way and the
 *     app "+<digits>" the other, and the contacts framework stores an im as "+<digits>", so that
 *     is the only form a thread, its messages and its contact all share. "<id>@lid" stays as is.
 *   everything else - trimmed and lower case, as the contacts framework's IMAddress.normalizeIm.
 */
"use strict";

const MISSING_ADDRESS = "No Recipient";

const PHONE_SERVICES = new Set([
	"sms", "mms",
	"type_home", "type_work", "type_mobile", "type_home_fax", "type_business", "type_car",
	"type_pager", "type_work_fax", "type_sim", "type_primary", "type_other",
	"type_home2", "type_home_fax2", "type_work2", "type_business2", "type_mobile2", "type_car2",
	"type_pager2", "type_work_fax2", "type_sim2", "type_primary2", "type_other2",
]);

function isTextMessage(serviceName) {
	return serviceName === undefined || serviceName === null || serviceName === "" || PHONE_SERVICES.has(serviceName);
}

// An address as a string: a CommunicationsAddress gives its addr (or value), nothing gives "".
function addressText(address) {
	if (address && typeof address === "object") { address = address.addr || address.value || ""; }
	return address === undefined || address === null ? "" : String(address);
}

function normalizeShortcode(text) {
	const digits = String(text).replace(/\D/g, "");
	return digits.length > 1 && digits.length < 7 ? digits : false;
}

// The digits two numbers are compared on: the last ten, or "" for fewer than seven.
function subscriberNumber(text) {
	const digits = String(text).replace(/\D/g, "");
	return digits.length < 7 ? "" : digits.slice(-10);
}

function normalizeIm(text) {
	return String(text).trim().toLowerCase();
}

function normalizeWhatsApp(text) {
	let a = normalizeIm(text);
	if (a.endsWith("@s.whatsapp.net")) { a = a.slice(0, -"@s.whatsapp.net".length); }
	if (/^[0-9]+$/.test(a)) { a = "+" + a; }
	return a;
}

function normalizeAddress(address, serviceName) {
	let text = addressText(address).trim();
	if (!text) { text = MISSING_ADDRESS; }
	if (serviceName === "type_whatsapp") { return normalizeWhatsApp(text); }
	if (isTextMessage(serviceName) && text.indexOf("@") === -1) {
		const shortcode = normalizeShortcode(text);
		if (shortcode !== false) { return shortcode; }
		return subscriberNumber(text) || text;
	}
	return text.toLowerCase();
}

// The forms a contact may hold an IM address in, for the person lookup. The contacts framework
// stores normalizeIm(value); a WhatsApp number can sit there with or without its "+", or as the
// raw JID, depending on where the contact came from.
function imLookupValues(address, serviceName) {
	const text = addressText(address);
	const values = [normalizeIm(text)];
	if (serviceName === "type_whatsapp") {
		const e164 = normalizeWhatsApp(text);
		if (e164.charAt(0) === "+") {
			values.push(e164, e164.slice(1), e164.slice(1) + "@s.whatsapp.net");
		}
	}
	return Array.from(new Set(values.filter(Boolean)));
}

// The contacts framework keeps a phone number's normalizedValue as reversed parts joined by "-":
// "<extension>-<subscriber>-..." (PhoneNumber.normalizePhoneNumber). A number without an
// extension therefore starts "-<subscriber reversed>", and the last seven digits reversed are a
// prefix every way of writing the same number shares. The candidates are then checked digit by
// digit with samePhoneNumber.
function phoneSearchPrefix(text) {
	const digits = String(text).replace(/\D/g, "");
	if (digits.length < 7) { return ""; }
	return "-" + digits.slice(-7).split("").reverse().join("");
}

// True when two phone numbers are the same subscriber: their digits agree on the last ten, or on
// all of the shorter one when that has seven to ten. A national number written with its trunk
// "0" (06 12345678) against the same one with its country code (+31 6 12345678) differs in the
// tenth digit from the end, so ten digits starting with 0 are compared on the nine after it.
function samePhoneNumber(a, b) {
	const da = String(a).replace(/\D/g, "");
	const db = String(b).replace(/\D/g, "");
	const n = Math.min(10, da.length, db.length);
	if (n < 7) { return false; }
	if (da.slice(-n) === db.slice(-n)) { return true; }
	const trunk = (d) => d.length === 10 && d.charAt(0) === "0";
	return (trunk(da) || trunk(db)) && da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9);
}

// The phone number in a phone-based IM id ("<digits>@s.whatsapp.net", a Signal E.164), as
// "+<digits>", or "" for an id that has none (a WhatsApp "@lid", a Signal UUID).
function phoneFromImAddress(text, serviceName) {
	if (serviceName !== "type_whatsapp" && serviceName !== "type_signal") { return ""; }
	let s = String(text).toLowerCase();
	const at = s.indexOf("@");
	if (at !== -1) {
		if (s.substring(at) !== "@s.whatsapp.net") { return ""; }
		s = s.substring(0, at);
	}
	if (/[a-z-]/.test(s)) { return ""; }
	const digits = s.replace(/\D/g, "");
	return digits.length < 7 ? "" : "+" + digits;
}

// What a thread with no contact behind it is called: a phone number grouped for reading the way
// the app's formatAddress does it, anything else as it came.
function formatAddress(address, serviceName) {
	const text = addressText(address).trim();
	if (!text) { return MISSING_ADDRESS; }
	if (!isTextMessage(serviceName) || text.indexOf("@") !== -1) {
		const phone = phoneFromImAddress(text, serviceName);
		return phone ? formatPhoneNumber(phone) : text;
	}
	return formatPhoneNumber(text);
}

function formatPhoneNumber(text) {
	const plus = text.charAt(0) === "+";
	const d = text.replace(/\D/g, "");
	if (!d) { return text; }
	if (!plus && d.length === 10) { return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6); }
	if (!plus && d.length === 7) { return d.slice(0, 3) + "-" + d.slice(3); }
	if (!plus && d.length === 11 && d.charAt(0) === "1") {
		return "1 (" + d.slice(1, 4) + ") " + d.slice(4, 7) + "-" + d.slice(7);
	}
	// +1 is the one country code with a known subscriber length; others are shown as stored.
	if (plus && d.length === 11 && d.charAt(0) === "1") {
		return "+1 " + d.slice(1, 4) + " " + d.slice(4, 7) + " " + d.slice(7);
	}
	return text;
}

module.exports = {
	MISSING_ADDRESS, isTextMessage, addressText, normalizeAddress, normalizeIm, normalizeWhatsApp,
	normalizeShortcode, subscriberNumber, imLookupValues, phoneSearchPrefix, samePhoneNumber, formatAddress,
	formatPhoneNumber, phoneFromImAddress,
};
