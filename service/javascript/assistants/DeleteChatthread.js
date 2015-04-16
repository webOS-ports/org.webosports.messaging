/*jslint nomen: true */
/*global DB, Future, Log */

var DeleteChatthread = function () { "use strict"; };

function processMessage(message, threadId) {
	"use strict";
	var i;
	if (message && message.conversations) {
		i = message.conversations.indexOf(threadId);
		if (i >= 0) {
			message.conversations.splice(i, 1);
		}

		if (message.conversations.length > 0) {
			Log.debug("Removed threadId from conversations.");
			return DB.merge([message]);
		} else {
			Log.debug("No more conversations left, delete message.");
			return DB.del([message._id]);
		}
	}
	return new Future({returnValue: true});
}

function processMessageResults(messages, threadId) {
	"use strict";
	var future = new Future(), innerFuture;

	if (messages && messages.length > 0) {
		innerFuture = new Future({});
		messages.forEach(function (message) {
			innerFuture.then(function () {
				innerFuture.getResult();
				innerFuture.nest(processMessage(message, threadId));
			});
		});

		innerFuture.then(function processingDone() {
			Log.debug("Deleted all messages...");
			future.result = {returnValue: true};
		});
	} else {
		future.result = {returnValue: true};
	}

	return future;
}

function getMessages(query, threadId) {
	"use strict";
	var future = DB.find(query);

	future.then(function pageProcessed() {
		var result = future.result;

		processMessageResults(result.results, threadId).then(function (f) {
			f.getResult();
			if (result.next) {
				Log.debug("Page processed. Need to processes more: ", result.next);
				query.page = result.next;
				future.nest(getMessages(query, threadId));
			} else {
				Log.debug("All messages processed. Return.");
				future.result = { returnValue: true };
			}
		});
	});

	return future;
}

DeleteChatthread.prototype.run = function (outerFuture) {
	"use strict";
	var args = this.controller.args,
		future,
		query,
		threadId = args.threadId;

	if (!threadId) {
		throw { message: "Requiring valid threadId argument."};
	}

	query = {
		from: "com.palm.message:1",
		where: [
			{
				prop: "conversations",
				op: "=",
				val: threadId,
				limit: 500
			}
		]
	};

	future = getMessages(query, threadId);

	future.then(function deleteChatthread() {
		var result = future.result;
		future.nest(DB.del([threadId]));
	});

	future.then(function allDone() {
		var result = future.result;
		Log.debug("All done, delete result: ", result);
		outerFuture.result = result;
	});
};
