/*jslint node: true, nomen: true */
/*global checkResult, Log, PalmCall */

var ActivityHandler = (function () {
	"use strict";

	var messageQuery = {
			from: "com.palm.message:1",
			where: [
				{ "op": ">", "prop": "_rev", "val": 0 }, //val will be changed in code.
				{"prop": "conversations", "op": "=", "val": null}, //only messages without conversations are of interest
				{"prop": "flags.visible", "op": "=", "val": true}, //only visible ones.
				{"prop": "flags.threadingError", "op": "=", "val": null} //omit messages that failed before.
			]
		},
		//can't use Foundations.Activity, because it does not allow immideate activities.
		activity = {
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
				method: "luna://com.webos.service.db/watch",
				params: { query: messageQuery }
			},
			callback: {
				method: "luna://org.webosports.service.messaging/assignMessages",
				params: { lastCheckedRev: 0 } //set to same rev as above in code.
			}
		},
		newRev = 0;

	function setRevImpl(newRev) {
		activity.trigger.params.query.where[0].val = newRev;
		activity.callback.params.lastCheckedRev = newRev;
		messageQuery.where[0].val = newRev;
	}


	return {
		setRev: function (newRev_, force) {
			if (force || newRev_ > newRev) {
				setRevImpl(newRev_);
			}
		},

		//dangerous: receiver can modify query object. Better would be to clone the object here and keep original hidden.
		getMessageQuery: function () {
			return messageQuery;
		},

		updateActivityOnComplete: function (activityObject) {
			Log.debug("Completing ", activityObject ? activityObject.name : "", " with id: ", activityObject ? activityObject._activityId : "invalid");
			var future = PalmCall.call("luna://com.webos.service.activitymanager", "getDetails", {"activityName": activity.name, current: false, internal: false});

			future.then(this, function getDetailsCB() {
				var result = checkResult(future);
				ActivityHandler.setRev(newRev);
				activityObject.setTrigger("fired",
										  "luna://com.webos.service.db/watch",
										  { query: messageQuery });
				Log.debug("Rev: ", newRev, " query: ", messageQuery);
				activityObject.setCallback("luna://org.webosports.service.messaging/assignMessages",
										   { lastCheckedRev: newRev });
				if (result.returnValue === false) {
					Log.debug("Could not get activity, re-creating it: ", result);
					future.nest(PalmCall.call("luna://com.webos.service.activitymanager", "create", {activity: activity, start: true, replace: true}));
				} else {
					if (activityObject._activityId === result.activity.activityId) {
						Log.debug("Need to restart.");
						future.nest(PalmCall.call("luna://com.webos.service.activitymanager", "complete", {
							activityId: result.activity.activityId,
							restart: true,
							trigger: activity.trigger,
							callback: activity.callback
						}));
					} else {
						Log.debug("Different activity, finish it");
						activityObject.complete().then(function completeCB() {
							Log.debug("Setting new rev in old activity.");
							future.nest(PalmCall.call("luna://com.webos.service.activitymanager", "create", {activity: activity, start: true, replace: true}));
						});
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
		}
	};
}());

module.exports = ActivityHandler;
