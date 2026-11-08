/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A received picture, full screen, as WhatsApp, Telegram and Signal show one: a tap on it in the
 * chat grows it out of its bubble over a black backdrop. Pinch or double-tap zooms, a drag pans
 * the zoomed picture, and a drag down (not zoomed), the floating close button, a tap beside the
 * picture or back closes it, shrinking it into its bubble again. A drag sideways (not zoomed)
 * goes to the conversation's picture before or after, and the strip of them along the bottom
 * goes to any one. The other button opens it in Photos (or the browser, for a picture that is
 * only a link).
 *
 * Plain DOM, on document.body, outside the Enyo tree, so no panel's transform clips it and no
 * list refresh redraws it. The geometry (fit, zoom at a point, pan limits, when a drag closes) is
 * in plain functions, tested on their own (tests/unit/imageViewer.test.js).
 */

var $L = require('enyo/i18n').$L;

var MAX_SCALE = 4;
var DOUBLE_TAP_SCALE = 2.5;
var DOUBLE_TAP_MS = 300;
var TAP_SLOP = 12;
/* The second tap of a double tap in the chat lands on the viewer that the first one opened. */
var OPEN_GRACE_MS = 350;
var CLOSE_DRAG = 110;
var CLOSE_FLICK = 0.6;   // px/ms
var ANIM_MS = 200;

/** The size a w x h picture is drawn at to fill a W x H screen without cropping. */
function fit(w, h, W, H) {
    if (!(w > 0 && h > 0 && W > 0 && H > 0)) {
        return { w: W || 0, h: H || 0 };
    }
    var s = Math.min(W / w, H / h);
    return { w: w * s, h: h * s };
}

/**
 * How far the picture, drawn w x h on a W x H screen and scaled by s about its centre, may be
 * moved: none along a side it does not overfill, else as far as its edge meets the screen's.
 */
function clampPan(t, s, w, h, W, H) {
    var mx = Math.max(0, (w * s - W) / 2), my = Math.max(0, (h * s - H) / 2);
    return { x: mx ? Math.max(-mx, Math.min(mx, t.x)) : 0, y: my ? Math.max(-my, Math.min(my, t.y)) : 0 };
}

/**
 * The move that keeps what is under p (screen point, relative to the screen's centre) under it as
 * the scale goes from s to s2, with the picture moved by t.
 */
function zoomAt(p, t, s, s2) {
    return { x: p.x - (p.x - t.x) * s2 / s, y: p.y - (p.y - t.y) * s2 / s };
}

/** Whether a drag sideways by dx px, at vx px/ms when let go, on a W px screen, turns the page. */
function turnsOnRelease(dx, vx, W) {
    return Math.abs(dx) > W * 0.25 || (Math.abs(vx) > CLOSE_FLICK && Math.abs(dx) > 20);
}

/** Whether a drag down by dy px, at vy px/ms when let go, closes the viewer. */
function closesOnRelease(dy, vy) {
    return Math.abs(dy) > CLOSE_DRAG || (Math.abs(vy) > CLOSE_FLICK && Math.abs(dy) > 20);
}

var ICON_CLOSE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
var ICON_OPEN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

var view = null;   // the one viewer's state while open

function rectOf(node) {
    try {
        var r = node && node.isConnected !== false && node.getBoundingClientRect && node.getBoundingClientRect();
        return (r && r.width > 0 && r.height > 0) ? r : null;
    } catch (e) {
        return null;
    }
}

function build() {
    var root = document.createElement("div");
    root.className = "image-viewer";
    root.setAttribute("role", "dialog");
    root.innerHTML = '<div class="image-viewer-backdrop"></div><img class="image-viewer-image" alt="" draggable="false"/>' +
        '<button type="button" class="image-viewer-button image-viewer-open"></button>' +
        '<button type="button" class="image-viewer-button image-viewer-close"></button>' +
        '<div class="image-viewer-strip"></div>';
    var open = root.querySelector(".image-viewer-open"), close = root.querySelector(".image-viewer-close");
    open.innerHTML = ICON_OPEN;
    open.setAttribute("aria-label", $L("Open in Photos"));
    close.innerHTML = ICON_CLOSE;
    close.setAttribute("aria-label", $L("Close"));
    document.body.appendChild(root);
    return root;
}

function apply(v, animate) {
    var img = v.img;
    img.style.transition = animate ? "transform " + ANIM_MS + "ms cubic-bezier(.2,.8,.2,1)" : "none";
    img.style.transform = "translate(" + v.t.x + "px," + v.t.y + "px) scale(" + v.s + ")";
}

function layout(v) {
    v.W = window.innerWidth;
    v.H = window.innerHeight;
    var f = fit(v.img.naturalWidth || v.nw, v.img.naturalHeight || v.nh, v.W, v.H);
    v.w = f.w;
    v.h = f.h;
    var st = v.img.style;
    st.width = f.w + "px";
    st.height = f.h + "px";
    st.left = ((v.W - f.w) / 2) + "px";
    st.top = ((v.H - f.h) / 2) + "px";
}

/** The transform that lays the drawn picture over rect (the bubble's picture). */
function fromRect(v, rect) {
    var s = rect.width / v.w;
    return {
        s: s,
        t: { x: rect.left + rect.width / 2 - v.W / 2, y: rect.top + rect.height / 2 - v.H / 2 }
    };
}

function setBackdrop(v, opacity, animate) {
    var b = v.backdrop.style;
    b.transition = animate ? "opacity " + ANIM_MS + "ms linear" : "none";
    b.opacity = String(opacity);
    v.root.classList.toggle("image-viewer-chrome-hidden", opacity < 0.6);
}

function isOpen() {
    return !!view;
}

function fillStrip(v) {
    var strip = v.root.querySelector(".image-viewer-strip");
    strip.innerHTML = "";
    strip.style.display = (v.pictures.length > 1) ? "" : "none";
    if (v.pictures.length < 2) {
        return;
    }
    v.pictures.forEach(function (pic, i) {
        var b = document.createElement("img");
        b.className = "image-viewer-thumb";
        b.setAttribute("data-index", String(i));
        b.setAttribute("draggable", "false");
        b.setAttribute("loading", "lazy");
        b.alt = "";
        b.src = pic.url;
        strip.appendChild(b);
    });
}

function markStrip(v) {
    var thumbs = v.root.querySelectorAll(".image-viewer-thumb");
    for (var i = 0; i < thumbs.length; i++) {
        thumbs[i].classList.toggle("image-viewer-thumb-current", i === v.index);
    }
    var cur = thumbs[v.index];
    if (cur) {
        var strip = cur.parentNode;
        strip.scrollLeft = cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2;
    }
}

/** Show picture i, sliding in from the side dir (1: from the right, -1: from the left, 0: at once). */
function show(v, i, dir) {
    v.index = i;
    v.url = v.pictures[i].url;
    v.thumb = v.thumbFor ? v.thumbFor(v.pictures[i]) : null;
    v.nw = (v.thumb && v.thumb.naturalWidth) || 0;
    v.nh = (v.thumb && v.thumb.naturalHeight) || 0;
    v.img.src = v.url;
    layout(v);
    v.s = 1;
    v.t = { x: dir * v.W, y: 0 };
    apply(v, false);
    if (dir) {
        void v.root.offsetWidth;
    }
    v.t = { x: 0, y: 0 };
    apply(v, !!dir);
    markStrip(v);
}

/** Go to picture i, the current one sliding out to the side it goes. */
function go(v, i) {
    if (i < 0 || i >= v.pictures.length || i === v.index) {
        settle(v);
        return;
    }
    var dir = (i > v.index) ? 1 : -1;
    v.t = { x: -dir * v.W, y: 0 };
    v.s = 1;
    apply(v, true);
    clearTimeout(v.turnTimer);
    v.turnTimer = setTimeout(function () {
        if (view === v) {
            show(v, i, dir);
        }
    }, ANIM_MS * 0.6);
}

/**
 * Show a picture over everything. pictures: [{ url }] of the conversation (util/threadPictures),
 * index: the one tapped. thumb: the picture tapped in the chat, to grow out of. thumbFor(picture):
 * its picture in the chat, if drawn, to shrink back into. onOpenElsewhere(url): the open button.
 */
function open(pictures, index, thumb, onOpenElsewhere, thumbFor) {
    if (view) {
        close(true);
    }
    var root = document.querySelector(".image-viewer") || build();
    var url = pictures[index].url;
    var v = view = {
        root: root, url: url, thumb: thumb, onOpenElsewhere: onOpenElsewhere,
        pictures: pictures, index: index, thumbFor: thumbFor,
        img: root.querySelector(".image-viewer-image"),
        backdrop: root.querySelector(".image-viewer-backdrop"),
        s: 1, t: { x: 0, y: 0 }, pointers: {}, openedAt: Date.now(),
        nw: (thumb && thumb.naturalWidth) || 0, nh: (thumb && thumb.naturalHeight) || 0
    };
    v.img.onload = function () {
        if (view === v && !v.gesture) {
            layout(v);
            v.t = clampPan(v.t, v.s, v.w, v.h, v.W, v.H);
            apply(v, false);
        }
    };
    v.img.src = url;
    root.style.display = "block";
    fillStrip(v);
    layout(v);

    var r = rectOf(thumb);
    if (r) {
        var from = fromRect(v, r);
        v.s = from.s;
        v.t = from.t;
    } else {
        v.s = 0.92;
    }
    setBackdrop(v, 0, false);
    apply(v, false);
    // Force the start state to be drawn, then move to the full one.
    void root.offsetWidth;
    v.s = 1;
    v.t = { x: 0, y: 0 };
    apply(v, true);
    setBackdrop(v, 1, true);
    markStrip(v);
    attach(v);
}

/** Close; true when there was something to close (back uses it). */
function close(now) {
    var v = view;
    if (!v) {
        return false;
    }
    view = null;
    detach(v);
    var done = function () {
        if (!view) {
            v.root.style.display = "none";
            v.img.removeAttribute("src");
        }
    };
    if (now) {
        done();
        return true;
    }
    var r = rectOf(v.thumb);
    if (r && v.s <= 1.01) {
        var to = fromRect(v, r);
        v.s = to.s;
        v.t = to.t;
    } else {
        v.s = Math.max(0.85, v.s * 0.9);
    }
    apply(v, true);
    setBackdrop(v, 0, true);
    setTimeout(done, ANIM_MS);
    return true;
}

function point(e) {
    return { x: e.clientX - window.innerWidth / 2, y: e.clientY - window.innerHeight / 2 };
}

function onDown(e) {
    var v = view;
    if (!v || e.target.closest(".image-viewer-button, .image-viewer-strip")) {
        return;
    }
    e.preventDefault();
    try { v.root.setPointerCapture(e.pointerId); } catch (x) {}
    v.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(v.pointers);
    if (ids.length === 1) {
        v.gesture = { kind: "tap", start: point(e), t0: { x: v.t.x, y: v.t.y }, time: Date.now(), last: point(e), lastTime: Date.now(), vx: 0, vy: 0, onImage: e.target === v.img };
    } else if (ids.length === 2) {
        var a = v.pointers[ids[0]], b = v.pointers[ids[1]];
        v.gesture = {
            kind: "pinch", s0: v.s, t0: { x: v.t.x, y: v.t.y },
            d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            m0: { x: (a.x + b.x) / 2 - v.W / 2, y: (a.y + b.y) / 2 - v.H / 2 }
        };
    }
}

function onMove(e) {
    var v = view;
    if (!v || !v.pointers[e.pointerId] || !v.gesture) {
        return;
    }
    e.preventDefault();
    v.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var g = v.gesture, p = point(e);
    if (g.kind === "pinch") {
        var ids = Object.keys(v.pointers);
        if (ids.length < 2) { return; }
        var a = v.pointers[ids[0]], b = v.pointers[ids[1]];
        var s2 = Math.max(0.8, Math.min(MAX_SCALE, g.s0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0));
        var m = { x: (a.x + b.x) / 2 - v.W / 2, y: (a.y + b.y) / 2 - v.H / 2 };
        var t = zoomAt(g.m0, g.t0, g.s0, s2);
        v.s = s2;
        v.t = { x: t.x + m.x - g.m0.x, y: t.y + m.y - g.m0.y };
        apply(v, false);
        return;
    }
    var dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (g.kind === "tap" && Math.hypot(dx, dy) > TAP_SLOP) {
        g.kind = (v.s > 1.01) ? "pan" : (Math.abs(dx) > Math.abs(dy) && v.pictures.length > 1) ? "turn" : "dismiss";
    }
    var now = Date.now();
    if (now > g.lastTime) {
        g.vx = (p.x - g.last.x) / (now - g.lastTime);
        g.vy = (p.y - g.last.y) / (now - g.lastTime);
    }
    g.last = p;
    g.lastTime = now;
    if (g.kind === "pan") {
        v.t = clampPan({ x: g.t0.x + dx, y: g.t0.y + dy }, v.s, v.w, v.h, v.W, v.H);
        apply(v, false);
    } else if (g.kind === "turn") {
        // Past the first or the last, it gives a little and comes back.
        var end = (dx > 0 && v.index === 0) || (dx < 0 && v.index === v.pictures.length - 1);
        v.t = { x: end ? dx * 0.3 : dx, y: 0 };
        apply(v, false);
    } else if (g.kind === "dismiss") {
        v.t = { x: dx * 0.3, y: dy };
        apply(v, false);
        setBackdrop(v, Math.max(0.2, 1 - Math.abs(dy) / 350), false);
    }
}

function onUp(e) {
    var v = view;
    if (!v || !v.pointers[e.pointerId]) {
        return;
    }
    delete v.pointers[e.pointerId];
    var g = v.gesture;
    if (!g) {
        return;
    }
    var left = Object.keys(v.pointers).length;
    if (g.kind === "pinch") {
        if (left === 0) {
            v.gesture = null;
            settle(v);
        } else {
            // One finger still down: it pans from here.
            var id = Object.keys(v.pointers)[0], q = v.pointers[id];
            var p = { x: q.x - v.W / 2, y: q.y - v.H / 2 };
            v.gesture = { kind: "pan", start: p, t0: { x: v.t.x, y: v.t.y }, last: p, lastTime: Date.now(), vy: 0 };
        }
        return;
    }
    if (left) {
        return;
    }
    v.gesture = null;
    if (g.kind === "dismiss") {
        if (closesOnRelease(v.t.y, g.vy)) {
            close();
        } else {
            v.t = { x: 0, y: 0 };
            apply(v, true);
            setBackdrop(v, 1, true);
        }
    } else if (g.kind === "turn") {
        if (turnsOnRelease(v.t.x, g.vx, v.W)) {
            go(v, v.index + (v.t.x < 0 ? 1 : -1));
        } else {
            settle(v);
        }
    } else if (g.kind === "pan") {
        settle(v);
    } else if (g.kind === "tap") {
        tapped(v, g.start, g.onImage);
    }
}

/** Back within the limits: no smaller than the screen, no further than the edges. */
function settle(v) {
    if (v.s < 1) {
        v.s = 1;
        v.t = { x: 0, y: 0 };
    }
    v.t = clampPan(v.t, v.s, v.w, v.h, v.W, v.H);
    apply(v, true);
}

function tapped(v, p, onImage) {
    var now = Date.now();
    if (now - v.openedAt < OPEN_GRACE_MS) {
        return;
    }
    var last = v.lastTap;
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(p.x - last.p.x, p.y - last.p.y) < 40) {
        v.lastTap = null;
        clearTimeout(v.tapTimer);
        if (v.s > 1.01) {
            v.s = 1;
            v.t = { x: 0, y: 0 };
        } else {
            v.t = clampPan(zoomAt(p, v.t, v.s, DOUBLE_TAP_SCALE), DOUBLE_TAP_SCALE, v.w, v.h, v.W, v.H);
            v.s = DOUBLE_TAP_SCALE;
        }
        apply(v, true);
        return;
    }
    v.lastTap = { time: now, p: p };
    // A single tap beside the picture closes it, once it is clear no second tap follows.
    if (!onImage && v.s <= 1.01) {
        clearTimeout(v.tapTimer);
        v.tapTimer = setTimeout(function () {
            if (view === v && v.lastTap && v.lastTap.time === now) {
                close();
            }
        }, DOUBLE_TAP_MS);
    }
}

function onClick(e) {
    var v = view;
    if (!v) {
        return;
    }
    var thumb = e.target.closest(".image-viewer-thumb");
    if (thumb) {
        e.preventDefault();
        e.stopPropagation();
        go(v, parseInt(thumb.getAttribute("data-index"), 10));
        return;
    }
    var button = e.target.closest(".image-viewer-button");
    if (!button) {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (button.classList.contains("image-viewer-close")) {
        close();
    } else if (v.onOpenElsewhere) {
        var url = v.url, cb = v.onOpenElsewhere;
        close(true);
        cb(url);
    }
}

function onKey(e) {
    if (!view) {
        return;
    }
    if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        close();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        go(view, view.index + (e.key === "ArrowRight" ? 1 : -1));
    }
}

function onResize() {
    var v = view;
    if (v) {
        layout(v);
        v.t = clampPan(v.t, v.s, v.w, v.h, v.W, v.H);
        apply(v, false);
    }
}

function attach(v) {
    v.root.addEventListener("pointerdown", onDown);
    v.root.addEventListener("pointermove", onMove);
    v.root.addEventListener("pointerup", onUp);
    v.root.addEventListener("pointercancel", onUp);
    v.root.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
}

function detach(v) {
    clearTimeout(v.tapTimer);
    clearTimeout(v.turnTimer);
    v.root.removeEventListener("pointerdown", onDown);
    v.root.removeEventListener("pointermove", onMove);
    v.root.removeEventListener("pointerup", onUp);
    v.root.removeEventListener("pointercancel", onUp);
    v.root.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
}

module.exports = {
    open: open,
    close: close,
    isOpen: isOpen,
    fit: fit,
    clampPan: clampPan,
    zoomAt: zoomAt,
    closesOnRelease: closesOnRelease,
    turnsOnRelease: turnsOnRelease,
    current: function () { return view ? { index: view.index, url: view.url, count: view.pictures.length, fromBubble: !!view.thumb } : null; }
};
