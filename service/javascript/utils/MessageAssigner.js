/*jslint node: true, nomen: true */
/*global checkResult, Contacts, DB, Future, Log, PalmCall */

var MessageAssigner = (function () {
	"use strict";
	var newRev = 0;

	//create notification for a message:
	function createNotification(msg, contactName, threadId) {
		return PalmCall.call("palm://org.webosports.notifications", "create", {
			ownerId: "org.webosports.service.messaging",
			launchId: "org.webosports.app.messaging",
			launchParams: {threadId: threadId }, //Seems the messaging app does not support this, yet.
			title: contactName,
			body: msg.messageText,
			iconUrl: "file:///usr/palm/applications/org.webosports.app.messaging/icon.png",
			expireTimeout: 5
		}).then(function notificationDone(f) {
			if (f.exception) {
				Log.log("notification call had error: " + JSON.stringify(f.exception));
			} else {
				var result = f.result;
				Log.debug("notification call came back: " + JSON.stringify(result));
				f.result = result;
			}
		});
	}

	//find person from address / phone number:
	function findPerson(msg, address) {
		var future = new Future();
		if (msg.serviceName === "sms" || msg.serviceName === "mms") {
			future.nest(Contacts.Person.findByPhone(address, {
				includeMatchingItem: false,
				returnAllMatches: false
			}));
		} else {
			future.nest(Contacts.Person.findByIM(address, msg.serviceName, {
				includeMatchingItem: false,
				returnAllMatches: false
			}));
		}
		return future;
	}

	//updates a chattread or creates a new one
	function updateChatthread(msg, person, future) {
		if (!person) {
			person = {};
		}
		var result = checkResult(future), chatthread = { unreadCount: 0, flags: {}, _kind: "com.palm.chatthread:1"};

		Log.debug("Get chatthread result: ", result);

		if (result.returnValue === true && result.results && result.results.length > 0) {
			if (result.results.length > 1) {
				//multiple threads. What to do? Probably something not right? :-/
				console.warn("Multiple chatthreads found. Will only use first one.");
			}
			chatthread = result.results[0];
		}

		chatthread.displayName = person.name || chatthread.displayName;
		if (!chatthread.flags) {
			chatthread.flags = {};
		}
		chatthread.personId = person.personId || chatthread.personId;
		chatthread.flags.visible = true; //have new message.
		chatthread.normalizedAddress = person.normalizedAddress || chatthread.normalizedAddress;
		chatthread.replyAddress = person.address || chatthread.replyAddress;
		chatthread.replyService = msg.serviceName;
		chatthread.summary = msg.messageText;
		chatthread.timestamp = msg.localTimestamp || Date.now()/1000;
		if (msg.folder === "inbox" && (!msg.flags || (!msg.flags.read && msg.flags.visible))) {
			chatthread.unreadCount += 1;
		}

		Log.debug("Result chatthread to write into db: ", chatthread);
		future.nest(DB.merge([chatthread]));
	}

	function updateChatthreadFromMessage(threadid, msg) {
		var future;
		future = DB.get([threadid]);

		future.then(function checkThreadResult() {
			//make sure we do not re-produce old threads here...
			//if thread could not be found by id, remove id from conversations.
			var result = future.result, i;
			Log.debug("Got ", result, " for threadId ", threadid);
			if (result.returnValue === true && result.results && result.results.length > 0 && !result.results[0]._del) {
				updateChatthread(msg, {}, future); //will set result in future.
			} else {
				Log.debug("Thread ", threadid, " not found. Might have been deleted?");
				i = msg.conversations.indexOf(threadid);
				msg.conversations.splice(i, 1);
				future.result = { returnValue: false};
			}
		});

		return future;
	}

	//public interface:
	return {
		getNewRev: function () {
			return newRev;
		},

		processMessageAndAddress: function (msg, address, notification) {
			var future = new Future(), person = { address: address};
			if (!msg.serviceName) {
				console.warn("No service name in message, assuming sms.");
				msg.serviceName = "sms";
			}
			if (msg.serviceName === "sms" || msg.serviceName === "mms") {
				person.normalizedAddress = Contacts.PhoneNumber.normalizePhoneNumber(address, true);
			} else {
				person.normalizedAddress = Contacts.IMAddress.normalizeIm(address);
			}

			//find person from address / phone number:
			future.nest(findPerson(msg, address));

			//process person result and then trigger query to chatthread db.
			future.then(function personCB() {
				var result = checkResult(future), query = { from: "com.palm.chatthread:1"};
				Log.debug("Person find result: ", result);
				if (result && (result.returnValue === undefined || result.returnValue)) { //result is person
					//TODO: if multiple persons => try to find person by configured account <=> contacts or similar.
					query.where = [ { op: "=", prop: "personId", val: result.getId() } ];
					person.name = result.displayName;
					person.personId = result.getId();
					Log.debug("Person ", person, " found for ", address);
				} else {
					Log.debug("No person found for ", address);
					person.name = address;
					query.where = [ { op: "=", prop: "normalizedAddress", val: person.normalizedAddress } ];
				}

				future.nest(DB.find(query));
			});

			future.then(updateChatthread.bind(this, msg, person));

			future.then(function chatthreadMergeCB() {
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
					msg._id = result.results[0].id;
					Log.debug("Result ok, set future.result to true.");
					future.result = {returnValue: true};
				} else {
					Log.debug("Result failed, propagate issues.");
					future.result = result; //propagate errors.
				}

				//create notification after background work is done and this is an incomming message:
				if (notification) {
					//notification for the currently worked on chatthread, ids are always added to the end of the array.
					createNotification(msg, person.name, msg.conversations[msg.conversations.length - 1]);
				}
			});

			return future;
		},

		processMessage: function (msg) {
			var future = new Future(), innerFuture;
			Log.debug("Processing message ", msg);

			if (msg.to && msg.to.length) {
				innerFuture = new Future({}); //inner future with dummy result
				//one message can be associated with multiple chattreads if it has multiple recievers.
				msg.to.forEach(function (addrObj) {
					Log.debug("Found to-address: ", addrObj);
					//enque a lot of "processOneMessageAndAddress" functions and let each of them nest one result
					innerFuture.then(function processOneAddressFromToArray() {
						innerFuture.getResult(); //consume result.
						innerFuture.nest(MessageAssigner.processMessageAndAddress(msg, addrObj.addr));
					});
				});

				innerFuture.then(function proccessingFromArrayDone() {
					Log.debug("Address processing done.");
					future.result = innerFuture.result;
				});
			} else if (msg.to && msg.to.addr) {
				Log.debug("Found one to-address: ", msg.to);
				future.nest(MessageAssigner.processMessageAndAddress(msg, msg.to.addr));
			} else if (msg.from && msg.from.addr) {
				Log.debug("Found from-address: ", msg.from);
				//new message from outside -> create notification.
				future.nest(MessageAssigner.processMessageAndAddress(msg, msg.from.addr, true));
			} else {
				Log.log("Need address field. Message ", msg, " skipped.");
				msg.flags.threadingError = true;
				DB.merge([msg]).then(function msgStoreCB(f) {
					var result = f.result;
					if (result.results && result.results[0]) {
						if (result.results[0].rev > newRev) {
							newRev = result.results[0].rev;
						}
						msg._id = result.results[0].id;
					}
					future.result = {returnValue: false};
				});
			}
			return future;
		},

		updateChatthreads: function (msg, storeMessage) {
			var future = new Future(), innerFuture = new Future({});
			Log.debug("Updating chatthreads: ", msg.conversations);
			msg.conversations.forEach(function (threadId) {
				innerFuture.then(function processThreadId() {
					innerFuture.getResult();
					innerFuture.nest(updateChatthreadFromMessage(threadId, msg));
				});
			});

			innerFuture.then(function processingThreadIdsDone() {
				Log.debug("Processing thread ids done.");

				if (msg.conversations.length === 0) {
					Log.debug("Seems all conversations this message has been in have been deleted?");
					future.nest(MessageAssigner.processMessage(msg));
				} else {
					Log.debug("Could update at least one thread.");
					if (storeMessage) {
						DB.merge([msg]).then(function msgStoreCB(f) {
							var result = f.result;
							if (result.results && result.results[0]) {
								if (result.results[0].rev > newRev) {
									newRev = result.results[0].rev;
								}
								msg._id = result.results[0].id;
							}
							future.result = {returnValue: result.returnValue};
						});
					} else {
						future.result = {returnValue: true};
					}
				}
			});

			return future;
		}
	};
}());

module.exports = MessageAssigner;
