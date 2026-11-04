/**
 * Keeps the message field empty after a send.
 *
 * The on-screen keyboard holds the word being typed as its own pre-edit text. When the app empties
 * the field on send, the keyboard does not know, and writes that word back into the empty field
 * straight after: "Hello from LuneOS Synergy" was sent and "Synergy" stayed in the field, then was
 * saved as the chat's draft and came back when the chat or a new message opened.
 *
 * After a send, the first input within ECHO_MS that is just the last word of the sent text is
 * that echo, and is dropped. Only the first input is looked at, so typing straight on is not touched.
 */

var ECHO_MS = 2000;

/** Whether `value` arriving `elapsed` ms after sending `sentText` is the keyboard's echo. */
function isEcho(value, sentText, elapsed) {
    if (!value || !sentText || elapsed < 0 || elapsed > ECHO_MS) {
        return false;
    }
    var word = value.trim();
    if (!word || /\s/.test(word) || word.length > sentText.length) {
        return false;
    }
    var sent = sentText.replace(/\s+$/, "");
    var start = sent.length - word.length;
    // The whole last word, not the end of one: "o" after "go" is new typing.
    return start >= 0 && sent.slice(start) === word && (start === 0 || /\s/.test(sent.charAt(start - 1)));
}

/** Call when the field has been emptied after sending `sentText`. */
function sent(textArea, sentText) {
    textArea._echoText = sentText || "";
    textArea._echoAt = Date.now();
}

/**
 * Call from the field's input handler. Returns true when it dropped the echo.
 */
function check(textArea) {
    if (!textArea._echoText) {
        return false;
    }
    var sentText = textArea._echoText;
    textArea._echoText = "";
    var node = textArea.hasNode();
    var value = node ? node.value : textArea.get("value");
    if (!isEcho(value, sentText, Date.now() - textArea._echoAt)) {
        return false;
    }
    // Blur first so the keyboard lets go of the word, then empty the field and take focus back.
    var focused = node && document.activeElement === node;
    if (focused) {
        node.blur();
    }
    textArea.set("value", "");
    if (node) {
        node.value = "";
        if (focused) {
            node.focus();
        }
    }
    return true;
}

module.exports = { isEcho: isEcho, sent: sent, check: check, ECHO_MS: ECHO_MS };
