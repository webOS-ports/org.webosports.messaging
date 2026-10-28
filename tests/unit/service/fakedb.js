/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * An in-memory db8, as much of it as the messaging service relies on:
 *
 *   - kinds that extend others: a query from com.palm.message:1 sees com.palm.immessage.libpurple:1
 *   - index defaults: a message with no flags.visible matches flags.visible = true, as it does in
 *     the forChatThreading index, which declares the default
 *   - array properties: conversations = id and ims.normalizedValue = x match any element
 *   - = (with an array value: any of them), != < <= > >=, and % (string prefix)
 *   - revSets: readRevSet takes the record's new _rev whenever flags.read changes
 *   - del marks _del and keeps the record; plain queries skip it, a query on _del finds it
 *   - merge is a deep merge (objects merged, arrays and scalars replaced); a merge that carries a
 *     stale _rev is refused, as db8 refuses it
 *   - results by orderBy (or _rev), limit, and a page token
 *   - a query no index can answer is refused (-3963), as db8 refuses it: the indexes are the
 *     ones in service/configuration/db/kinds for the kinds this repo owns, and copies of the
 *     owning repo's for the others (see FOREIGN_INDEXES)
 *   - with a caller (createFakeDb({ caller })), every luna call through handle() is checked
 *     against db8's kind permissions as that caller and refused with -3963 "db: permission
 *     denied" where db8 refuses it (see permitted()); calls made directly, which is how tests
 *     set up records other components would write, are not
 *
 * calls counts every method, for the volume tests. failNext(method, n) makes the next n calls of
 * a method fail.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const OWN_KINDS = path.resolve(__dirname, "..", "..", "..", "service", "configuration", "db", "kinds");

// The indexes of a kind file in service/configuration/db/kinds, as lists of property names.
function ownIndexes(file) {
    const kind = JSON.parse(fs.readFileSync(path.join(OWN_KINDS, file), "utf8"));
    return (kind.indexes || []).map((i) => i.props.map((p) => p.name));
}

// Kinds other components own, their indexes as those components declare them:
//   com.palm.person         app-services com.palm.service.contacts.linker/db/kinds/com.palm.person
//   com.palm.imchannel, com.palm.imloginstate
//                           imlibpurpleservice files/etc/palm/db/kinds/
//   com.palm.imbuddystatus  imlibpurpleservice files/etc/palm/tempdb/kinds/
// Only the ones a query of the service could use are copied.
const FOREIGN_INDEXES = {
    "com.palm.person:1": [["contactIds"], ["imValue"], ["ims.normalizedValue", "ims.type"], ["phoneNumbers.value"],
        ["phoneNumbers.normalizedValue"]],
    "com.palm.imchannel:1": [["serverId", "position"], ["parentId", "position"], ["chatThreadId"], ["serviceName", "remoteId"],
        ["chatthreadRevSet"], ["displayNameRevSet"], ["_del", "_rev"]],
    "com.palm.imloginstate:1": [["state"], ["_rev"]],
    "com.palm.imbuddystatus:1": [["accountId", "username"], ["username", "serviceName"], ["availabilityRevSet"], ["personId"],
        ["displayName"]]
};

const OWN_PERMISSIONS = path.resolve(OWN_KINDS, "..", "permissions");

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

// The permission entries of a file in service/configuration/db/permissions.
function ownPermissions(file) { return readJson(path.join(OWN_PERMISSIONS, file)); }

function ownOwner(file) { return readJson(path.join(OWN_KINDS, file)).owner; }

// What other components grant, as their permission files declare it. Only the entries whose
// caller pattern can match a webosports service are copied.
//   com.palm.immessage, com.palm.immessage.libpurple, com.palm.imchannel, com.palm.imloginstate,
//   com.palm.imloginstate.libpurple
//                    imlibpurpleservice files/etc/palm/db/permissions/, as of the branch
//                    herrie/messaging-imchannel-update (36c357b), which grants the service
//                    update on imchannel and create/delete on immessage.libpurple
//   com.palm.imbuddystatus
//                    imlibpurpleservice files/etc/palm/tempdb/permissions/
//   com.palm.person, com.palm.contact
//                    app-services com.palm.service.contacts.linker/db/permissions/
//   com.palm.smsmessage
//                    webos-telephonyd, /etc/palm/db/permissions/com.palm.smsmessage on the VM
function grant(object, caller, ops) {
    const operations = {};
    ops.forEach((op) => { operations[op] = "allow"; });
    return { type: "db.kind", object, caller, operations };
}
const FOREIGN_PERMISSIONS = [
    grant("com.palm.immessage:1", "*", ["extend"]),
    grant("com.palm.immessage:1", "org.webosports.*", ["extend", "read"]),
    grant("com.palm.immessage.libpurple:1", "org.webosports.*", ["read", "update"]),
    grant("com.palm.immessage.libpurple:1", "org.webosports.service.messaging", ["create", "delete", "read", "update"]),
    grant("com.palm.imchannel:1", "*", ["extend"]),
    grant("com.palm.imchannel:1", "org.webosports.*", ["extend", "read"]),
    grant("com.palm.imchannel:1", "org.webosports.service.messaging", ["read", "update"]),
    grant("com.palm.imloginstate:1", "*", ["extend"]),
    grant("com.palm.imloginstate:1", "org.webosports.*", ["extend", "read"]),
    grant("com.palm.imloginstate.libpurple:1", "org.webosports.*", ["read", "update"]),
    grant("com.palm.imbuddystatus:1", "*", ["extend"]),
    grant("com.palm.imbuddystatus:1", "org.webosports.*", ["extend", "read"]),
    grant("com.palm.person:1", "org.webosports.*", ["read"]),
    grant("com.palm.contact:1", "*", ["extend"]),
    grant("com.palm.contact:1", "org.webosports.*", ["read"]),
    grant("com.palm.smsmessage:1", "org.webosports.*", ["extend", "read"]),
    grant("com.palm.smsmessage:1", "org.webosports.service.messaging", ["create", "delete", "read", "update"])
];

const PERMISSIONS = [].concat(ownPermissions("com.palm.message"), ownPermissions("com.palm.chatthread"),
    ownPermissions("com.palm.app.messagingprefs"), FOREIGN_PERMISSIONS);

const OWNERS = {
    "com.palm.message:1": ownOwner("com.palm.message"),
    "com.palm.chatthread:1": ownOwner("com.palm.chatthread"),
    "com.palm.app.messagingprefs:1": ownOwner("com.palm.app.messagingprefs")
};

// A caller pattern as db8 matches it: "*", "<prefix>.*", or the exact name.
function callerMatches(pattern, caller) {
    if (pattern === "*") { return true; }
    if (pattern.endsWith(".*")) { return caller.startsWith(pattern.slice(0, -1)); }
    return pattern === caller;
}

// Whether db8 lets `caller` do `op` (read, create, update, delete) on records of `kind`. The
// kind's owner may do anything; anyone else needs an entry for that very kind - a subkind does
// not inherit from its parent, which is how the service, owner of com.palm.message:1, was still
// refused deleting a com.palm.immessage.libpurple:1 message on the device.
function permitted(caller, kind, op) {
    if (OWNERS[kind] === caller) { return true; }
    return PERMISSIONS.some((e) => e.object === kind && callerMatches(e.caller, caller) &&
        e.operations && e.operations[op] === "allow");
}

const KINDS = {
    "com.palm.message:1": {
        indexes: ownIndexes("com.palm.message"),
        defaults: { "conversations": null, "flags.visible": true, "flags.threadingError": null, "flags.read": false },
        revSets: [{ name: "readRevSet", props: ["flags.read"] }]
    },
    "com.palm.immessage:1": { extends: "com.palm.message:1" },
    "com.palm.immessage.libpurple:1": { extends: "com.palm.immessage:1" },
    "com.palm.smsmessage:1": { extends: "com.palm.message:1" },
    "com.palm.chatthread:1": { indexes: ownIndexes("com.palm.chatthread"), defaults: { "flags.visible": true } },
    "com.palm.person:1": { indexes: FOREIGN_INDEXES["com.palm.person:1"] },
    "com.palm.contact:1": { indexes: [] },
    "com.palm.imchannel:1": { indexes: FOREIGN_INDEXES["com.palm.imchannel:1"] },
    "com.palm.imserver:1": { indexes: [] },
    "com.palm.imloginstate:1": { indexes: FOREIGN_INDEXES["com.palm.imloginstate:1"] },
    "com.palm.imloginstate.libpurple:1": { extends: "com.palm.imloginstate:1" },
    "com.palm.imbuddystatus:1": { indexes: FOREIGN_INDEXES["com.palm.imbuddystatus:1"] },
    "com.palm.app.messagingprefs:1": { indexes: ownIndexes("com.palm.app.messagingprefs") }
};

function indexesOf(kind) {
    for (let k = kind; k; k = KINDS[k] && KINDS[k].extends) {
        if (KINDS[k] && KINDS[k].indexes) { return KINDS[k].indexes; }
    }
    return [];
}

// Whether db8 could answer the query from one index. The where clauses' properties must be the
// first ones of an index: the equalities in any order, then at most one property with a range or
// prefix test. An orderBy must be that range property, or the index's next property after the
// equalities. A query with neither where nor orderBy reads the primary (_id) index.
function servable(kind, query) {
    const where = query.where || [];
    const order = query.orderBy;
    if (!where.length && !order) { return true; }
    const eq = Array.from(new Set(where.filter((c) => c.op === "=").map((c) => c.prop)));
    const range = Array.from(new Set(where.filter((c) => c.op !== "=").map((c) => c.prop)));
    if (range.length > 1 || (range.length && eq.indexOf(range[0]) !== -1)) { return false; }
    return indexesOf(kind).some((idx) => {
        const head = idx.slice(0, eq.length);
        if (head.length !== eq.length || !eq.every((p) => head.indexOf(p) !== -1)) { return false; }
        const next = idx[eq.length];
        if (range.length) { return next === range[0] && (!order || order === range[0]); }
        return !order || next === order;
    });
}

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function isA(kind, wanted) {
    for (let k = kind; k; k = KINDS[k] && KINDS[k].extends) {
        if (k === wanted) { return true; }
    }
    return false;
}

// Every value a dotted path reaches, through arrays at any level.
function values(obj, path) {
    let level = [obj];
    for (const part of path.split(".")) {
        const next = [];
        for (const v of level) {
            if (Array.isArray(v)) {
                for (const e of v) { if (e && typeof e === "object" && part in e) { next.push(e[part]); } }
            } else if (v && typeof v === "object" && part in v) {
                next.push(v[part]);
            }
        }
        level = next;
    }
    const flat = [];
    for (const v of level) { if (Array.isArray(v)) { flat.push(...v); } else { flat.push(v); } }
    return flat;
}

function defaultOf(kind, prop) {
    for (let k = kind; k; k = KINDS[k] && KINDS[k].extends) {
        const d = KINDS[k] && KINDS[k].defaults;
        if (d && Object.prototype.hasOwnProperty.call(d, prop)) { return { has: true, value: d[prop] }; }
    }
    return { has: false };
}

function propValues(record, prop) {
    const vs = values(record, prop).filter((v) => v !== undefined);
    if (vs.length) { return vs; }
    const d = defaultOf(record._kind, prop);
    return d.has ? [d.value] : [undefined];
}

function test(op, v, val) {
    const norm = (x) => (x === undefined ? null : x);
    switch (op) {
    case "=": return Array.isArray(val) ? val.some((x) => norm(x) === norm(v)) : norm(v) === norm(val);
    case "!=": return norm(v) !== norm(val);
    case "<": return v !== undefined && v !== null && v < val;
    case "<=": return v !== undefined && v !== null && v <= val;
    case ">": return v !== undefined && v !== null && v > val;
    case ">=": return v !== undefined && v !== null && v >= val;
    case "%": return typeof v === "string" && v.indexOf(val) === 0;
    default: throw new Error("fakedb: no operator " + op);
    }
}

function deepMerge(target, src) {
    for (const k of Object.keys(src)) {
        const s = src[k];
        if (s && typeof s === "object" && !Array.isArray(s) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
            deepMerge(target[k], s);
        } else {
            target[k] = clone(s);
        }
    }
    return target;
}

function dbError(code, text) {
    const e = new Error(text);
    e.errorCode = code;
    e.errorText = text;
    return e;
}

function createFakeDb({ name = "db", caller = null } = {}) {
    const records = new Map();
    const calls = { find: 0, get: 0, put: 0, merge: 0, del: 0 };
    const failing = {};
    let rev = 1000;
    let idSeq = 0;

    function failNext(method, n = 1, error = null) {
        failing[method] = { n, error: error || dbError(-3999, "fakedb: " + method + " failed") };
    }

    function enter(method) {
        calls[method]++;
        const f = failing[method];
        if (f && f.n > 0) {
            f.n--;
            throw f.error;
        }
    }

    function readBits(record) {
        const out = {};
        for (const k of [record._kind]) {
            for (let kk = k; kk; kk = KINDS[kk] && KINDS[kk].extends) {
                for (const rs of (KINDS[kk] && KINDS[kk].revSets) || []) {
                    out[rs.name] = rs.props.map((p) => JSON.stringify(values(record, p))).join("|");
                }
            }
        }
        return out;
    }

    function stamp(record, before) {
        rev++;
        record._rev = rev;
        const after = readBits(record);
        for (const name of Object.keys(after)) {
            if (!before || before[name] !== after[name]) { record[name] = rev; }
        }
    }

    function check(kind) {
        if (!KINDS[kind]) { throw dbError(-3970, "kind not registered: '" + kind + "'"); }
    }

    function store(obj) {
        if (!obj || !obj._kind) { throw dbError(-3962, "db: missing _kind"); }
        check(obj._kind);
        const record = clone(obj);
        if (!record._id) { idSeq++; record._id = name + "-" + idSeq.toString(36); }
        const old = records.get(record._id);
        delete record._del;
        stamp(record, old && !old._del ? readBits(old) : null);
        records.set(record._id, record);
        return { id: record._id, rev: record._rev };
    }

    async function put(objects) {
        enter("put");
        return objects.map(store);
    }

    async function merge(objects) {
        enter("merge");
        for (const o of objects) {
            const r = records.get(o._id);
            if (!r) { throw dbError(-3950, "db: record not found: " + o._id); }
            if (o._rev !== undefined && o._rev !== r._rev) { throw dbError(-3961, "db: revision mismatch on " + o._id); }
        }
        return objects.map((o) => {
            const r = records.get(o._id);
            const before = readBits(r);
            const patch = clone(o);
            delete patch._rev;
            delete patch._kind;
            deepMerge(r, patch);
            stamp(r, before);
            return { id: r._id, rev: r._rev };
        });
    }

    async function get(ids) {
        enter("get");
        return ids.map((id) => records.get(id)).filter(Boolean).map(clone);
    }

    async function del(ids) {
        enter("del");
        return ids.filter((id) => records.has(id)).map((id) => {
            const r = records.get(id);
            r._del = true;
            stamp(r, readBits(r));
            return { id, rev: r._rev };
        });
    }

    function matches(record, query) {
        if (!isA(record._kind, query.from)) { return false; }
        const where = query.where || [];
        const onDel = where.some((c) => c.prop === "_del");
        if (record._del && !onDel) { return false; }
        return where.every((c) => {
            if (c.prop === "_del") { return test(c.op, !!record._del, c.val); }
            return propValues(record, c.prop).some((v) => test(c.op, v, c.val));
        });
    }

    async function findPage(query) {
        enter("find");
        check(query.from);
        if (!servable(query.from, query)) { if (process.env.FAKEDB_TRACE) { process.stderr.write("REFUSED " + query.from + " " + JSON.stringify({ where: query.where, orderBy: query.orderBy }) + "\n"); }
            throw dbError(-3963, "db: no index for query on " + query.from + ": " + JSON.stringify({ where: query.where, orderBy: query.orderBy }));
        }
        const order = query.orderBy || "_rev";
        const list = Array.from(records.values()).filter((r) => matches(r, query));
        list.sort((a, b) => {
            const va = values(a, order)[0], vb = values(b, order)[0];
            if (va === vb) { return a._rev - b._rev; }
            const c = va === undefined ? -1 : vb === undefined ? 1 : (va < vb ? -1 : 1);
            return query.desc ? -c : c;
        });
        const start = query.page ? Number(query.page) : 0;
        const limit = Math.min(query.limit || 500, 500);
        const slice = list.slice(start, start + limit).map((r) => {
            if (!query.select) { return clone(r); }
            const out = { _id: r._id, _rev: r._rev };
            if (r._del) { out._del = true; }
            for (const p of query.select) { const v = values(r, p)[0]; if (v !== undefined) { out[p] = clone(r[p] !== undefined ? r[p] : v); } }
            return out;
        });
        const next = start + limit < list.length ? String(start + limit) : undefined;
        return { results: slice, next };
    }

    async function find(query, { pages = Infinity } = {}) {
        const all = [];
        let page;
        for (let n = 0; n < pages; n++) {
            const r = await findPage(Object.assign({}, query, page ? { page } : {}));
            all.push(...r.results);
            if (!r.next || (query.limit && all.length >= query.limit)) { break; }
            page = r.next;
        }
        return all;
    }

    // The same database behind luna calls, for a stand-in palmbus: luna://com.palm.db/<method>.
    // db8 checks a query against its from kind, and a write against each record's own kind (for
    // a merge or del, the kind of the record as stored).
    function authorize(method, args) {
        if (!caller) { return; }
        const deny = (kind) => {
            if (process.env.FAKEDB_TRACE) { process.stderr.write("DENIED " + method + " " + kind + "\n"); }
            throw dbError(-3963, "db: permission denied for caller '" + caller + "' on kind '" + kind + "'");
        };
        const stored = (id) => { const r = records.get(id); return r && r._kind; };
        if (method === "find") {
            if (!permitted(caller, args.query.from, "read")) { deny(args.query.from); }
            return;
        }
        const op = { get: "read", put: "create", merge: "update", del: "delete" }[method];
        if (!op) { return; }
        const kinds = method === "put" ? args.objects.map((o) => (records.has(o._id) ? stored(o._id) : o._kind))
            : method === "merge" ? args.objects.map((o) => stored(o._id))
            : args.ids.map(stored);
        const want = method === "put" ? args.objects.map((o) => (records.has(o._id) ? "update" : "create")) : kinds.map(() => op);
        kinds.forEach((kind, i) => { if (kind && !permitted(caller, kind, want[i])) { deny(kind); } });
    }

    async function handle(method, args) {
        try {
            authorize(method, args);
            switch (method) {
            case "find": { const r = await findPage(args.query); return Object.assign({ returnValue: true, results: r.results }, r.next ? { next: r.next } : {}); }
            case "get": return { returnValue: true, results: await get(args.ids) };
            case "put": return { returnValue: true, results: await put(args.objects) };
            case "merge": return { returnValue: true, results: await merge(args.objects) };
            case "del": return { returnValue: true, results: await del(args.ids) };
            default: return { returnValue: false, errorCode: -1, errorText: "fakedb: no method " + method };
            }
        } catch (e) {
            return { returnValue: false, errorCode: e.errorCode || -1, errorText: e.errorText || e.message };
        }
    }

    // Direct access for tests: every live record of a kind (subkinds included).
    function all(kind, { deleted = false } = {}) {
        return Array.from(records.values()).filter((r) => isA(r._kind, kind) && (deleted || !r._del)).map(clone);
    }

    function resetCalls() { for (const k of Object.keys(calls)) { calls[k] = 0; } }

    return { put, merge, get, del, find, findPage, handle, all, calls, resetCalls, failNext, records };
}

module.exports = { createFakeDb, KINDS, permitted };
