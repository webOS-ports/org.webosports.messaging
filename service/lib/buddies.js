/* buddies.js - the fields of com.palm.imbuddystatus that the app's buddy list is read by.
 *
 * imlibpurpleservice writes a buddy as { accountId, username, serviceName, availability, group,
 * status } into tempdb. The buddy list (app/src/views/BuddyList.js) asks for
 *
 *   primary = true, offline = false (or either), groupAvailability % ""
 *
 * and shows the person behind it under displayName. Nothing in the transport sets those, so the
 * legacy chatthreader did it in two jobs, ported here:
 *
 *   linkNew     buddies with no displayName yet (the bydisplayname index defaults it to ""):
 *               the person with that im, its personId and display name stamped on; one with no
 *               person gets its address as its name, so the watch does not fire for it again.
 *               (chatthreader newBuddies)
 *   availabilityChanged
 *               buddies whose availabilityRevSet passed the revision handled last: for each
 *               person (or, for a buddy with none, each username on its service) the most
 *               available of its buddies, written onto all of them as personAvailability,
 *               offline and groupAvailability ("<group><availability>", lower case; every
 *               offline buddy "4", so they sort by name alone), and one buddy per
 *               groupAvailability marked primary, so a person shows once in each group it is in.
 *               (chatthreader changedAvailability, updatePersonAvailability)
 *
 * Only fields that change are written, and none of them is availability, so a run does not fire
 * the availability watch again. Writes carry no _rev: the transport merges the same records.
 */
"use strict";

const address = require("./address.js");
const person = require("./person.js");

const BUDDY_KIND = person.BUDDY_KIND;
const PERSON_KIND = person.PERSON_KIND;
const OFFLINE = 4;
const DEFAULT_GROUP = "Buddies";   // messagingUtils kDefaultBuddyGroup
const CHUNK = 100;                 // values in one "=" query

const PERSON_SELECT = ["_id", "name", "nickname", "organization", "emails", "ims", "phoneNumbers", "contactIds"];

function chunks(list, n = CHUNK) {
	const out = [];
	for (let i = 0; i < list.length; i += n) { out.push(list.slice(i, i + n)); }
	return out;
}

function availabilityOf(buddy) {
	const a = Number(buddy.availability);
	return Number.isFinite(a) ? a : OFFLINE;
}

// chatthreader getGroupAvailability: the group and the availability for an online person, the
// availability alone for an offline one, so offline buddies sort by name whatever their group.
function groupAvailability(buddy, availability) {
	if (availability < OFFLINE) {
		return (String(buddy.group || DEFAULT_GROUP) + availability).toLowerCase();
	}
	return String(availability);
}

// The buddies that make up one entry: those of the same person, or for a buddy with no person,
// those with its username on its service.
function keyOf(buddy) {
	return buddy.personId ? "p:" + buddy.personId : "u:" + buddy.serviceName + "|" + buddy.username;
}

// The fields of each buddy in the set, as they should be; only those that differ are returned.
function availabilityMerges(buddies) {
	const sets = new Map();
	for (const b of buddies) {
		const k = keyOf(b);
		if (!sets.has(k)) { sets.set(k, []); }
		sets.get(k).push(b);
	}
	const merges = [];
	for (const set of sets.values()) {
		set.sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
		const best = Math.min(OFFLINE, ...set.map(availabilityOf));
		const primaries = new Set();
		for (const b of set) {
			const ga = groupAvailability(b, best);
			const want = { primary: !primaries.has(ga), groupAvailability: ga, offline: best === OFFLINE, personAvailability: best };
			primaries.add(ga);
			const change = {};
			for (const f of Object.keys(want)) { if (b[f] !== want[f]) { change[f] = want[f]; } }
			if (Object.keys(change).length) { merges.push(Object.assign({ _id: b._id }, change)); }
		}
	}
	return merges;
}

// Every buddy that shares an entry with one of `buddies`, read back from tempdb, deleted ones
// left out.
async function siblingsOf(tempdb, buddies) {
	const personIds = new Set(), usernames = new Set(), keys = new Set();
	for (const b of buddies) {
		keys.add(keyOf(b));
		if (b.personId) { personIds.add(b.personId); } else if (b.username) { usernames.add(b.username); }
	}
	const found = new Map();
	for (const ids of chunks(Array.from(personIds))) {
		for (const b of await tempdb.find({ from: BUDDY_KIND, where: [{ prop: "personId", op: "=", val: ids }] })) { found.set(b._id, b); }
	}
	for (const names of chunks(Array.from(usernames))) {
		for (const b of await tempdb.find({ from: BUDDY_KIND, where: [{ prop: "username", op: "=", val: names }] })) { found.set(b._id, b); }
	}
	// The records as read now, plus any a query did not return (a test db, a racing delete).
	for (const b of buddies) { if (!found.has(b._id)) { found.set(b._id, b); } }
	return Array.from(found.values()).filter((b) => !b._del && keys.has(keyOf(b)));
}

async function writeAvailability(tempdb, buddies) {
	if (!buddies.length) { return 0; }
	const merges = availabilityMerges(await siblingsOf(tempdb, buddies));
	if (merges.length) { await tempdb.merge(merges); }
	return merges.length;
}

// availabilityChanged: everything with availabilityRevSet > fromRev, and the revision reached.
async function availabilityChanged({ tempdb }, fromRev) {
	const changed = (await tempdb.find({ from: BUDDY_KIND, where: [{ prop: "availabilityRevSet", op: ">", val: fromRev }] }))
		.filter((b) => !b._del);
	let rev = fromRev;
	for (const b of changed) { rev = Math.max(rev, Number(b.availabilityRevSet) || 0); }
	const updated = await writeAvailability(tempdb, changed);
	return { rev, buddies: changed.length, updated };
}

// The persons with an im that is one of the forms of a buddy's username, of the buddy's service
// (person.findByIm, for many buddies in a few queries).
async function personsByIm(db, buddies) {
	const values = new Set();
	for (const b of buddies) { for (const v of address.imLookupValues(b.username, b.serviceName)) { values.add(v); } }
	const persons = new Map();
	for (const vals of chunks(Array.from(values))) {
		const found = await db.find({ from: PERSON_KIND, select: PERSON_SELECT, where: [{ prop: "ims.normalizedValue", op: "=", val: vals }] });
		for (const p of found) { if (!p._del) { persons.set(p._id, p); } }
	}
	const byBuddy = new Map();
	for (const b of buddies) {
		const forms = address.imLookupValues(b.username, b.serviceName);
		byBuddy.set(b._id, Array.from(persons.values()).filter((p) => (p.ims || []).some((im) =>
			forms.indexOf(address.normalizeIm(im.normalizedValue || im.value || "")) !== -1 &&
			(!im.type || im.type === b.serviceName))));
	}
	return byBuddy;
}

// Several persons with the im (the same buddy on two accounts, a contact copied into another
// account): the one with a contact on the buddy's own account.
async function pickForBuddy(db, persons, buddy) {
	if (persons.length < 2 || !buddy.accountId) { return persons[0]; }
	const ids = [].concat(...persons.map((p) => p.contactIds || []));
	const contacts = ids.length ? await db.get(ids) : [];
	const onAccount = new Set(contacts.filter((c) => c && c.accountId === buddy.accountId).map((c) => c._id));
	return persons.find((p) => (p.contactIds || []).some((id) => onAccount.has(id))) || persons[0];
}

// The person behind a buddy: by im, else for a phone-numbered id (WhatsApp, Signal) by number.
async function personFor(db, buddy, byIm) {
	const persons = byIm.get(buddy._id) || [];
	if (persons.length) { return pickForBuddy(db, persons, buddy); }
	const phone = address.phoneFromImAddress(buddy.username, buddy.serviceName);
	if (!phone) { return undefined; }
	const byPhone = await person.findByPhone(db, phone);
	return pickForBuddy(db, byPhone, buddy);
}

// linkNew: every buddy with no displayName yet linked to its person and named.
async function linkNew({ db, tempdb, log = console }) {
	const fresh = (await tempdb.find({ from: BUDDY_KIND, where: [{ prop: "displayName", op: "=", val: "" }] }))
		.filter((b) => !b._del && b.username);
	if (!fresh.length) { return { buddies: 0, linked: 0, updated: 0 }; }
	const byIm = await personsByIm(db, fresh);
	const merges = [];
	let linked = 0;
	for (const b of fresh) {
		let p;
		try { p = await personFor(db, b, byIm); }
		catch (e) { log.error("buddies: looking up the person of " + b._id + " failed: " + ((e && e.message) || e)); }
		// Never "": that would leave it matching the watch, which would fire again at once.
		const name = (p && person.displayNameOf(p)) || address.formatAddress(b.username, b.serviceName) || b.username || ".";
		const change = { _id: b._id, displayName: name };
		if (p) { change.personId = p._id; linked++; }
		merges.push(change);
		Object.assign(b, change);
	}
	await tempdb.merge(merges);
	// A buddy now linked joins its person's other buddies; work out the entry they share.
	const updated = await writeAvailability(tempdb, fresh);
	return { buddies: fresh.length, linked, updated };
}

module.exports = { availabilityChanged, linkNew, availabilityMerges, groupAvailability, OFFLINE };
