/*global Log, MessageAssigner */

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
