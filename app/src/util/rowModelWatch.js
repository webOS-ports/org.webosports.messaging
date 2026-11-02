/**
 * Keep a list row up to date with its model.
 *
 * syncCollection merges a fresh result set onto the models already on screen, so a row keeps its
 * model and modelChanged never fires again: a row stayed as it was first drawn, and a sent SMS
 * stayed grey until the app restarted. So a row watches its model's change event too.
 *
 * The model reports a change on every merge, as a result carries new `to` and `flags` objects each
 * time, and every watched query re-runs on any change. The row is only redrawn when its record
 * really differs, as a redraw of every row on every query would bring the flashing back.
 *
 * show(row): call in create() and modelChanged() in place of populateRow(). stop(row): in destroy().
 */

function refresh(row) {
    var model = row.model;
    var shown = model ? JSON.stringify(model.attributes) : null;
    if (shown !== row._rowModelShown) {
        row._rowModelShown = shown;
        row.populateRow();
    }
}

function stop(row) {
    if (row._rowModelWatched) {
        row._rowModelWatched.off('change', row._rowModelListener);
    }
    row._rowModelWatched = null;
}

function show(row) {
    if (row._rowModelWatched !== row.model) {
        stop(row);
        if (!row._rowModelListener) {
            row._rowModelListener = function () { refresh(row); };
        }
        if (row.model) {
            row.model.on('change', row._rowModelListener);
            row._rowModelWatched = row.model;
        }
    }
    refresh(row);
}

module.exports = { show: show, stop: stop };
