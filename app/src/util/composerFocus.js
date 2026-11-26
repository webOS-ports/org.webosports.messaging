/**
 * Keeps the message field focused across a tap on Send, with the keyboard's word in it.
 *
 * The keyboard holds the word being typed as its own pre-edit text, shown in the field but not
 * yet part of it. Tapping Send read and emptied the field while that word was still the
 * keyboard's; the tap then moved the focus to the button, and the browser, ending the pre-edit
 * as the field lost focus, wrote the word back into the empty field: ":)" or "OS" stayed after
 * the send. With the focus gone, the next key on a hardware keyboard went to the page rather
 * than the keyboard, and the message's first letter came out twice and without its capital.
 *
 * finishWord() ends the pre-edit before the field is read: blurred, the browser puts the word in
 * the field, and the keyboard lets go of it; focused again, typing carries on. keepFocus() is the
 * button's down handler: the press does not take the focus from the field.
 */

/** Puts the keyboard's word being typed into the field, which keeps its focus. */
function finishWord(textArea) {
    var node = textArea && textArea.hasNode && textArea.hasNode();
    if (!node || typeof document === "undefined" || document.activeElement !== node) {
        return;
    }
    node.blur();
    node.focus();
}

/** A button's ondown handler: pressing it leaves the focus where it is. */
function keepFocus(inSender, inEvent) {
    if (inEvent && inEvent.preventDefault) {
        inEvent.preventDefault();
    }
}

module.exports = { finishWord: finishWord, keepFocus: keepFocus };
