/**
 * Keep a subscription to a service alive across the service's restarts.
 *
 * A subscription ends with the service that holds it, and its caller is not told: Messaging's
 * watchTyping on the IM transport went quiet once imlibpurpleservice restarted, so typing to us
 * showed no more until the app was relaunched. The hub says when a service comes and goes
 * (luna://com.webos.service.bus/signal/registerServerStatus): status() takes each of those replies,
 * and calls start() whenever the service is up - the first reply included, and again after every
 * restart - and stop() when it has gone.
 *
 * start() returns the request it made, or nothing; cancel(request) ends it. A new start() first
 * cancels the request before it, so a restart does not leave two subscriptions.
 */

function ServiceFollower(start, stop, cancel) {
    this.start = start;
    this.stop = stop;
    this.cancel = cancel;
    this.request = null;
    this.up = false;
}

/** Take one registerServerStatus reply ({ serviceName, connected }). */
ServiceFollower.prototype.status = function (reply) {
    if (!reply || typeof reply.connected !== "boolean") {
        return;   // the call's own acknowledgement, or a reply that says nothing
    }
    this.end();
    this.up = reply.connected;
    if (this.up) {
        this.request = this.start() || null;
    } else if (this.stop) {
        this.stop();
    }
};

/** End the subscription made last, if any. */
ServiceFollower.prototype.end = function () {
    if (this.request && this.cancel) {
        this.cancel(this.request);
    }
    this.request = null;
};

module.exports = { ServiceFollower: ServiceFollower };
