/**
 * Which layout this device gets: the two-pane one, or the single pane a phone had.
 *
 * Mojo's Messaging put the list and the conversation side by side on the TouchPad and showed one
 * at a time on a phone, and that is the rule here: two panes on a tablet held in landscape,
 * one pane everywhere else - a tablet in portrait, and a phone in either orientation.
 *
 * It used to be decided by viewport width alone. Panels.isScreenNarrow() is `width <= 800` and
 * the 320px column was scoped to `min-width: 801px`, so the layout was really asking "is there
 * room" rather than "what is this". That gave the right answer on the devices to hand only by
 * luck: the MindPhone's panel is 480x800, so turned on its side it is exactly 800 wide and stays
 * single-pane by one pixel. Any phone with a wider landscape viewport got the tablet layout.
 *
 * So ask the device instead. PalmSystem.deviceInfo reports the panel in CSS pixels and does not
 * turn with the screen, which is what makes it usable as the form factor:
 *
 *     TouchPad   1024x768   tablet
 *     MindPhone   480x800   phone
 *     Q25         450x450   phone
 *
 * A tablet is a panel whose long edge is at least 1024 and whose short edge is at least 600:
 * enough for a 320px list column and a conversation beside it that is still worth reading.
 * Orientation comes from the live window, so it follows a rotation.
 */

var dom = require('enyo/dom'),
    Panels = require('layout/Panels');

var TABLET_LONG_EDGE = 1024,
    TABLET_SHORT_EDGE = 600,
    WIDE_CLASS = 'layout-wide';

var _tablet;    // the panel does not change under us, so this is worth keeping

/** The panel's size in CSS pixels, independent of how the device is being held. */
function panel() {
    if (window.PalmSystem && window.PalmSystem.deviceInfo) {
        try {
            var info = JSON.parse(window.PalmSystem.deviceInfo);
            if (info && info.screenWidth && info.screenHeight) {
                return [info.screenWidth, info.screenHeight];
            }
        } catch (e) {
            // fall through to the window below - a malformed deviceInfo is not worth throwing over
        }
    }
    // Off-device (a browser, the mock data) there is no panel to ask about, so take the window.
    return [window.screen ? window.screen.width : window.innerWidth,
            window.screen ? window.screen.height : window.innerHeight];
}

var formFactor = {

    /** Is this a tablet, rather than a phone? Fixed for the life of the app. */
    isTablet: function () {
        if (_tablet === undefined) {
            var p = panel();
            _tablet = Math.max(p[0], p[1]) >= TABLET_LONG_EDGE &&
                Math.min(p[0], p[1]) >= TABLET_SHORT_EDGE;
        }
        return _tablet;
    },

    /** Is the window landscape right now? */
    isLandscape: function () {
        return dom.getWindowWidth() > dom.getWindowHeight();
    },

    /**
     * Should the app show its wide layout - two panes side by side, and the tabs that only make
     * sense with room for them? True only on a tablet held in landscape.
     */
    isWide: function () {
        return this.isTablet() && this.isLandscape();
    },

    /**
     * Put the current answer where the stylesheet can see it, and keep Panels' own idea of a
     * narrow screen in step with ours.
     *
     * The class goes on the control the app passes in - MainView, an ancestor of everything the
     * rule touches - rather than on the body, because Enyo owns body.className and assigns it
     * wholesale as it sets up (enyo-body-fit and the rest), which silently dropped a class put
     * there first.
     *
     * Panels asks isNarrowDevice() in two places - isScreenNarrow(), which MainView uses to
     * decide whether selecting a thread should slide the conversation over the list, and
     * getNarrowClass(), which picks between a class gated on `max-width: 800px` and one that
     * is unconditional. Overriding the one predicate puts both of those on our rule instead of
     * the viewport's, and leaves the rest of Panels alone.
     *
     * @return {Boolean} whether the wide layout is in force.
     */
    apply: function (control) {
        var wide = this.isWide();
        if (control && control.addRemoveClass) {
            control.addRemoveClass(WIDE_CLASS, wide);
        }
        return wide;
    },

    /** Forget the cached form factor. Only the tests need this. */
    _forget: function () {
        _tablet = undefined;
    },

    /** Install the Panels override. Called once, before any Panels instance is built. */
    install: function () {
        var self = this;
        Panels.isNarrowDevice = function () {
            return !self.isWide();
        };
    },

    /** The class apply() sets, so a caller can scope its own rules to the same answer. */
    WIDE_CLASS: WIDE_CLASS
};

module.exports = formFactor;
