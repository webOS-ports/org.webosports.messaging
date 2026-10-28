/**
 * Choose the one messaging prefs record to use when db8 holds more than one.
 *
 * The prefs are meant to be a single record, but nothing in db8 enforces that, and a device can
 * end up with two: each is a full set of prefs, and only one of them is changed by the app. A
 * handler that took whichever the query happened to return first could write Done's
 * firstUseMode:false to one record and read the other back, so the first-run screen came straight
 * back. The record written last (highest _rev) is the one the user changed most recently; the rest
 * are returned so they can be deleted.
 */

module.exports = function pickPrefsRecord(results) {
    var records = (results || []).filter(function (r) { return r && r._id; });
    if (records.length === 0) {
        return { keep: null, extraIds: [] };
    }
    var keep = records[0];
    for (var i = 1; i < records.length; i++) {
        if ((records[i]._rev || 0) > (keep._rev || 0)) {
            keep = records[i];
        }
    }
    return {
        keep: keep,
        extraIds: records.filter(function (r) { return r !== keep; }).map(function (r) { return r._id; })
    };
};
