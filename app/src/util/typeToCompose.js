/**
 * Whether a key pressed with a hardware keyboard, while nothing editable has focus, should go to
 * the message field. Mojo's composer took any typing on the conversation without a tap first; an
 * Enyo textarea only gets keys once it has focus, so the first letters were lost.
 *
 * Only printable characters move focus: Enter, arrows, Tab, Escape and the like keep their own
 * meaning, and anything with Ctrl, Alt or Meta held is a shortcut, not text.
 *
 * @param {{key: string, ctrlKey: boolean, altKey: boolean, metaKey: boolean,
 *          defaultPrevented: boolean, isComposing: boolean}} event - the keydown
 * @param {?Element} target - the element the key went to (event.target / document.activeElement)
 * @returns {boolean}
 */
function isEditable(el) {
    if (!el) {
        return false;
    }
    var tag = String(el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") {
        return true;
    }
    return !!el.isContentEditable;
}

module.exports = function typeToCompose(event, target) {
    if (!event || event.defaultPrevented || event.isComposing) {
        return false;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
        return false;
    }
    // A printable key names its character; the others have names ("Enter", "ArrowUp", ...).
    // Space is left out: on its own it is not the start of a message.
    var key = event.key;
    if (typeof key !== "string" || key.length === 0 || key === " ") {
        return false;
    }
    // One character, or one astral character (a surrogate pair).
    if (key.length > 2 || (key.length === 2 && !/^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(key))) {
        return false;
    }
    return !isEditable(target);
};
