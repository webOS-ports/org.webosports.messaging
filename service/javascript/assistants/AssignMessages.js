/*jslint nomen: true*/
/*global ActivityHandler, Future, console, DB, Contacts, checkResult, Log, MessageAssigner */

var AssignMessages = function () { "use strict"; };

AssignMessages.prototype.run = function (outerFuture) {
	"use strict";
	var args = this.controller.args,
		future = new Future(),
		rev = args.lastCheckedRev || 0;

	Log.debug("Running from activity: ", args.$activity);

	ActivityHandler.setRev(rev);
	future.nest(DB.find(ActivityHandler.getMessageQuery(), false, false));

	future.then(this, function gotMessages() {
		var result = future.result,
			innerFuture;
		Log.debug("Got messages from db: ", result);

		if (result.returnValue) {
			innerFuture = new Future({}); //inner future with dummy result
			result.results.forEach(function (msg) {
				if (msg._rev > rev) {
					rev = msg._rev;
				}
				//enque a lot of "processOneMessage" functions and let each of them nest one result
				innerFuture.then(this, function processOneMessage() {
					innerFuture.getResult(); //consume result
					innerFuture.nest(MessageAssigner.processMessage(msg));
				});
			}, this);

			innerFuture.then(this, function messageProcessingDone() {
				Log.debug("Message processing done.");
				rev = Math.max(rev, MessageAssigner.getNewRev());
				ActivityHandler.setRev(rev);
				future.result = innerFuture.result;
			});
		} else {
			throw "Could not get messages from db " + JSON.stringify(result);
		}
	});

	future.then(this, function processingFinished() {
		var result = future.result;
		Log.log("Processed message. New rev: ", rev, " result: ", result);
		outerFuture.result = result;
	});
	return outerFuture;
};

AssignMessages.prototype.complete = function (activityObject) {
	"use strict";
	return ActivityHandler.updateActivityOnComplete(activityObject);
};
