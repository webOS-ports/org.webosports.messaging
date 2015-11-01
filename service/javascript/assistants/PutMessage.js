/*jslint nomen: true*/
/*global ActivityHandler, Future, DB, Log, MessageAssigner */

/**
 * putMessage service endpoint
 * Parameters:
 *   message - full message object, including _kind field.
 *
 * This method should be used to send messages, now. It requires a complete message object as argument,
 * including the database kind. The app needs to derive the database kind for the message from the
 * chat-provider used. For example com.palm.smsmessage:1 for SMS. The service will handle thread
 * assignment, update the threads and store the message object in db. The result of this call will be an
 * array of threadIds to which the message was assigned and that are now updated in the db.
 *
 * Example request:
 *
 * luna-send -n 1 -a org.webosports.app.messaging luna://org.webosports.service.messaging/putMessage '{"message":{"_kind": "com.palm.message:1", "flags": {"visible": true}, "folder":"outbox","status":"pending","to": [{ "addr": "+491234567890" }], "localTimestamp":0,"messageText":"Message Text13","serviceName": "sms","timestamp": 0}}'
 *
 * Reply:
 *
 * {"threadids":["JIlfE6n7ysB"],"returnValue":true}
 *
 * If the app knows the threadId already, because the message is an reply, it can fill the conversations-Array with that id.
 * This will speed up processing a lot and should be done, if possible. Nonetheless it is currently advised to use this method
 * for sending ALL messages, no matter if threadId is know or not.
*/

var PutMessage = function () { "use strict"; };

PutMessage.prototype.run = function (outerFuture) {
	"use strict";
	var args = this.controller.args,
		future = new Future(),
		msg = args.message;

	if (!msg || !msg._kind || (!msg.to && !msg.from)) {
		throw { message: "Requiring valid message argument with _kind member already set."};
	}

	if (msg.conversations && msg.conversations.length > 0) {
		future.nest(MessageAssigner.updateChatthreads(msg, true));
	} else {
		future.nest(MessageAssigner.processMessage(msg));
	}

	future.then(function processingFinished() {
		var result = future.result;
		Log.debug("Thread association result: ", result);
		if (result.returnValue) {
			Log.debug("Put succeeded: ", result);
			if (result.results && result.results[0]) {
				ActivityHandler.setRev(result.results[0].rev); //update rev in activity.
			}
			outerFuture.result = {
				threadids: msg.conversations
			};
		} else {
			Log.debug("Put failed: ", result);
			throw { message: "Processing message returned error: " + JSON.stringify(result)};
		}

		ActivityHandler.setRev(MessageAssigner.getNewRev());
	});

	return outerFuture;
};

PutMessage.prototype.complete = function (activityObject) {
	"use strict";
	return ActivityHandler.updateActivityOnComplete(activityObject);
};
