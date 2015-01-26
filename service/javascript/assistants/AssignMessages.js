/*global Future, console, DB, PalmCall, Contacts, checkResult, Log */

var messageQuery = {
	from: "com.palm.message:1",
	where: [
		{ "op": ">", "prop": "_rev", "val": 0 }, //val will be changed in code.
		{"prop": "conversations", "op": "=", "val": null}, //only messages without conversations are of interest
		{"prop": "flags.visible", "op": "=", "val": true}, //only visible ones.
		{"prop": "flags.threadingError", "op": "=", "val": null} //omit messages that failed before.
	]
};

//can't use Foundations.Activity, because it does not allow immideate activities.
var activity = {
	name: "chatthreader-message-watch",
	description: "Assings new messages to chat threads",
	type: {
		immediate: true,
		priority: "normal",
		persist: true,
		explicit: true,
		power: true,
		powerDebounce: true
	},
	trigger: {
		key: "fired",
		method: "palm://com.palm.db/watch",
		params: { query: messageQuery }
	},
	callback: {
		method: "palm://org.webosports.service.messaging/assignMessages",
		params: { lastCheckedRev: 0 } //set to same rev as above in code.
	}
};

function setRev (newRev) {
	"use strict";
	activity.trigger.params.query.where[0].val = newRev;
	activity.callback.params.lastCheckedRev = newRev;
	messageQuery.where[0].val = newRev;
}

var newRev = 0;
var numProcessed = 0;

var AssignMessages = function () { "use strict"; };

AssignMessages.prototype.processMessage = function (msg) {
	var future = new Future(), innerFuture;
	Log.debug("Processing message ", msg);
	if (msg.folder === "outbox") {
		if (!msg.to || !msg.to.length) {
			Log.log("Need address field. Message ", msg, " skipped.");
			msg.flags.threadingError = true;
			DB.merge([msg]).then(function msgStoreCB() {
				future.result = {returnValue: false};
			});
			return future;
		}

		//one message can be associated with multiple chattreads if it has multiple recievers.
		msg.to.forEach(function (addrObj) {
			Log.debug("Found address: ", addrObj);
			//enque a lot of "processOneMessageAndAddress" functions and let each of them nest one result
		innerFuture = new Future({}); //inner future with dummy result
			innerFuture.then(this, function processOneMessageAndAddress() {
				innerFuture.nest(this.processMessageAndAddress(msg, addrObj.addr));
			});
		}, this);

		return innerFuture;
	} else {
		if (!msg.from || !msg.from.addr) {
			Log.log("Need address field. Message ", msg, " skipped.");
			msg.flags.threadingError = true;
			DB.merge([msg]).then(function msgStoreCB() {
				future.result = {returnValue: false};
			});
			return future;
		}
		Log.debug("Found address: ", msg.from);
		return this.processMessageAndAddress(msg, msg.from.addr);
	}
};

AssignMessages.prototype.processMessageAndAddress = function (msg, address) {
	var future = new Future(), name = "", normalizedAddress;
	if (!msg.serviceName) {
		console.warn("No service name in message, assuming sms.");
		msg.serviceName = "sms";
	}
	numProcessed += 1;

	//find person from address / phone number:
	if (msg.serviceName === "sms" || msg.serviceName === "mms") {
		future.nest(Contacts.Person.findByPhone(address, {
			includeMatchingItem: false,
			returnAllMatches: false,
		}));
		normalizedAddress = Contacts.PhoneNumber.normalizePhoneNumber(address);
	} else {
		future.nest(Contacts.Person.findByIM(address, msg.serviceName, {
			includeMatchingItem: false,
			returnAllMatches: false
		}));
		normalizedAddress = Contacts.IMAddress.normalizeIm(address);
	}

	future.then(function personCB() {
		var result = checkResult(future), query = { from: "com.palm.chatthread:1"};
		if (result && (result.returnValue === undefined || result.returnValue)) { //result is person
			//TODO: if multiple persons => try to find person by configured account <=> contacts or similar.
			query.where = [ { op: "=", prop: "personId", val: result.getId() } ];
			name = result.getDisplayName();
			Log.debug("Person ", name, " found for ", address);
		} else {
			Log.debug("No person found for ", address);
			name = address;
			query.where = [ { op: "=", prop: "normalizedAddress", val: normalizedAddress } ];
		}

		future.nest(DB.find(query));
	});

	future.then(function chatthreadCB() {
		var result = checkResult(future), chatthread = { unreadCount: 0, flags: {}, _kind: "com.palm.chatthread:1"};

		Log.debug("Get chatthread result: ", result);

		if (result.returnValue === true && result.results && result.results.length > 0) {
			if (result.results.length > 1) {
				//multiple threads. What to do? Probably something not right? :-/
				console.warn("Multiple chatthreads found. Will only use first one.");
			}
			chatthread = result.results[0];
		}

		chatthread.displayName = name;
		if (!chatthread.flags) {
			chatthread.flags = {};
		}
		chatthread.flags.visible = true; //have new message.
		chatthread.normalizedAddress = normalizedAddress;
		chatthread.replyAddress = address;
		chatthread.replyService = msg.serviceName;
		chatthread.summary = msg.messageText;
		chatthread.timestamp = msg.localTimestamp || Date.now();
		if (msg.folder === "inbox" && (!msg.flags || (!msg.flags.read && msg.flags.visible))) {
			chatthread.unreadCount += 1;
		}

		Log.debug("Result chatthread to write into db: ", chatthread);
		future.nest(DB.merge([chatthread]));
	});

	future.then(function chatthredMergeCB() {
		var result = checkResult(future);

		Log.debug("Result from chatthread merge: ", result);

		if (result.returnValue === true && result.results && result.results.length > 0) {
			if (!msg.conversations) {
				msg.conversations = [];
			}
			msg.conversations.push(result.results[0].id);

			Log.debug("Modified message to go into db: ", msg);
			future.nest(DB.merge([msg]));
		} else {
			console.error("Could not store chatthread: ", result);
			future.result = { returnValue: false, msg: "Chatthread error"};
		}
	});

	future.then(function msgMergeCB() {
		var result = checkResult(future);
		Log.debug("Message stored: ", result);
		if (result.returnValue) {
			if (result.results[0].rev > newRev) {
				newRev = result.results[0].rev;
			}
			//update rev to store msg again, if assigned to multiple conversations, i.e. multiple recepients.
			msg._rev = result.results[0].rev;
			future.result = {returnValue: true};
		} else {
			future.result = result; //propagate errors.
		}
	});

	return future;
};

AssignMessages.prototype.run = function (outerFuture) {
	"use strict";
	var args = this.controller.args,
		future = new Future(),
		rev = args.lastCheckedRev || 0;

	Log.debug("Running from activity: ", args.$activity);
	
	setRev(rev);
	future.nest(DB.find(messageQuery, false, false));

	future.then(this, function gotMessages() {
		var result = future.result,
			innerFuture;
		Log.debug("Got messages from db: ", result);

		if (result.returnValue) {
			innerFuture = new Future({}); //inner future with dummy result
			result.results.forEach(function (msg) {
				if (msg._rev < newRev) {
					newRev = msg._rev;
				}
				//enque a lot of "processOneMessage" functions and let each of them nest one result
				innerFuture.then(this, function processOneMessage() {
					innerFuture.nest(this.processMessage(msg));
				});
			}, this);

			future.nest(innerFuture);
		} else {
			throw "Could not get messages from db " + JSON.stringify(result);
		}
	});

	future.then(this, function processingFinished() {
		var result = future.result;
		Log.log("Processed ", numProcessed, " messages and adresses. New rev: ", newRev, " result: ", result);
		outerFuture.result = result;
	});
	return outerFuture;
};

AssignMessages.prototype.complete = function (activityObject) {
	Log.debug("Completing ", activityObject.name, " with id: ", activityObject._activityId);
	var future = PalmCall.call("palm://com.palm.activitymanager", "getDetails", {"activityName": activity.name, current: false, internal: false});

	future.then(this, function getDetailsCB() {
		var result = checkResult(future);
		setRev(newRev);
		activityObject.setTrigger("fired",
								  "palm://com.palm.db/watch",
								  { query: messageQuery });
		Log.debug("Rev: ", newRev, " query: ", messageQuery);
		activityObject.setCallback("palm://org.webosports.service.messaging/assignMessages",
								   { lastCheckedRev: newRev });
		if (result.returnValue === false) {
			Log.debug("Could not get activity, re-creating it: ", result);
			future.nest(PalmCall.call("palm://com.palm.activitymanager", "create", {activity: activity, start: true, replace: true}));
		} else {
			if (activityObject._activityId === result.activity.activityId) {
				Log.debug("Need to restart.");
				future.nest(PalmCall.call("palm://com.palm.activitymanager", "complete", {
					activityId: result.activity.activityId,
					restart: true,
					trigger: activity.trigger,
					callback: activity.callback
				}));
			} else {
				Log.debug("Different activity, finish it");
				future.nest(activityObject.complete());
			}
			future.result = {returnValue: true};
		}
	});

	future.then(this, function checkActivityCB() {
		var result = checkResult(future);
		Log.debug("result: ", result);
		future.result = result;
	});

	return future;
};
