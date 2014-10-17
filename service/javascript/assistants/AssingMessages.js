/*global Future, console, DB, PalmCall, Contacts */

var messageQuery = {
	from: "com.palm.message:1",
		where: [
			{ "op": ">", "prop": "_rev", "val": 0 }, //val will be changed in code.
			{"prop": "conversations", "op": "=", "val": null}, //only messages without conversations are of interest
			{"prop": "flags.visible", "op": "=", "val": true} //only visible ones.
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
		method: "palm://org.webosports.service.messaging/assingMessagesToThread",
		params: { lastCheckedRev: 0 } //set to same rev as above in code.
	}
};

function setRev (newRev) {
	"use strict";
	activity.trigger.params.query.where[0].val = newRev;
	activity.callback.params.lastCheckedRev = newRev;
	messageQuery.where[0].val = newRev;
}

function debug (msg) {
	console.log(msg);
}

var AssingMessages = function () { "use strict"; };

AssingMessages.prototype.processMessage = function (msg) {
	var future = new Future();
	if (!msg.from || !msg.from.addr) {
		console.error("Need msg.from.addr field. Message " + JSON.stringify(msg) + " skipped.");
		//can only work on imcomming messages?
		future.result = {returnValue: false};
		return future;
	}

	//find person from address / phone number:
	if (msg.serviceName === "sms" || msg.serviceName === "mms") {
		future.nest(Contacts.Person.findByPhone(msg.from.addr, {
			includeMatchingItem: true,
			returnAllMatches: true
		}));
	} else {
		future.nest(Contacts.Person.findByIM(msg.from.addr, msg.serviceName, {
			includeMatchingItem: true,
			returnAllMatches: true
		}));
	}

	future.then(function personCB() {

	});

	return future;
};

AssingMessages.prototype.run = function (outerFuture) {
	"use strict";
	var args = this.controller.args,
		future = new Future(),
		rev = args.lastCheckedRev || 0,
		newRev = 0;

	setRev(rev);
	future.nest(DB.find(messageQuery, false, false));

	future.then(this, function gotMessages() {
		var result = future.result,
			innerFuture;

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
			});

			future.nest(innerFuture);
		} else {
			throw "Could not get messages from db " + JSON.stringify(result);
		}
	});

	future.then(this, function updateRev() {
		var result = future.result; //read result.
		setRev(newRev);
		future.nest(PalmCall.call("palm://com.palm.activitymanager/", "create", {
			activity: activity,
			start: true,
			replace: true
		}));
	});

	future.then(this, function processingFinished() {
		var result = future.result;
		debug("Activity restored: " + JSON.stringify(result));
		outerFuture.result = {};
	});
	return outerFuture;
};
