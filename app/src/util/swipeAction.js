/**
 * What a sideways swipe on a row asks for, from how far it went.
 *
 *   left swipe past MIN_PX, any length         -> "confirm" (reveal the delete prompt)
 *   right swipe past the delete distance       -> "confirm"
 *   short right swipe past MIN_PX              -> "reply" on rows that take replies,
 *                                                 "confirm" on the others
 *   anything shorter                           -> "cancel" (snap back)
 *
 * The delete distance is DELETE_RATIO of the row's width. A message row replies on a short right
 * swipe, as WhatsApp, Signal and Telegram do and as the legacy app's later versions did; a tap
 * already opens the reactions.
 *
 * @param {number} dx - horizontal drag distance in px, positive to the right
 * @param {number} width - the row's width in px
 * @param {boolean} replyEnabled - whether a short right swipe means reply
 * @returns {"confirm"|"reply"|"cancel"}
 */
var MIN_PX = 45;
var DELETE_RATIO = 0.55;

function swipeAction(dx, width, replyEnabled) {
    dx = dx || 0;
    var deletePx = Math.floor((width || 0) * DELETE_RATIO);

    if (dx <= -MIN_PX) {
        return "confirm";
    }
    if (dx < MIN_PX) {
        return "cancel";
    }
    if (!replyEnabled || dx >= deletePx) {
        return "confirm";
    }
    return "reply";
}

swipeAction.MIN_PX = MIN_PX;
swipeAction.DELETE_RATIO = DELETE_RATIO;

module.exports = swipeAction;
