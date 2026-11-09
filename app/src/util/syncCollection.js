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

    // The models that went away are removed here rather than by add()'s purge, which removes
    // nothing unless a record it keeps counts as kept (Collection.add tests `purge && keep.length`).
    // An empty result left the previous list in place - tapping a server with no channels showed
    // the channels of the server tapped before - and so did a result made only of records that
    // were in the list once before: add() finds those in enyo's store, and a model found there
    // does not count as kept. Opening the archived chats showed every chat.
    var order = {}, i;
    for (i = 0; i < records.length; i++) {
        order[records[i]._id] = i;
    }
    var gone = [];
    for (i = 0; i < collection.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(order, collection.at(i).attributes._id)) {
            gone.push(collection.at(i));
        }
    }
    if (gone.length) {
        collection.remove(gone);
    }

    collection.add(records, { merge: true });

    // add() appends new models rather than placing them, so re-impose the query's ordering — but
    // only when it actually differs, since sorting notifies and re-renders on its own.

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
