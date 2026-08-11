/**
 * Cancel every outstanding request on an enyo-webos LunaService.
 *
 * LunaService.cancel() takes the request to cancel and dereferences it immediately, so calling it
 * with no argument throws — including on a service that has never sent anything. The ported code
 * re-arms watched queries by cancelling first (otherwise every watch fire leaks a subscription), so
 * it needs a form that is safe to call at any point, including before the first send.
 */

module.exports = function cancelRequests(service) {
    if (!service || !service.activeRequests) {
        return;
    }
    // cancel() splices the request out of activeRequests, so iterate a copy.
    var pending = service.activeRequests.slice();
    for (var i = 0; i < pending.length; i++) {
        try {
            service.cancel(pending[i]);
        } catch (e) {
            // A request that already completed is not worth failing the caller over.
        }
    }
};
