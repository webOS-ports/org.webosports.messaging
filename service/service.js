/* service.js - org.webosports.service.messaging: puts messages into conversations.
 *
 * The launcher (run-js-service -> jsservicelauncher's bootstrap-node.js) requires this directory,
 * as it has a package.json, and calls run(). Nothing starts on require, so a test can start() it
 * on a stand-in bus. The methods are in lib/commands.js; how a message finds its thread is in
 * lib/threader.js.
 */
"use strict";

const { createBus } = require("./lib/bus.js");
const { createDb } = require("./lib/db.js");
const { createCommands } = require("./lib/commands.js");
const { createNotifier } = require("./lib/notify.js");
const { createSerial } = require("./lib/serial.js");
const { createState } = require("./lib/state.js");

const NAME = "org.webosports.service.messaging";

function start({ palmbus, exit, idleMs, log = console, stateFile, now } = {}) {
	const bus = createBus({ palmbus, name: NAME, exit, idleMs, log });
	const db = createDb({ call: bus.call });
	const tempdb = createDb({ call: bus.call, service: "luna://com.palm.tempdb" });
	const notifier = createNotifier({ db, call: bus.call, log, now });
	const state = createState({ file: stateFile, log });
	const methods = createCommands({ db, tempdb, call: bus.call, notifier, state, serial: createSerial(), log, now });
	bus.serve(methods);
	log.log(NAME + ": up (" + Object.keys(methods).length + " methods, node " + process.version + ")");
	return { bus, db, methods };
}

let running = null;
function run() {
	if (running) { return running; }
	process.title = NAME;
	// palmbus is the launcher's: it is there on the device and nowhere else.
	running = start({ palmbus: require("palmbus") });
	return running;
}

module.exports = { start, run, NAME };

if (require.main === module) { run(); }
