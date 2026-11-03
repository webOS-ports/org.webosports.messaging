/**
 * How many records at the start of a fresh result set are older messages that go in front of the
 * ones already in the list.
 *
 * A conversation loads its newest messages first and then backfills older ones. Those arrive as
 * a longer result set whose tail is the list as it stands. Adding the new head at index 0 lets the
 * list draw only the new rows; merging the whole set would put them at the end and sort, which
 * redraws every row.
 *
 * @param {string[]} shownIds - _ids already in the list, oldest first
 * @param {string[]} resultIds - _ids of the new result set, oldest first
 * @returns {number} how many leading results are new and come before shownIds[0]; 0 when there is
 *     nothing shown yet, or when the head is not made only of records missing from the list
 */
module.exports = function prependedCount(shownIds, resultIds) {
    if (!shownIds || !shownIds.length || !resultIds) {
        return 0;
    }
    var at = resultIds.indexOf(shownIds[0]);
    if (at <= 0) {
        return 0;
    }
    var shown = {};
    for (var i = 0; i < shownIds.length; i++) {
        shown[shownIds[i]] = true;
    }
    for (var j = 0; j < at; j++) {
        if (shown[resultIds[j]]) {
            return 0;
        }
    }
    return at;
};
