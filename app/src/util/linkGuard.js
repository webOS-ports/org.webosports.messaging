/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * No link loads a page in the app's own card.
 *
 * The links in a message (ConversationItem.linkifyPreservingUrls) are opened by the bubble's tap
 * handler through the system (doOpenAttachment), which also cancels the tap. But the browser still
 * sends a click after a touch, at that place, to whatever is there by then: a menu that closed on
 * the tap - the paperclip's Take Photo - leaves its click to the message under it, and when that is
 * a link the webview followed it. A Signal place's maps link then opened Google's consent page in
 * the Messaging card, behind the Camera that Take Photo had launched.
 *
 * So every click inside a link is stopped from following it, at the document before anything else
 * sees it; the click itself still goes on, so the tap handlers work as before.
 */

/** The <a href> the node is in, or null. */
function linkOf(node) {
    for (var n = node; n && n.nodeType !== 9; n = n.parentNode) {
        if (n.nodeType === 1 && String(n.nodeName).toUpperCase() === "A" &&
                n.getAttribute && n.getAttribute("href")) {
            return n;
        }
    }
    return null;
}

function onClick(event) {
    if (event && linkOf(event.target)) {
        event.preventDefault();
    }
}

/** Installs the guard on doc (the page's document by default), once. */
function install(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc || doc.__messagingLinkGuard) {
        return false;
    }
    doc.__messagingLinkGuard = true;
    doc.addEventListener("click", onClick, true);
    return true;
}

module.exports = { install: install, linkOf: linkOf, onClick: onClick };
