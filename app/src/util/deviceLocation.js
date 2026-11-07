/**
 * Where the device is, once, to send as a location. As the weather app finds it
 * (org.webosports.app.weather, source/DeviceLocation.js): the location service's cached fix
 * first (getCachedPosition), else the first live update (getLocationUpdates, subscribed, and the
 * subscription ended at once so the GPS does not keep running). Both need location.query.
 *
 * call(method, params, onReply, onError) makes one call to luna://com.webos.service.location and
 * returns something with cancel(), or nothing; the view does it with a ServiceRequest, the tests
 * with a stand-in. done(error, { latitude, longitude, accuracy }) is called once.
 */

var $L = require('enyo/i18n').$L;

var TIMEOUT_MS = 30000;

function fixOf(data) {
    if (!data || data.latitude === undefined || data.longitude === undefined) {
        return null;   // a subscription's first answer carries no position
    }
    var fix = { latitude: Number(data.latitude), longitude: Number(data.longitude) };
    if (data.horizAccuracy !== undefined) {
        fix.accuracy = Number(data.horizAccuracy);
    }
    return fix;
}

function errorOf(data) {
    var text = data && data.errorText;
    if (text) {
        return text;
    }
    return data && data.errorCode !== undefined ?
        $L("Location error {code}").replace("{code}", data.errorCode) : $L("Location unavailable.");
}

/**
 * Find the device once. timers: { set(fn, ms), clear(id) } (setTimeout and clearTimeout). Returns
 * cancel(), which ends it without calling done.
 */
function locate(call, timers, done, timeoutMs) {
    var finished = false, updates = null, timer = null;

    var finish = function (error, fix) {
        if (finished) {
            return;
        }
        finished = true;
        timers.clear(timer);
        if (updates && updates.cancel) {
            updates.cancel();
        }
        updates = null;
        if (done) {
            done(error, fix);
        }
    };

    var gotUpdate = function (data) {
        var fix = fixOf(data);
        if (fix) {
            finish(null, fix);
        } else if (data && data.returnValue === false) {
            finish(errorOf(data));
        }
    };

    timer = timers.set(function () {
        finish($L("No location within {s} seconds.").replace("{s}", Math.round((timeoutMs || TIMEOUT_MS) / 1000)));
    }, timeoutMs || TIMEOUT_MS);

    call("getCachedPosition", {}, function (data) {
        if (finished) {
            return;
        }
        var fix = fixOf(data);
        if (fix) {
            finish(null, fix);
            return;
        }
        updates = call("getLocationUpdates", { subscribe: true, minimumInterval: 1000 }, gotUpdate,
            function (e) { finish(errorOf(e)); });
    }, function () {
        if (finished) {
            return;
        }
        // No cached fix yet: the first live one answers instead.
        updates = call("getLocationUpdates", { subscribe: true, minimumInterval: 1000 }, gotUpdate,
            function (e) { finish(errorOf(e)); });
    });

    return function cancel() {
        done = null;
        finish(null, null);
    };
}

module.exports = { locate: locate, TIMEOUT_MS: TIMEOUT_MS };
