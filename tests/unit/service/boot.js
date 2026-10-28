/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * service/service.js started on a stand-in bus, with db8, tempdb, activitymanager, the
 * notification service and the application manager behind it.
 *
 *   boot({ running, completeFails, now }) -> { db, tempdb, am, toasts, handle, service }
 *
 * running: the app is running. completeFails: activitymanager refuses complete.
 */

"use strict";

var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');

var { createFakeDb } = require('./fakedb');
var { fakePalmbus } = require('./palmbus');

var SERVICE = path.resolve(__dirname, '..', '..', '..', 'service');
var service = require(SERVICE);

var quiet = { log: function () {}, error: function () {} };
var stateDir = null;
var nState = 0;

// The state files go in one directory for the process, removed when it exits.
function stateFile() {
    if (!stateDir) {
        stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'messaging-service-test-'));
        process.on('exit', function () { fs.rmSync(stateDir, { recursive: true, force: true }); });
    }
    return path.join(stateDir, 'state-' + (++nState) + '.json');
}

function boot(opts) {
    opts = opts || {};
    // Every call the service makes is checked against db8's permissions for its name.
    var db = createFakeDb({ caller: "org.webosports.service.messaging" });
    var tempdb = createFakeDb({ name: "tmp", caller: "org.webosports.service.messaging" });
    var am = [], toasts = [];
    var pb = fakePalmbus(async function (uri, args) {
        var m = /^luna:\/\/([^/]+)\/(.+)$/.exec(uri);
        var svc = m[1], method = m[2];
        if (svc === "com.palm.db") { return db.handle(method, args); }
        if (svc === "com.palm.tempdb") { return tempdb.handle(method, args); }
        if (svc === "com.palm.activitymanager") {
            am.push({ method: method, args: args });
            if (method === "complete" && opts.completeFails) { return { returnValue: false, errorCode: -1, errorText: "not the adopter" }; }
            return { returnValue: true };
        }
        if (svc === "com.webos.notification") { toasts.push(args); return { returnValue: true }; }
        if (svc === "com.webos.service.applicationmanager" && method === "running") {
            return { returnValue: true, running: opts.running ? [{ id: "org.webosports.app.messaging" }] : [{ id: "com.palm.app.email" }] };
        }
        return { returnValue: false, errorCode: -1, errorText: "unexpected call " + uri };
    });
    var s = service.start({ palmbus: pb, idleMs: 0, exit: function () {}, log: opts.log || quiet,
        stateFile: stateFile(), now: opts.now });
    return { db: db, tempdb: tempdb, am: am, toasts: toasts, handle: pb.handles[0], service: s };
}

module.exports = { boot, SERVICE };
