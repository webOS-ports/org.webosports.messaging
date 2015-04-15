/*jslint nomen: true*/
/*global ActivityHandler, Future, DB, Log, MessageAssigner */

var PutMessage = function () { "use strict"; };

PutMessage.prototype.run = function (outerFuture) {
	"use strict";
	var args = this.controller.args,
		future = new Future(),
		msg = args.message;

	if (!msg || !msg._kind || (!msg.to && !msg.from)) {
		throw { message: "Requiring valid message argument with _kind member already set."};
	}

	future.nest(MessageAssigner.processMessage(msg));

	future.then(this, function processingFinished() {
		var result = future.result;
		if (result.returnValue) {
			Log.debug("Put succeeded: ", result);
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
