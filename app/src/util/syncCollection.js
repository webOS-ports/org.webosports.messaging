/**
 * Update a collection in place from a fresh result set.
 *
 * Collection.empty(records) destroys every model and recreates it, so the list tears down and
 * rebuilds all of its rows: the whole list visibly flashes and the scroll position is lost. Since
 * every watched query re-runs on any change, that happened constantly.
 *
 * add() with merge (the default) and purge instead updates the models that are still present,
 * creates only genuinely new ones and removes only the ones that went away, so a row is only
 * touched if its own data changed. Requires the collection's model kind to key on `_id`.
 */

module.exports = function syncCollection(collection, records) {
    if (!collection) {
        return;
    }
    records = records || [];

    collection.add(records, { merge: true, purge: true });

    // add() appends new models rather than placing them, so re-impose the query's ordering — but
    // only when it actually differs, since sorting notifies and re-renders on its own.
    var order = {}, i;
    for (i = 0; i < records.length; i++) {
        order[records[i]._id] = i;
    }

    var inOrder = true;
    for (i = 0; i < collection.length; i++) {
        if (order[collection.at(i).attributes._id] !== i) {
            inOrder = false;
            break;
        }
    }
    if (inOrder) {
        return;
    }

    collection.sort(function (a, b) {
        var ai = order[a.attributes._id], bi = order[b.attributes._id];
        return (ai === undefined ? Number.MAX_VALUE : ai) - (bi === undefined ? Number.MAX_VALUE : bi);
    });
};
