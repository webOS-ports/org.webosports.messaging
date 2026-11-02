/**
 * Whether a scroller is at, or close enough to, its end that new content should keep it there.
 * Someone who has scrolled up to read older messages is left where they are.
 *
 * @param {{top: number, maxTop: number}} bounds - from Scroller.getScrollBounds()
 * @returns {boolean}
 */
var SLACK_PX = 48;

module.exports = function isNearBottom(bounds) {
    return !!bounds && bounds.maxTop - bounds.top <= SLACK_PX;
};
