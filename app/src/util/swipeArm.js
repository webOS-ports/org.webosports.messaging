/**
 * The one row whose delete prompt is showing (widgets/SwipeableItem), as the Mojo app's
 * ScrimmedConfirmPrompt had it: a prompt is answered or it goes away. It goes away when another
 * row's prompt opens, when a finger comes down on another row, when a drag starts on the row
 * (so the list scrolls as it would without it), and when the list scrolls.
 *
 * Rows are anything with a cancelPending() that closes their prompt.
 */

var pending = null;

/** row has just shown its prompt. */
function shown(row) {
    if (pending && pending !== row) {
        pending.cancelPending();
    }
    pending = row;
}

/** row's prompt has closed (answered, cancelled, or the row went away). */
function closed(row) {
    if (pending === row) {
        pending = null;
    }
}

/** A finger came down on row: any other row's prompt goes. */
function down(row) {
    if (pending && pending !== row) {
        cancel();
    }
}

/** Close whatever prompt is showing. */
function cancel() {
    var row = pending;
    pending = null;
    if (row) {
        row.cancelPending();
    }
}

function current() {
    return pending;
}

module.exports = { shown: shown, closed: closed, down: down, cancel: cancel, current: current };
