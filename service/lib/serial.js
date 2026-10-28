/* serial.js - run async jobs one at a time, in the order they were queued.
 *
 * Everything that writes chatthreads goes through one queue: two runs at once would both read a
 * thread's unreadCount and one increment would be lost, and two first messages from the same
 * person would each create a thread. A job that fails does not stop the ones after it.
 */
"use strict";

function createSerial() {
	let tail = Promise.resolve();
	let depth = 0;
	function run(job) {
		depth++;
		const result = tail.then(() => job());
		tail = result.then(() => undefined, () => undefined).then(() => { depth--; });
		return result;
	}
	return { run, get pending() { return depth; } };
}

module.exports = { createSerial };
