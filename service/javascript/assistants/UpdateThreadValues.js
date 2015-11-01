/*global Log, MessageAssigner */

/**
 * updateThreadValues service endpoint
 *
 * Parameters:
 *   message - message object to take the new values from
 *   threadId - Id of the thread to be updated
 *
 * This method can be used if a chatthread should be updated with a certain message object.
 * This will be required if a user deletes the last message of a chatthread. Then the
 * chatthread will still display the old summary and also the old timeline. This similarly
 * to putMessage requires a full message object and it requires the threadId. Currently I
 * would advise to call this method with the last message object in a chatthread, whenever
 * the last message is deleted.
 */

var UpdateThreadValues = function () { "use strict"; };

UpdateThreadValues.prototype.run = function (outerFuture) {
	"use strict";
	var args = this.controller.args,
		future,
		msg = args.message,
		threadId = args.threadId;

	if (!msg) {
		throw { message: "Requiring valid message argument."};
	}
	if (!threadId) {
		throw { message: "Requiring valid threadId argument."};
	}

	msg.conversations = [threadId];

	future = MessageAssigner.updateChatthreads(msg);

	future.then(function putMessage() {
		var result = future.result;
		Log.debug("Thread association result: ", result);
		outerFuture.result = result;
	});

	return outerFuture;
};
