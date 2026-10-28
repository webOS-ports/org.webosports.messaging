/* Copied from luneos-synergy-connectors cloud/_core/service/_cloudcore/node/errors.js at a3139d0, the
 * runtime of the cloud connectors; keep the two in step. */
/* errors.js - the one error type of the node runtime, and the error reply it becomes.
 *
 * Everything a handler throws ends up as { returnValue:false, errorCode, errorText } on the bus
 * (bus.js calls toReply). A CloudError says what errorCode it is; anything else - a TypeError on
 * a reply of an unexpected shape, a bug - becomes CONNECTOR_EXCEPTION, and is logged with its
 * stack, as CloudGuard did for the mojoservice runtime.
 */
"use strict";

class CloudError extends Error {
	// new CloudError("MISSING_ARGS", "need localPath"), plus optional { status, body, cause }.
	constructor(errorCode, errorText, extra) {
		super(errorText || String(errorCode));
		this.name = "CloudError";
		this.errorCode = errorCode;
		this.errorText = errorText || String(errorCode);
		if (extra) {
			for (const k of Object.keys(extra)) {
				if (k === "cause") { Object.defineProperty(this, "cause", { value: extra.cause }); }
				else { this[k] = extra[k]; }
			}
		}
	}
}

const missingArgs = (text) => new CloudError("MISSING_ARGS", text);
const badArgs = (text) => new CloudError("BAD_ARGS", text);
const notSupported = (text) => new CloudError("NOT_SUPPORTED", text);

// What any thrown value replies. An object carrying an errorCode keeps it (the old runtime's
// plain { returnValue:false, errorCode, detail } objects included); its text comes from errorText,
// message or detail. A numeric status (an HTTP error) is passed on: it tells a 409 conflict from
// a 404 for a caller that wants to know.
function toReply(e) {
	if (e && typeof e === "object" && e.errorCode !== undefined && e.errorCode !== null) {
		const reply = { returnValue: false, errorCode: e.errorCode,
			errorText: String(e.errorText || e.message || (typeof e.detail === "string" ? e.detail : "") || e.errorCode) };
		if (typeof e.status === "number") { reply.status = e.status; }
		return reply;
	}
	return { returnValue: false, errorCode: "CONNECTOR_EXCEPTION",
		errorText: String((e && e.message) || e) };
}

// True when toReply(e) is CONNECTOR_EXCEPTION, i.e. the error is a bug worth a stack in the log.
const isUnexpected = (e) => !(e && typeof e === "object" && e.errorCode !== undefined && e.errorCode !== null);

module.exports = { CloudError, missingArgs, badArgs, notSupported, toReply, isUnexpected };
