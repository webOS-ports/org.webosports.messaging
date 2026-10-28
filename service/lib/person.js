/* person.js - finding the contact behind an address, and what to call it.
 *
 * The contacts framework's Person.findByIM / findByPhone, as db8 queries on com.palm.person:1, so
 * the service needs no Foundations. Persons are raw db8 records.
 */
"use strict";

const { normalizeIm, imLookupValues, phoneSearchPrefix, samePhoneNumber, isTextMessage } = require("./address.js");

const PERSON_KIND = "com.palm.person:1";
const CONTACT_KIND = "com.palm.contact:1";
const BUDDY_KIND = "com.palm.imbuddystatus:1";
const LOGINSTATE_KIND = "com.palm.imloginstate:1";

// Person.generateDisplayNameFromRawPerson: the full name, else the nickname, else the
// organisation, else the first email, im or phone number.
function displayNameOf(person) {
	if (!person) { return ""; }
	const n = person.name || {};
	const full = [n.honorificPrefix, n.givenName, n.middleName, n.familyName, n.honorificSuffix]
		.map((s) => (s ? String(s).trim() : "")).filter(Boolean).join(" ");
	if (full) { return full; }
	if (person.nickname) { return String(person.nickname); }
	const org = person.organization || {};
	if (org.title && org.name) { return org.title + ", " + org.name; }
	if (org.name || org.title) { return String(org.name || org.title); }
	for (const list of [person.emails, person.ims, person.phoneNumbers]) {
		if (list && list.length && list[0].value) { return String(list[0].value); }
	}
	return "";
}

// Persons with an im matching the address, of the message's service when the im says one.
async function findByIm(db, address, serviceName) {
	const values = imLookupValues(address, serviceName);
	if (!values.length) { return []; }
	const found = await db.find({ from: PERSON_KIND, where: [{ prop: "ims.normalizedValue", op: "=", val: values }] });
	return found.filter((p) => (p.ims || []).some((im) =>
		values.indexOf(normalizeIm(im.normalizedValue || im.value || "")) !== -1 && (!im.type || !serviceName || im.type === serviceName)));
}

async function findByPhone(db, address) {
	const prefix = phoneSearchPrefix(address);
	if (!prefix) { return []; }
	const found = await db.find({ from: PERSON_KIND, where: [{ prop: "phoneNumbers.normalizedValue", op: "%", val: prefix }] });
	return found.filter((p) => (p.phoneNumbers || []).some((ph) => samePhoneNumber(ph.value, address)));
}

// Several persons share the address (the same buddy on two accounts, or a contact copied into
// another one): take the one linked to a contact of the account the message is on.
async function pickForAccount(db, persons, serviceName, username) {
	if (persons.length < 2 || !username) { return persons[0]; }
	// imloginstate has no index on serviceName; it holds one record per account, so read it whole.
	const states = await db.find({ from: LOGINSTATE_KIND }).catch(() => []);
	const own = normalizeIm(username);
	const account = states.find((s) => !s._del && s.serviceName === serviceName && normalizeIm(s.username || "") === own);
	if (!account || !account.accountId) { return persons[0]; }
	const ids = [].concat(...persons.map((p) => p.contactIds || []));
	const contacts = ids.length ? await db.get(ids) : [];
	const onAccount = new Set(contacts.filter((c) => c && c.accountId === account.accountId).map((c) => c._id));
	return persons.find((p) => (p.contactIds || []).some((id) => onAccount.has(id))) || persons[0];
}

// The buddy record links a username to its person exactly, where the normalized im of a contact
// may not match (a WhatsApp number stored with spaces in it). The transport keeps the buddy
// under its own form of the address (a WhatsApp JID) while an outgoing message may carry another
// ("+<digits>"), so every form of the address is asked for.
async function findViaBuddy(tempdb, db, address, serviceName) {
	if (!tempdb) { return undefined; }
	const forms = Array.from(new Set([String(address)].concat(imLookupValues(address, serviceName))));
	const buddies = await tempdb.find({ from: BUDDY_KIND, where: [{ prop: "username", op: "=", val: forms }] }).catch(() => []);
	const linked = buddies.find((b) => b.personId && b.serviceName === serviceName);
	if (!linked) { return undefined; }
	const [person] = await db.get([linked.personId]);
	return person && !person._del ? person : undefined;
}

// The person behind an address on a service, or undefined.
async function resolvePerson({ db, tempdb }, address, serviceName, username) {
	if (isTextMessage(serviceName) && String(address).indexOf("@") === -1) {
		const persons = await findByPhone(db, address);
		return persons[0];
	}
	const persons = await findByIm(db, address, serviceName);
	if (persons.length) { return pickForAccount(db, persons, serviceName, username); }
	return findViaBuddy(tempdb, db, address, serviceName);
}

module.exports = { PERSON_KIND, CONTACT_KIND, BUDDY_KIND, displayNameOf, findByIm, findByPhone, pickForAccount, findViaBuddy, resolvePerson };
