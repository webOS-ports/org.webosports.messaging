/**
 * layout/FittableRows, with its floating children left out of the sizing.
 *
 * FittableRows gives its fit child the height that is left once it has measured from the fit
 * child's bottom edge to the bottom of the last showing child. A floating popup (a Menu, a Popup,
 * a dialog) is a child like any other to the layout, but it is drawn in the floating layer, so its
 * bounds say nothing about this view. Reflow while one is open - a reply chosen from the message
 * menu, the keyboard closing under the app menu - and the fit child was given the popup's offset
 * as extra height: the chat's list grew past the screen, the composer with its Send button and
 * the reply bar's close button went below it, and stayed there until the next reflow.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    FittableLayout = require('layout/FittableLayout');

var InPlaceRowsLayout = kind({
    name: "InPlaceRowsLayout",
    kind: FittableLayout.Rows,

    getShowingChildren: kind.inherit(function (sup) {
        return function () {
            return sup.apply(this, arguments).filter(function (child) {
                return !child.floating;
            });
        };
    })
});

module.exports = kind({
    name: "FitRows",
    kind: FittableRows,
    layoutKind: InPlaceRowsLayout
});

module.exports.InPlaceRowsLayout = InPlaceRowsLayout;
