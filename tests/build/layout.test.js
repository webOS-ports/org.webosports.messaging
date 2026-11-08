/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * The PACKED app laid out in a real browser engine, at a phone's window size.
 *
 * Whether a list can scroll is a fact about the laid-out page: a Scroller only scrolls when
 * FittableRows has given it less height than its rows need. The lists once stopped scrolling
 * altogether because MainView's fit child was sized taller than the screen - an absolutely
 * placed menu anchor declared after it made FittableRows add the child's own height back on each
 * reflow - so every list grew to its content and had nothing left to scroll. Nothing in the
 * sources looks wrong for that; only a layout pass shows it.
 *
 * Runs the packed page in headless Chromium (CHROMIUM, or `chromium` on the PATH) through its
 * inspector, with tests/device/cdp.js. Without a Chromium it skips rather than fails.
 *
 * Point MESSAGING_PACK_DIR at a directory produced by tests/pack.sh.
 */

var { describe, it, before, after } = require('node:test');
var assert = require('node:assert/strict');
var { spawn, execFileSync } = require('node:child_process');
var fs = require('node:fs');
var path = require('node:path');
var cdp = require('../device/cdp');

var PACK = process.env.MESSAGING_PACK_DIR;
var CHROMIUM = process.env.CHROMIUM || 'chromium';

// The Mindphone's card: a 480x800 panel less the status bar, as the device reports it.
var WIDTH = 480, HEIGHT = 723;

function haveChromium() {
    try {
        execFileSync(CHROMIUM, ['--version'], { stdio: 'ignore', timeout: 30000 });
        return true;
    } catch (e) {
        return false;
    }
}

var skip = !haveChromium() && ('no ' + CHROMIUM + ' to lay the page out in; set CHROMIUM');
var chrome, session;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/** Starts Chromium on a free inspector port and resolves to that port. */
function startChromium(profile) {
    chrome = spawn(CHROMIUM, ['--headless=new', '--remote-debugging-port=0',
        '--user-data-dir=' + profile, '--no-first-run', '--allow-file-access-from-files',
        'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    return new Promise(function (resolve, reject) {
        var seen = '';
        var timer = setTimeout(function () {
            reject(new Error('Chromium printed no inspector port: ' + seen));
        }, 30000);
        chrome.stderr.on('data', function (d) {
            seen += d;
            var m = /DevTools listening on ws:\/\/[^:]+:(\d+)/.exec(seen);
            if (m) { clearTimeout(timer); resolve(parseInt(m[1], 10)); }
        });
        chrome.on('error', function (e) { clearTimeout(timer); reject(e); });
    });
}

/** Heights of the controls the layout is about, by their enyo ids. */
function measure() {
    return session.evaluate('(function () {' +
        'function h(id) { var n = document.getElementById(id);' +
        '  return n ? { client: n.clientHeight, scroll: n.scrollHeight } : null; }' +
        'return { window: window.innerHeight, main: h("app_mainView"),' +
        '  views: h("app_mainView_views"),' +
        '  threads: h("app_mainView_messaging_threadList_scroller") };' +
        '})()');
}

describe('the packed page laid out at phone size', { skip: skip }, function () {
    before(async function () {
        assert.ok(PACK, 'set MESSAGING_PACK_DIR to a directory from tests/pack.sh');
        // Next to the pack rather than in a temp directory: it is a scratch profile for one run.
        var profile = path.join(path.dirname(PACK), 'chromium-profile');
        fs.rmSync(profile, { recursive: true, force: true });
        fs.mkdirSync(profile, { recursive: true });
        var port = await startChromium(profile);
        session = await cdp.attach(await cdp.waitForTarget(port, 'about:blank', 20000));
        await session.send('Emulation.setDeviceMetricsOverride',
            { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true });
        await session.send('Page.navigate',
            { url: 'file://' + path.join(PACK, 'index.html') });
        // The app renders from enyo/ready; wait for MainView rather than for a fixed time.
        for (var i = 0; i < 60; i++) {
            if (await session.evaluate('!!document.getElementById("app_mainView_views")')) { break; }
            await sleep(250);
        }
    });

    after(function () {
        if (session) { session.close(); }
        if (chrome) { chrome.kill(); }
    });

    it('renders the main view at the window size', async function () {
        var m = await measure();
        assert.ok(m.main, 'no main view in the page');
        assert.equal(m.main.client, HEIGHT);
    });

    // Each reflow made the views a screen taller, so check after a few of them, as a card gets
    // when the keyboard or the status bar changes its height.
    it('keeps the fit child inside the main view, reflow after reflow', async function () {
        for (var i = 0; i < 3; i++) {
            await session.evaluate('(window.dispatchEvent(new Event("resize")), true)');
            await sleep(300);
            var m = await measure();
            assert.ok(m.views, 'no views panel in the page');
            assert.ok(m.views.client <= m.main.client,
                'views is ' + m.views.client + 'px tall in a ' + m.main.client +
                'px main view after ' + (i + 1) + ' resize(s)');
        }
    });

    // On a phone, back from a server's channels has to return to the server list: it used to do
    // nothing there, and only the footer's Servers button got out.
    it('goes back from a server\'s channels to the server list', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, Signals = require("enyo/Signals");' +
            'var messaging = $.app_mainView_messaging, servers = $.app_mainView_messaging_serverList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'messaging.menuToggle(null, 3);' +
            'for (var i = 0; i < 20 && !servers.collection.length; i++) { await wait(100); }' +
            'if (!servers.collection.length) { return "no servers in the mock data"; }' +
            'servers.selectServer(null, { index: 0 });' +
            'var drilled = servers.isDrilledIn() && servers.$.drill.getIndex();' +
            'Signals.send("onbackgesture", {});' +
            'var r = { drilled: drilled, after: servers.$.drill.getIndex(), still: servers.isDrilledIn(),' +
            '  backBtn: messaging.$.serverBackBtn.getShowing(), tab: messaging.$.pane.getIndex() };' +
            'messaging.menuToggle(null, 0);' +   // the tests after this one measure the Chats tab
            'await wait(300);' +
            'return r;' +
            '})()');
        assert.deepEqual(r, { drilled: 1, after: 0, still: false, backBtn: false, tab: 3 });
    });

    // The app menu opens from the app's name in the status bar (`menubutton`), so the footer
    // carries no menu button of its own.
    it('opens the app menu from the status bar, with no menu button in the footer', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, Signals = require("enyo/Signals");' +
            'var main = $.app_mainView, footer = document.querySelector(".messaging-footer");' +
            'var labels = Array.prototype.map.call(footer.querySelectorAll(".onyx-button"),' +
            '  function (n) { return n.textContent.trim(); });' +
            'var buttons = labels.length;' +
            'var inFooter = labels.filter(function (t) { return t === "\u2261"; });' +
            'Signals.send("onmenubutton", {});' +
            'await new Promise(function (r) { setTimeout(r, 300); });' +
            'var shown = main.$.appMenu.showing;' +
            'main.$.appMenu.hide();' +
            'return { menuButtons: inFooter.length, buttons: buttons > 0, menuOpens: shown };' +
            '})()');
        assert.deepEqual(r, { menuButtons: 0, buttons: true, menuOpens: true });
    });

    it('gives the thread list no more height than the screen has', async function () {
        var m = await measure();
        assert.ok(m.threads, 'no thread list scroller in the page');
        assert.ok(m.threads.client > 0, 'the thread list has no height at all');
        assert.ok(m.threads.client < m.window,
            'the thread list is ' + m.threads.client + 'px tall in a ' + m.window +
            'px window, so it can never scroll');
    });

    // Find in Chat, from the magnifier in the chat's header between its name and the service it
    // goes out on, not from the app menu: the newest match first, older from there, and back
    // closes the bar before it leaves the chat; the magnifier closes it too.
    it('finds in a chat, newest match first, and closes on back', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, Signals = require("enyo/Signals");' +
            'var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'main.selectThread(null, (await new Promise(function (res) {' +
            '  var t = null; $.app_mainView_messaging_threadList.collection.forEach(function (m) {' +
            '    if (m.attributes._id === "thread-family") { t = m.attributes; } }); res(t); })));' +
            'for (var i = 0; i < 20 && !(chat.messages && chat.messages.length); i++) { await wait(100); }' +
            'Signals.send("onmenubutton", {}); await wait(300);' +
            'var inMenu = Array.prototype.some.call(main.$.appMenu.hasNode().querySelectorAll(".onyx-menu-item"),' +
            '  function (n) { return n.offsetParent && /Find in Chat/.test(n.textContent); });' +
            'main.$.appMenu.hide();' +
            'var box = function (c) { return c.hasNode().getBoundingClientRect(); };' +
            'var name = box(chat.$.header), glass = box(chat.$.searchButton), service = box(chat.$.transportButton);' +
            'var bar = box(chat.$.headerBar);' +
            'var placed = glass.width > 0 && glass.left >= name.right - 1 && glass.right <= service.left + 1 &&' +
            '  glass.top >= bar.top && glass.bottom <= bar.bottom;' +
            // Right of the name and left of the camera and the phone, when the chat has calls.
            'var calls = [chat.$.videoCallButton.showing, chat.$.phoneCallButton.showing];' +
            'chat.$.videoCallButton.show(); chat.$.phoneCallButton.show(); await wait(50);' +
            'glass = box(chat.$.searchButton); name = box(chat.$.header);' +
            'var beforeCalls = glass.left >= name.right - 1 && glass.right <= box(chat.$.videoCallButton).left + 1 &&' +
            '  box(chat.$.videoCallButton).right <= box(chat.$.phoneCallButton).left + 1;' +
            'chat.$.videoCallButton.setShowing(calls[0]); chat.$.phoneCallButton.setShowing(calls[1]);' +
            'chat.toggleSearch(); await wait(300);' +
            'var opened = chat.$.searchBar.showing;' +
            'chat.searchChanged(null, { value: "BRING" }); await wait(100);' +
            'var count = chat.$.searchCount.getContent();' +
            'var hit = document.querySelector(".search-hit");' +
            'var newest = !!hit && /jacket/.test(hit.textContent);' +
            'chat.searchOlder(); await wait(100);' +
            'var older = chat.$.searchCount.getContent();' +
            'hit = document.querySelector(".search-hit");' +
            'var olderHit = !!hit && /dessert/.test(hit.textContent);' +
            'Signals.send("onbackgesture", {}); await wait(300);' +
            'var closed = !chat.$.searchBar.showing && !document.querySelector(".search-hit");' +
            'chat.toggleSearch(); await wait(100); var reopened = chat.$.searchBar.showing;' +
            'chat.toggleSearch(); await wait(100); var toggled = !chat.$.searchBar.showing;' +
            'return { inMenu: inMenu, placed: placed, beforeCalls: beforeCalls, opened: opened, reopened: reopened, toggled: toggled,' +
            '  count: count, newest: newest, older: older, olderHit: olderHit,' +
            '  closed: closed,' +
            '  chatStill: chat.chatThread && chat.chatThread._id };' +
            '})()');
        assert.deepEqual(r, { inMenu: false, placed: true, beforeCalls: true, opened: true, reopened: true, toggled: true,
            count: '2 of 2', newest: true, older: '1 of 2', olderHit: true,
            closed: true, chatStill: 'thread-family' });
    });

    // Onyx's popups are dark by default, so every new dialog came out dark until it was restyled.
    // Light is the default here, as in Enyo 1.0; only the app menu is dark.
    it('draws a popup light unless it is the app menu', async function () {
        var r = await session.evaluate('(function () {' +
            'var look = function (cls) { var d = document.createElement("div"); d.className = cls;' +
            '  document.body.appendChild(d); var s = getComputedStyle(d);' +
            '  var v = { color: s.color, image: s.backgroundImage !== "none" }; d.remove(); return v; };' +
            'return { popup: look("onyx-popup"), dialog: look("onyx-popup onyx-popup-decorator"),' +
            '  appMenu: look("onyx-popup onyx-menu app-menu").color };' +
            '})()');
        assert.deepEqual(r, { popup: { color: 'rgb(34, 34, 34)', image: true },
            dialog: { color: 'rgb(34, 34, 34)', image: true }, appMenu: 'rgb(255, 255, 255)' });
    });

    // The message menu as the legacy app's (PopupSelect.openAtCenter): in the middle of the
    // screen, every row on it, light as Enyo 1.0's menus. At the finger, a message low down put
    // it off the bottom, and Onyx's 200px menu scroller cut Delete in half.
    it('opens the message menu whole, in the middle, light', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            '$.app_mainView.selectThread(null, (await new Promise(function (res) {' +
            '  var t = null; $.app_mainView_messaging_threadList.collection.forEach(function (m) {' +
            '    if (m.attributes._id === "thread-family") { t = m.attributes; } }); res(t); })));' +
            'for (var i = 0; i < 20 && !(chat.messages && chat.messages.length); i++) { await wait(100); }' +
            'chat.selectedMessage = chat.messages[chat.messages.length - 1];' +
            'chat.reactMore(null, { pageX: 200, pageY: innerHeight - 20 }); await wait(300);' +
            'var n = chat.$.messageMenu.hasNode(), b = n.getBoundingClientRect();' +
            'var rows = Array.prototype.filter.call(n.querySelectorAll(".onyx-menu-item"), function (x) {' +
            '  return !/divider/.test(x.className) && x.offsetParent !== null; });' +
            'var whole = rows.every(function (x) { var q = x.getBoundingClientRect(); return q.height > 30 && q.top >= b.top && q.bottom <= b.bottom; });' +
            'var mid = Math.abs((b.top + b.bottom) / 2 - innerHeight / 2) <= 2;' +
            'var bg = getComputedStyle(n).backgroundColor;' +
            'chat.$.messageMenu.hide();' +
            'var app = $.app_mainView.$.appMenu; app.show(); await wait(200);' +
            'var help = app.$.helpMenuItem ? app.$.helpMenuItem.hasNode().getBoundingClientRect() : $.app_mainView.$.helpMenuItem.hasNode().getBoundingClientRect();' +
            'var box = app.hasNode().getBoundingClientRect();' +
            'var appBg = getComputedStyle(app.hasNode()).backgroundColor; app.hide();' +
            'return { rows: rows.length, whole: whole, onScreen: b.top >= 0 && b.bottom <= innerHeight, mid: mid,' +
            '  light: bg === "rgb(217, 217, 217)", helpShown: help.height > 0 && help.bottom <= box.bottom + 1 && help.bottom <= innerHeight,' +
            '  appDark: appBg !== "rgb(217, 217, 217)" };' +
            '})()');
        assert.deepEqual(r, { rows: 5, whole: true, onScreen: true, mid: true, light: true, helpShown: true, appDark: true });
    });

    // Holding a chat: pin it over the others, archive it behind "Archived chats", and back out of
    // the archive (util/chatFlags). Each choice is a merge on the chatthread.
    it('pins a chat to the top and archives one out of the list', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, Signals = require("enyo/Signals");' +
            'var tl = $.app_mainView_messaging_threadList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'var ids = function () { return tl.collection.map(function (m) { return m.attributes._id; }); };' +
            'var choose = async function (id, change) {' +
            '  var held = tl.collection.models.filter(function (m) { return m.attributes._id === id; })[0];' +
            '  if (!held) { throw new Error("no " + id + " in " + ids().join() + " filter=" + tl.filterString + " arch=" + tl.inArchive); }' +
            '  tl.heldRecord = held.attributes;' +
            '  tl.chatOptionTapped({ change: change }); await wait(300); };' +
            // From the list: on one pane an open chat covers it, and back would leave that first.
            'if ($.app_mainView.$.slidingGroup.getIndex() !== 0) { Signals.send("onbackgesture", {}); await wait(600); }' +
            'var start = ids(), pin = start[3], arch = start[1];' +
            'await choose(pin, { pinned: true });' +
            'var divider = document.querySelector(".threadList-Divider");' +
            'var pinned = { first: ids()[0] === pin, caption: divider && divider.offsetHeight ? divider.textContent : null };' +
            'await choose(arch, { archived: true });' +
            'var bar = tl.$.archiveBar;' +
            'var archived = { gone: ids().indexOf(arch) < 0, bar: bar.showing && bar.hasNode().textContent.indexOf("(1)") >= 0 };' +
            'tl.toggleArchive(); await wait(300);' +
            'var inside = ids();' +
            'Signals.send("onbackgesture", {}); await wait(300);' +
            'var back = { out: !tl.inArchive, count: ids().length === start.length - 1 };' +
            // Unarchived from the archive, which closes once it is empty.
            'tl.toggleArchive(); await wait(300);' +
            'await choose(arch, { archived: false }); await choose(pin, { pinned: false });' +
            'return { pinned: pinned, archived: archived, inside: inside.join() === arch, back: back,' +
            '  restored: ids().join() === start.join(), barAfter: bar.showing, archiveClosed: !tl.inArchive };' +
            '})()');
        assert.deepEqual(r, { pinned: { first: true, caption: 'Pinned' }, archived: { gone: true, bar: true },
            inside: true, back: { out: true, count: true }, restored: true, barAfter: false, archiveClosed: true });
    });

    // A finger, through the touch events: a tap or a short press reacts, a half-second hold starts
    // selecting with that message, and lifting after the hold is not a tap that picks it off again.
    it('reacts on a tap and selects on a hold', async function () {
        var at = async function (k) {
            // The k-th plain text message from the end, at its text: a tap on a file or link opens
            // it, one on a quote jumps to it, and one on the sender's name opens a chat with them.
            return session.evaluate('(function () { var c = require("enyo/dispatcher").$.app_mainView_chatView_conversationList;' +
                ' var rows = c.$.list.getClientControls().filter(function (row) { var m = row.model && row.model.attributes;' +
                '  return m && !m.filePath && !m.deleted && !m.quotedText && !/[<&]/.test(m.messageText || "") && m.messageText; });' +
                ' var row = rows[rows.length - ' + k + '];' +
                ' if (!row) { throw new Error("plain rows " + rows.length + " of " + c.$.list.getClientControls().length); }' +
                ' var r = row.hasNode().querySelector("[id$=_messageText]").getBoundingClientRect();' +
                ' if (r.left < 0 || r.right > innerWidth) { throw new Error("off screen " + r.left + ".." + r.right); }' +
                ' return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) }; })()');
        };
        var touch = async function (p, ms) {
            await session.send('Input.dispatchTouchEvent', { type: 'touchStart',
                touchPoints: [{ x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1, id: 1 }] });
            await sleep(ms);
            await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await sleep(300);
        };
        var state = function () {
            return session.evaluate('(function () { var c = require("enyo/dispatcher").$.app_mainView_chatView_conversationList;' +
                ' var s = { selecting: !!c._selected, picked: c._selected ? c.selectedMessages().length : 0, react: !!c.$.reactRow.showing };' +
                ' c.dismissPopups(); return s; })()');
        };
        await session.evaluate('(async function () { var $ = require("enyo/dispatcher").$, c = $.app_mainView_chatView_conversationList;' +
            ' c.endSelection();' +
            ' $.app_mainView.selectThread(null, $.app_mainView_messaging_threadList.collection.models.filter(function (m) {' +
            '  return m.attributes._id === "thread-anna"; })[0].attributes);' +
            // Until the Anna chat's own rows are drawn: the last chat's messages linger until then.
            ' for (var i = 0; i < 40 && !(c.chatThread && c.chatThread._id === "thread-anna" &&' +
            '   c.$.list.getClientControls().length && c.collection.at(0).attributes.conversations.indexOf("thread-anna") >= 0); i++) {' +
            '  await new Promise(function (r) { setTimeout(r, 100); }); }' +
            ' return 1; })()');
        // On one pane the chat slides in over the list: touch it once it is there.
        await sleep(1500);
        await touch(await at(1), 40);
        var tap = await state();
        await touch(await at(1), 300);
        var short = await state();
        await touch(await at(1), 800);
        var hold = await state();
        await touch(await at(2), 40);
        var more = await state();
        await session.evaluate('(require("enyo/dispatcher").$.app_mainView_chatView_conversationList.endSelection(), 1)');
        assert.deepEqual({ tap: tap, short: short, hold: hold, more: more }, {
            tap: { selecting: false, picked: 0, react: true },
            short: { selecting: false, picked: 0, react: true },
            hold: { selecting: true, picked: 1, react: false },
            more: { selecting: true, picked: 2, react: false }
        });
    });

    // Typing and reading (util/chatPresence): opening a chat says it was read; typing in it says
    // so once, and "none" once it is sent; a buddy typing to us shows as dots under the last
    // message until it stops. With the mock db the calls are kept on mockDb.presenceCalls instead of sent.
    it('says a chat was read, passes our typing on, and shows theirs', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, mockDb = require("src/data/mockDb");' +
            'var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'var anna = null; $.app_mainView_messaging_threadList.collection.forEach(function (m) {' +
            '  if (m.attributes._id === "thread-anna") { anna = m.attributes; } });' +
            // From another chat, so opening Anna's is a change of chat.
            'var other = null; $.app_mainView_messaging_threadList.collection.forEach(function (m) {' +
            '  if (m.attributes._id === "thread-sam") { other = m.attributes; } });' +
            'main.selectThread(null, other); await wait(300);' +
            'mockDb.presenceCalls = [];' +
            'main.selectThread(null, anna);' +
            'for (var i = 0; i < 20 && !(chat.chatThread && chat.chatThread._id === "thread-anna"); i++) { await wait(100); }' +
            'await wait(300);' +
            'var read = mockDb.presenceCalls.filter(function (c) { return c.payload.usernameTo === "anna.k"; });' +
            'mockDb.presenceCalls = [];' +
            'chat.$.richText.set("value", "h"); chat.composerInput();' +
            'chat.$.richText.set("value", "he"); chat.composerInput();' +
            'var typed = mockDb.presenceCalls.slice();' +
            'chat.$.richText.set("value", ""); chat.composerInput();' +
            'var cleared = mockDb.presenceCalls.slice(typed.length);' +
            'var account = require("src/util/appState").accountService.getAccount("type_telegram");' +
            'var ev = function (state) { return { serviceName: "type_telegram", username: account.username, from: "anna.k", state: state }; };' +
            'chat.revealListBottom(); await wait(100);' +
            'main.gotTyping(null, ev("typing")); await wait(300);' +
            'var header = chat.$.header.hasNode().textContent;' +
            'var bubble = chat.$.typingBubble;' +
            'var shown = bubble.showing;' +
            // Under the last message, and in view: the chat was at its newest message.
            'var rows = chat.$.list.hasNode().querySelectorAll(".chat-balloon");' +
            'var last = rows[rows.length - 1].getBoundingClientRect(), bb = bubble.hasNode().getBoundingClientRect();' +
            'var sb = chat.$.scroller.hasNode().getBoundingClientRect();' +
            'var dots = bubble.hasNode().querySelector(".conversation-typing-bubble").getBoundingClientRect();' +
            'var place = { below: bb.top >= last.bottom - 0.5, inView: bb.bottom <= sb.bottom + 0.5 && bb.top >= sb.top,' +
            '  small: dots.width > 20 && dots.width < 120, left: dots.left < sb.left + sb.width / 2 };' +
            // Drawn as a received message is: their picture where its picture is, the bubble where
            // its bubble is and as tall, with the tail.
            'var recv = chat.$.list.hasNode().querySelectorAll(".chat-balloon-received");' +
            'var rb = recv[recv.length - 1].getBoundingClientRect();' +
            'var rimg = recv[recv.length - 1].closest(".chat-balloon").querySelector(".contact-image").getBoundingClientRect();' +
            'var img = chat.$.typingImage.hasNode(), ib = img.getBoundingClientRect();' +
            'var dotsNode = bubble.hasNode().querySelector(".conversation-typing-bubble");' +
            'var tail = getComputedStyle(dotsNode, ":after");' +
            'var looks = { bubbleX: Math.abs(dots.left - rb.left) < 1, imageX: Math.abs(ib.left - rimg.left) < 1,' +
            '  imageSize: Math.round(ib.width) === Math.round(rimg.width), picture: img.getAttribute("src") === recv[recv.length - 1].closest(".chat-balloon").querySelector(".contact-image").getAttribute("src"),' +
            '  minHeight: dots.height >= 35, tail: /received-shape/.test(tail.backgroundImage) && tail.left === "-8px" };' +
            // Their picture comes in while the dots show: the dots' row takes it as the rows do.
            'var keptImage = chat.chatThread.personImage; chat.chatThread.personImage = "assets/typing-test-avatar.png";' +
            'chat.applyThreadImage();' +
            'looks.followsPicture = img.getAttribute("src") === "assets/typing-test-avatar.png";' +
            'chat.chatThread.personImage = keptImage; chat.applyThreadImage();' +
            'main.gotTyping(null, ev("paused")); await wait(50);' +
            'var paused = bubble.showing;' +
            'main.gotTyping(null, ev("typing")); await wait(50);' +
            'main.gotTyping(null, ev("none")); await wait(50);' +
            'var gone = !bubble.showing;' +
            'return { read: read, typed: typed, cleared: cleared, account: account.username, header: header, shown: shown, gone: gone, place: place, looks: looks, paused: paused,' +
            '  name: chat.$.header.hasNode().textContent };' +
            '})()');
        var who = { serviceName: 'type_telegram', username: r.account, usernameTo: 'anna.k' };
        assert.deepEqual(r.read, [{ method: 'markRead', payload: who }]);
        assert.deepEqual(r.typed, [{ method: 'sendTyping', payload: Object.assign({ state: 'typing' }, who) }],
            'typing is said once, not on every key');
        assert.deepEqual(r.cleared, [{ method: 'sendTyping', payload: Object.assign({ state: 'none' }, who) }]);
        assert.equal(r.shown, true, 'typing shows as dots under the last message');
        assert.deepEqual(r.place, { below: true, inView: true, small: true, left: true });
        assert.deepEqual(r.looks, { bubbleX: true, imageX: true, imageSize: true, picture: true, minHeight: true, tail: true, followsPicture: true },
            'drawn as a received message, picture and tail');
        assert.equal(r.header, 'Anna Kowalski', 'and not in the header');
        assert.equal(r.paused, false, 'paused is not typing');
        assert.equal(r.gone, true);
        assert.equal(r.name, 'Anna Kowalski');
    });

    // The transport restarting ends watchTyping without a word (util/serviceFollower): when the
    // hub says it went, whoever was typing is dropped; when it is back, watchTyping is made again
    // and the dead request ended. Runs after the test above, in Anna's chat.
    it('drops typing when the transport goes, and watches again when it is back', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$;' +
            'var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'var w = main.$.typingWatch, sent = [], cancelled = [];' +
            'var send = w.send, cancel = w.cancel;' +
            'w.send = function (p) { var q = { n: sent.length + 1, p: p }; sent.push(p); return q; };' +
            'w.cancel = function (q) { cancelled.push(q.n); };' +
            'try {' +
            ' var account = require("src/util/appState").accountService.getAccount("type_telegram");' +
            ' main.gotTyping(null, { serviceName: "type_telegram", username: account.username, from: "anna.k", state: "typing" }); await wait(50);' +
            ' var before = chat.$.typingBubble.showing;' +
            ' main.gotTransportStatus(null, { serviceName: "com.palm.imlibpurple", connected: true });' +
            ' main.gotTransportStatus(null, { serviceName: "com.palm.imlibpurple", connected: false }); await wait(50);' +
            ' var after = chat.$.typingBubble.showing;' +
            ' main.gotTransportStatus(null, { serviceName: "com.palm.imlibpurple", connected: true });' +
            ' return { before: before, after: after, sent: sent, cancelled: cancelled };' +
            '} finally { w.send = send; w.cancel = cancel; main.typingFollower.request = null; }' +
            '})()');
        assert.equal(r.before, true, 'typing shows first');
        assert.equal(r.after, false, 'and is gone with the transport');
        assert.deepEqual(r.sent, [{ subscribe: true }, { subscribe: true }], 'watched on each "up"');
        assert.deepEqual(r.cancelled, [1], 'the dead watch is ended');
    });

    // Telegram groups and Discord group DMs are channels to the transport; the server tells them
    // from a server's channels (chatActions.isChannelGroup), so they get Add People and Leave.
    it('offers the group buttons in a Telegram group and a Discord group DM, not in a server channel', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, mockDb = require("src/data/mockDb");' +
            'var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'var threads = mockDb.store["com.palm.chatthread:1"];' +
            'var tg = JSON.parse(JSON.stringify(threads.filter(function (t) { return t._id === "thread-channel"; })[0]));' +
            'var anna = mockDb.store["com.palm.message:1"].filter(function (m) { return m.conversations[0] === "thread-anna"; })[0];' +
            'mockDb.merge([{ _id: "server-gdm", _kind: "com.palm.imserver:1", serviceName: "type_discord", remoteId: "Discord", name: "Discord", displayName: "Discord" }]);' +
            'var made = ["server-gdm"];' +
            'var thread = function (id, server) { var t = { _id: id, _kind: "com.palm.chatthread:1", displayName: id, channelId: "ch-" + id, serverId: server,' +
            '  replyAddress: "1100000000000000077", normalizedAddress: "1100000000000000077", replyService: "type_discord", serviceName: "type_discord",' +
            '  timestamp: Date.now(), unreadCount: 0, flags: { visible: true } };' +
            '  var m = JSON.parse(JSON.stringify(anna)); m._id = "msg-" + id; m.conversations = [id]; m.serviceName = "type_discord";' +
            '  mockDb.merge([t, m]); made.push(id, "msg-" + id); return JSON.parse(JSON.stringify(t)); };' +
            'var open = async function (t) { main.selectThread(null, t);' +
            '  for (var k = 0; k < 20 && !(chat.chatThread && chat.chatThread._id === t._id && chat.collection.length); k++) { await wait(100); }' +
            '  await wait(300);' +
            '  return { add: chat.$.groupAddButton.getShowing(), leave: chat.$.groupLeaveButton.getShowing(), row: chat.$.listButtons.getShowing() }; };' +
            'var out = {};' +
            'try {' +
            ' out.telegram = await open(tg);' +
            ' chat.openGroupInvite(); await wait(100);' +
            ' out.inviteFor = chat.$.groupDialog.thread && chat.$.groupDialog.thread.replyAddress; chat.$.groupDialog.hide();' +
            ' out.serverChannel = await open(thread("thread-dchan", "server-discord"));' +
            ' out.groupDm = await open(thread("thread-gdm", "server-gdm"));' +
            // The server's answer after the messages, as it can come on a device: the buttons then.
            ' chat._serverName = undefined; chat.updateListButtons(chat.chatThread); chat.showListButtons(true);' +
            ' var before = chat.$.groupAddButton.getShowing();' +
            ' chat.gotChatServer(null, mockDb.get(["server-gdm"]));' +
            ' out.late = { before: before, after: chat.$.groupAddButton.getShowing(), row: chat.$.listButtons.getShowing() };' +
            // A channel's chat with no server: not the last server's name.
            ' out.noServer = await open(thread("thread-noserver", undefined));' +
            '} finally {' +
            ' mockDb.del(made);' +
            ' main.selectThread(null, JSON.parse(JSON.stringify(threads.filter(function (t) { return t._id === "thread-anna"; })[0]))); await wait(300);' +
            '}' +
            'return out;' +
            '})()');
        assert.deepEqual(r.telegram, { add: true, leave: true, row: true }, 'a Telegram group');
        assert.equal(r.inviteFor, '-100999', 'Add People adds to the chat the messages go to');
        assert.deepEqual(r.serverChannel, { add: false, leave: false, row: false }, 'a server channel');
        assert.deepEqual(r.groupDm, { add: true, leave: true, row: true }, 'a Discord group DM');
        assert.deepEqual(r.late, { before: false, after: true, row: true }, 'the server known after the messages');
        assert.deepEqual(r.noServer, { add: false, leave: false, row: false }, 'no server, no group');
    });

    // A chat opened with unread messages (util/unreadMarker): "N unread messages" above the first
    // of them, and the chat opens at the line when the newest would take it off the top; further
    // up, a button back down, counting what comes in meanwhile.
    it('marks the unread messages, and brings the reader back down to the newest', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, mockDb = require("src/data/mockDb");' +
            'var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'var anna = mockDb.store["com.palm.message:1"].filter(function (m) { return m.conversations[0] === "thread-anna" && m.folder === "inbox"; })[0];' +
            'var annaThread = mockDb.store["com.palm.chatthread:1"].filter(function (t) { return t._id === "thread-anna"; })[0];' +
            'var made = [], t0 = Date.now() - 3600000;' +
            'var add = function (i, folder) { var m = JSON.parse(JSON.stringify(anna)); m._id = "long-" + i; m.conversations = ["thread-long"];' +
            '  m.folder = folder; m.localTimestamp = t0 + i * 60000; m.timestamp = m.localTimestamp; m.messageText = "Message number " + i + " with some words to fill a line or two of the bubble";' +
            '  if (m.flags) { m.flags.read = true; } mockDb.merge([m]); made.push(m._id); return m; };' +
            'for (var i = 1; i <= 30; i++) { add(i, i % 4 === 0 ? "outbox" : "inbox"); }' +
            'var thread = JSON.parse(JSON.stringify(annaThread)); thread._id = "thread-long"; thread.displayName = "Long Chat";' +
            'mockDb.merge([thread]);' +
            'var open = async function (unread) { var t = JSON.parse(JSON.stringify(thread)); t.unreadCount = unread;' +
            '  var other = JSON.parse(JSON.stringify(annaThread)); main.selectThread(null, other); await wait(300);' +
            '  main.selectThread(null, t);' +
            '  for (var k = 0; k < 30 && !(chat.chatThread && chat.chatThread._id === "thread-long" && chat.collection.length > 20); k++) { await wait(100); }' +
            '  await wait(700); };' +
            'var lines = function () { return Array.prototype.filter.call(chat.$.list.hasNode().querySelectorAll(".conversation-unread-line"), function (n) { return n.offsetParent; }); };' +
            'var sb = function () { return chat.$.scroller.hasNode().getBoundingClientRect(); };' +
            'var out = {};' +
            'try {' +
            // Three unread: the line above the third newest incoming message (long-27), newest in view.
            ' await open(3);' +
            ' var l = lines(); out.few = { count: l.length, text: l[0] && l[0].textContent,' +
            '  above: !!(l[0] && l[0].parentNode.textContent.indexOf("Message number 27 ") >= 0), atEnd: chat._atEnd, button: chat.$.jumpButton.showing };' +
            // Twenty unread: more than fit, so the line is at the top of the view.
            ' await open(20);' +
            ' l = lines(); var lt = l[0].getBoundingClientRect().top - sb().top;' +
            ' out.many = { count: l.length, text: l[0].textContent, nearTop: lt >= -1 && lt < 20, button: chat.$.jumpButton.showing };' +
            // Further up: the button, over the list at its bottom right; a new message counts.
            ' chat.$.scroller.setScrollTop(0); chat.listScrolled(); await wait(100);' +
            ' var jb = chat.$.jumpButton.hasNode().getBoundingClientRect(), s = sb();' +
            ' out.up = { button: chat.$.jumpButton.showing, inList: jb.bottom <= s.bottom && jb.top >= s.top && jb.right <= s.right && jb.right > s.right - 40 && jb.width > 30 };' +
            ' add(31, "inbox"); chat.messagesWatch(); await wait(400);' +
            ' out.counted = { button: chat.$.jumpButton.showing, count: chat.$.jumpCount.showing ? chat.$.jumpCount.getContent() : null, scrolledTop: chat.$.scroller.getScrollTop() < 50 };' +
            ' add(32, "outbox"); add(33, "inbox"); chat.messagesWatch(); await wait(400);' +
            ' out.counted2 = chat.$.jumpCount.getContent();' +
            // Down: at the newest, no button; the line stays where it was.
            ' chat.jumpToBottom(); await wait(200);' +
            ' out.down = { atEnd: chat._atEnd, button: chat.$.jumpButton.showing, lines: lines().length };' +
            // A new message at the bottom does not take the reader back up to the line.
            ' add(34, "inbox"); chat.messagesWatch(); await wait(800);' +
            ' out.stays = { atEnd: require("src/util/isNearBottom")(chat.$.scroller.getScrollBounds()), button: chat.$.jumpButton.showing };' +
            // None unread: no line.
            ' await open(0);' +
            ' out.none = lines().length;' +
            '} finally {' +
            ' mockDb.del(made.concat(["thread-long", "long-31", "long-32", "long-33", "long-34"]));' +
            ' main.selectThread(null, JSON.parse(JSON.stringify(annaThread))); await wait(300);' +
            '}' +
            'return out;' +
            '})()');
        assert.deepEqual(r.few, { count: 1, text: '3 unread messages', above: true, atEnd: true, button: false });
        assert.deepEqual(r.many, { count: 1, text: '20 unread messages', nearTop: true, button: true });
        assert.deepEqual(r.up, { button: true, inList: true });
        assert.deepEqual(r.counted, { button: true, count: '1', scrolledTop: true }, 'a new one is counted, and the reader stays');
        assert.equal(r.counted2, '2', 'only incoming ones');
        assert.deepEqual(r.down, { atEnd: true, button: false, lines: 1 });
        assert.deepEqual(r.stays, { atEnd: true, button: false });
        assert.equal(r.none, 0);
    });

    // Hold a message: taps then pick messages, the bar takes the composer's place with all
    // its buttons on screen, and back leaves selecting before it leaves the chat.
    it('selects several messages, in chat order, and leaves selecting on back', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, Signals = require("enyo/Signals");' +
            'var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'main.selectThread(null, (await new Promise(function (res) {' +
            '  var t = null; $.app_mainView_messaging_threadList.collection.forEach(function (m) {' +
            '    if (m.attributes._id === "thread-family") { t = m.attributes; } }); res(t); })));' +
            'for (var i = 0; i < 20 && !(chat.messages && chat.messages.length); i++) { await wait(100); }' +
            'var m = chat.messages, ok = [], gone = -1;' +
            'for (i = 0; i < m.length; i++) { if (m[i].deleted) { gone = i; } else { ok.push(i); } }' +
            'var at = function (k) { return { model: chat.collection.at(k) }; }, last = ok[ok.length - 1];' +
            // Held, as a finger does: Enyo decorates the event with the row's model.
            'chat.handleMessageHold(null, { model: chat.collection.at(last) }); await wait(100);' +
            'chat.handleMessageTap(null, at(ok[0]));' +
            'chat.handleMessageTap(null, at(ok[1]));' +
            'chat.handleMessageTap(null, at(ok[1]));' +
            'chat.handleMessageTap(null, at(gone));' +
            'var picked = chat.selectedMessages().map(function (x) { return x._id; });' +
            'var want = [m[ok[0]]._id, m[last]._id];' +
            'var bar = chat.$.selectionBar.hasNode().getBoundingClientRect();' +
            'var fits = Array.prototype.every.call(chat.$.selectionBar.hasNode().children, function (c) {' +
            '  var b = c.getBoundingClientRect(); return b.width > 0 && b.right <= bar.right && c.scrollWidth <= c.clientWidth; });' +
            'var state = { count: chat.$.selectionCount.getContent(), order: picked.join() === want.join(),' +
            '  hasDeleted: gone >= 0,' +
            '  lit: document.querySelectorAll(".msg-selected").length, fits: fits,' +
            '  composer: chat.$.footer.showing, react: chat.$.reactRow.showing };' +
            // The light Enyo 1 bar the composer is, not Onyx's dark toolbar.
            'var sb = getComputedStyle(chat.$.selectionBar.hasNode()), cb = getComputedStyle(chat.$.footer.hasNode());' +
            'state.light = /gradient/.test(sb.backgroundImage) && sb.backgroundImage === cb.backgroundImage &&' +
            '  sb.color === cb.color;' +
            'Signals.send("onbackgesture", {}); await wait(300);' +
            'state.after = { bar: chat.$.selectionBar.showing, composer: chat.$.footer.showing,' +
            '  lit: document.querySelectorAll(".msg-selected").length, chat: chat.chatThread && chat.chatThread._id };' +
            'return state;' +
            '})()');
        assert.deepEqual(r, { count: '2 selected', order: true, hasDeleted: true, lit: 2, fits: true, composer: false, react: false,
            light: true, after: { bar: false, composer: true, lit: 0, chat: 'thread-family' } });
    });

    // Palm's stylesheet capped names and previews at fixed widths (190px, less beside a badge)
    // for the Pre's 320px screen, so on a wider one they were cut off at two thirds of the row.
    // Each row's text gets the width its column has; a long name stops only at what sits beside
    // it in the row (the unread badge, a star). A name made long in place stands for a long one.
    it('lets names and previews use the width of the row', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$, messaging = $.app_mainView_messaging;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'var LONG = "Anna Kowalski-Wisniewska van der Berg-Lindqvist of Gdansk";' +
            'function px(n) { return n.getBoundingClientRect(); }' +
            'function check(listSel, out) {' +
            '  var cols = document.querySelectorAll(listSel + " .message-summary");' +
            '  out.rows = 0; out.narrow = [];' +
            '  for (var i = 0; i < cols.length; i++) {' +
            '    var col = px(cols[i]); if (!col.width) { continue; }' +
            '    out.rows++;' +
            '    var lines = cols[i].querySelectorAll(".message-preview, .status-message, .contact-message");' +
            '    for (var j = 0; j < lines.length; j++) {' +
            '      var w = px(lines[j]).width;' +
            '      if (w && Math.abs(w - col.width) > 1) { out.narrow.push(Math.round(w) + " of " + Math.round(col.width)); }' +
            '    }' +
            '  }' +
            '  var name = document.querySelector(listSel + " .contact-name");' +
            '  name.textContent = LONG;' +
            '  var box = name.parentNode.classList.contains("contact-name-box") ? name.parentNode : name;' +
            '  var beside = 0;' +
            '  for (var k = 0; box !== name && k < box.children.length; k++) {' +
            '    var c = box.children[k]; if (c !== name && px(c).width) { beside += px(c).width; }' +
            '  }' +
            '  out.elided = name.scrollWidth > name.clientWidth;' +
            // text-overflow draws its "..." only in a block container; in a flex box the text is cut.
            '  out.display = getComputedStyle(name).display;' +
            '  out.gap = Math.round(px(box).right - beside - px(name).right);' +
            '}' +
            'var res = { chats: {}, favorites: {} };' +
            'messaging.menuToggle(null, 0); await wait(400);' +
            'check("[id$=_threadList]", res.chats);' +
            'messaging.menuToggle(null, 2); await wait(600);' +
            'check("[id$=_favoriteList]", res.favorites);' +
            'messaging.menuToggle(null, 0); await wait(300);' +
            'return res;' +
            '})()');
        ['chats', 'favorites'].forEach(function (tab) {
            assert.ok(r[tab].rows > 0, 'no ' + tab + ' rows to measure');
            assert.deepEqual(r[tab].narrow, [], tab + ': text lines narrower than their column');
            assert.equal(r[tab].elided, true, tab + ': the long name should be elided');
            assert.match(r[tab].display, /^(block|inline-block)$/,
                tab + ': a name laid out as ' + r[tab].display + ' is cut off with no ellipsis');
            assert.ok(r[tab].gap >= 0 && r[tab].gap <= 8,
                tab + ': the long name stops ' + r[tab].gap + 'px short of the room it has');
        });
    });

    // Only the conversations list hands the chat a thread with its person joined. Opened from
    // Buddies (or Favorites, a notification, a group sender) the chat got the bare record, so it
    // showed the default avatar and offered only the thread's own transport, not the person's
    // phone numbers. Runs last: it opens a chat, which slides the panes on a phone.
    it('gives a chat opened from Buddies its person and transports', async function () {
        var r = await session.evaluate('(async function () {' +
            'var $ = require("enyo/dispatcher").$;' +
            'var messaging = $.app_mainView_messaging, chat = $.app_mainView_chatView_conversationList;' +
            'var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };' +
            'messaging.personSelected(null, { buddy: { personId: "person-anna", username: "anna.k",' +
            '  serviceName: "type_telegram", displayName: "Anna Kowalski" } });' +
            'for (var i = 0; i < 20 && !(chat.chatThread && chat.chatThread.person); i++) { await wait(100); }' +
            'var t = chat.chatThread || {};' +
            'return { thread: t._id, person: t.person ? t.person._id : null,' +
            '  picker: chat.$.transportArrow.getShowing() };' +
            '})()');
        // Anna has a Telegram handle and two phone numbers, so the transport picker opens.
        assert.deepEqual(r, { thread: 'thread-anna', person: 'person-anna', picker: true });
    });
    // B2-B6 on the mock WhatsApp group: what each action writes is the imcommand or outbox
    // message the transport reads (util/chatActions), and the chat shows it at once. Runs in the
    // page; everything it adds is taken out again at the end.
    it('reacts, edits, deletes for everyone, manages the group, and sends places, cards and mentions', async function () {
        /* global require, innerHeight */
        var page = async function () {
            var $ = require('enyo/dispatcher').$, mockDb = require('src/data/mockDb');
            var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;
            var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
            var GROUP = '120363041234567890@g.us';
            var thread = null;
            $.app_mainView_messaging_threadList.collection.forEach(function (m) {
                if (m.attributes._id === 'thread-family') { thread = m.attributes; }
            });
            main.selectThread(null, thread);
            for (var i = 0; i < 20 && !(chat.chatThread && chat.chatThread._id === 'thread-family' && chat.messages.length); i++) { await wait(100); }
            var out = {};
            var last = function () { return mockDb.imCommands[mockDb.imCommands.length - 1]; };
            var record = function (id) { return mockDb.get([id]).results[0] || {}; };
            var before = mockDb.store['com.palm.message:1'].map(function (m) { return m._id; });
            mockDb.imCommands.length = 0;

            // A reaction on Marta's message names it, her, our account and the group.
            var marta = chat.messages.filter(function (m) { return m._id === 'msg-f2'; })[0];
            chat.toggleMyReaction(marta, 'X');
            out.reaction = last();
            chat.toggleMyReaction(marta, 'X');   // and off again

            // Delete asks: for everyone, for me, or cancel. Theirs has no Edit and no "for everyone".
            var prompt = function () {
                return { shown: chat.$.deleteDialog.getShowing(), all: chat.$.deleteEveryoneButton.getShowing(),
                    me: chat.$.deleteMeButton.getShowing() };
            };
            chat.selectedMessage = marta;
            chat.reactMore(null, {}); await wait(100);
            out.theirs = { edit: chat.$.menuEditItem.getShowing() };
            chat.$.messageMenu.hide();
            chat.menuDelete();
            out.theirs.prompt = prompt();
            chat.closeDeleteDialog();
            out.theirs.kept = { shown: chat.$.deleteDialog.getShowing(), there: record('msg-f2')._id === 'msg-f2' };

            // Ours, sent a minute ago, has both.
            mockDb.merge([{
                _id: 'msg-own', _kind: 'com.palm.message:1', conversations: ['thread-family'], folder: 'outbox',
                status: 'successful', serviceName: 'type_whatsapp', chatType: 'groupchat', serviceMessageId: '3EB0OWN',
                messageText: 'See you at six', localTimestamp: Date.now() - 60000, timestamp: Date.now() - 60000,
                from: { addr: '+15555550100' }, flags: { visible: true, read: true }
            }]);
            chat.runQuery(); await wait(300);
            var own = chat.messages.filter(function (m) { return m._id === 'msg-own'; })[0];
            chat.selectedMessage = own;
            chat.reactMore(null, {}); await wait(100);
            out.ours = { edit: chat.$.menuEditItem.getShowing() };
            chat.$.messageMenu.hide();
            chat.menuDelete();
            out.ours.prompt = prompt();
            chat.closeDeleteDialog();

            chat.menuEdit(); await wait(50);
            out.editing = { bar: chat.$.replyBar.getShowing(), text: chat.$.richText.get('value') };
            chat.$.richText.set('value', 'See you at seven');
            chat.sendMessage(); await wait(200);
            out.edit = last();
            out.edited = { text: record('msg-own').messageText, edited: record('msg-own').edited,
                composer: chat.$.richText.get('value'), bar: chat.$.replyBar.getShowing() };

            chat.selectedMessage = own;
            chat.menuDelete();
            out.deletePrompt = prompt();
            chat.deleteChosenForEveryone(); await wait(200);
            out.del = last();
            out.deleted = { deleted: record('msg-own').deleted, shown: chat.$.deleteDialog.getShowing() };

            // Selected in the bar: "for everyone" only while every one picked is ours; for me
            // takes them off this device, sends nothing, and ends selecting.
            mockDb.merge([{
                _id: 'msg-own2', _kind: 'com.palm.message:1', conversations: ['thread-family'], folder: 'outbox',
                status: 'successful', serviceName: 'type_whatsapp', chatType: 'groupchat', serviceMessageId: '3EB0OWN2',
                messageText: 'Running late', localTimestamp: Date.now() - 30000, timestamp: Date.now() - 30000,
                from: { addr: '+15555550100' }, flags: { visible: true, read: true }
            }, {
                _id: 'msg-in2', _kind: 'com.palm.message:1', conversations: ['thread-family'], folder: 'inbox',
                status: 'successful', serviceName: 'type_whatsapp', chatType: 'groupchat', serviceMessageId: '3EB0IN2',
                messageText: 'No rush', localTimestamp: Date.now() - 20000, timestamp: Date.now() - 20000,
                from: { addr: '+46701234567' }, flags: { visible: true, read: true }
            }]);
            chat.runQuery(); await wait(300);
            var row = function (id) {
                for (var k = 0; k < chat.collection.length; k++) {
                    if (chat.collection.at(k).get('_id') === id) { return { model: chat.collection.at(k) }; }
                }
            };
            var commands = mockDb.imCommands.length;
            chat.handleMessageHold(null, row('msg-own2')); await wait(100);
            chat.promptDeleteSelected();
            out.pickOwn = prompt();
            chat.closeDeleteDialog();
            chat.handleMessageTap(null, row('msg-in2'));
            chat.promptDeleteSelected();
            out.pickMixed = prompt();
            chat.deleteChosenForMe(); await wait(300);
            out.forMe = { sent: mockDb.imCommands.length - commands, own: !!record('msg-own2')._id, theirs: !!record('msg-in2')._id,
                selecting: chat.$.selectionBar.getShowing(), shown: chat.$.deleteDialog.getShowing() };

            // The group: Add People and Leave Group; no Block Sender.
            out.buttons = { add: chat.$.groupAddButton.getShowing(), leave: chat.$.groupLeaveButton.getShowing(),
                block: !!chat.$.blockButton, del: !!chat.$.deleteButton };
            chat.openGroupInvite(); await wait(100);
            var dialog = chat.$.groupDialog;
            out.inviteShown = dialog.getShowing();
            var fits = function (c) {
                var b = c.hasNode().getBoundingClientRect();
                return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && b.width > 200;
            };
            out.dialogFits = fits(dialog);
            out.listHeight = Math.round(dialog.$.people.$.dataList.hasNode().getBoundingClientRect().height);
            // Only who can be in a WhatsApp group is offered: the mock contacts have no one.
            var offered = dialog.$.people.$.dataList.collection, accept = offered.accept;
            for (i = 0; i < 20 && !offered.personCollection.length; i++) { await wait(100); }
            await wait(200);
            out.listed = offered.map(function (m) { return m.get('value'); });
            offered.accept = null; offered.searchTextChanged(); await wait(200);
            out.unfiltered = offered.length;
            offered.accept = accept; offered.searchTextChanged();
            // Never ourselves: our own number is no one to add.
            out.ownOffered = [accept({ value: '+1 555 555 0100', isPhone: true }), accept({ value: '+44 7700 900123', isPhone: true })];
            dialog.personPicked(null, { msgAddr: { displayName: 'Ben', value: '+44 7700 900123', isPhone: true } });
            dialog.personPicked(null, { msgAddr: { displayName: 'Local', value: '07700 900123', isPhone: true } });
            dialog.doneTapped();
            out.invite = last();
            chat.promptLeaveGroup(); chat.confirmAccepted();
            out.leave = last();
            // Left: no member now, so neither button; the chat remembers it (flags.left).
            await wait(100);
            var stored = mockDb.store['com.palm.chatthread:1'].filter(function (t) { return t._id === chat.chatThread._id; })[0];
            out.afterLeave = { add: chat.$.groupAddButton.getShowing(), leave: chat.$.groupLeaveButton.getShowing(),
                row: chat.$.listButtons.getShowing(), stored: !!(stored && stored.flags && stored.flags.left) };
            chat.chatThread.flags.left = false; chat.mergeThread({ _id: chat.chatThread._id, flags: { left: false } });
            chat.updateListButtons(chat.chatThread); chat.showListButtons(true);

            // A place: asked first, then sent as a link with the position beside it.
            var count = mockDb.store['com.palm.message:1'].length;
            chat.promptShareLocation();
            out.locationPrompt = chat.$.confirmDialog.getShowing();
            chat.confirmAccepted(); await wait(200);
            var sentNow = function () { return mockDb.store['com.palm.message:1'].slice(count); };
            var place = sentNow()[0] || {};
            out.place = { text: place.messageText, location: place.location, to: place.to && place.to[0].addr };

            // A card.
            count = mockDb.store['com.palm.message:1'].length;
            chat.openContactPicker(); await wait(200);
            out.pickerFits = fits(chat.$.contactPicker);
            out.pickerList = Math.round(chat.$.contactList.$.dataList.hasNode().getBoundingClientRect().height);
            chat.contactPicked(null, { msgAddr: { displayName: 'Sam Patel', value: '+1 555 987 6543', isPhone: true } });
            await wait(200);
            var card = sentNow()[0] || {};
            out.card = { text: card.messageText, vcard: card.contactCard && card.contactCard.vcard };

            // Both drawn as a received one is: a chip, not the maps link or the numbers.
            chat.runQuery(); await wait(400);
            var bubbles = Array.prototype.slice.call(document.querySelectorAll('[id$="_messageText"]'));
            var chipIn = function (kind) {
                return bubbles.filter(function (b) { return b.querySelector('.msg-attachment[data-kind="' + kind + '"]'); });
            };
            var placeBubble = chipIn('location').filter(function (b) {
                return b.querySelector('[data-open="52.3731,4.8925"]'); })[0];
            var cardBubble = chipIn('contact').filter(function (b) { return /Sam Patel/.test(b.textContent); })[0];
            out.drawn = {
                place: !!placeBubble && !/maps\.google|My location/.test(placeBubble.textContent),
                card: !!cardBubble && !/987/.test(cardBubble.textContent) && !cardBubble.querySelector('[data-open]')
            };
            // A place Telegram sent: the database has only its "Location: lat, lng" line.
            mockDb.merge([{
                _id: 'msg-tg-place', _kind: 'com.palm.message:1', conversations: ['thread-family'], folder: 'inbox',
                status: 'successful', serviceName: 'type_whatsapp', messageText: 'Location: 50.4501, 30.5234',
                localTimestamp: Date.now(), timestamp: Date.now(), from: { addr: '+46701234567' }, flags: { visible: true, read: true }
            }]);
            chat.runQuery(); await wait(400);
            var tgPlace = Array.prototype.slice.call(document.querySelectorAll('[id$="_messageText"]')).filter(function (b) {
                return b.querySelector('.msg-attachment[data-kind="location"][data-open="50.4501,30.5234"]'); })[0];
            out.drawn.received = !!tgPlace && !/Location:/.test(tgPlace.textContent);

            // Discord: a place shared from Android is text with a degrees line; a card is a link.
            var CARD = 'https://cdn.discordapp.com/attachments/1/2/Jane.vcf?ex=6a&amp;is=6b';
            mockDb.merge([{
                _id: 'msg-dc-place', _kind: 'com.palm.message:1', conversations: ['thread-family'], folder: 'inbox',
                status: 'successful', serviceName: 'type_discord',
                messageText: 'https://maps.app.goo.gl/AbCd<br />\n52°22\'12.3"N 4°53\'45.6"E<br />\nSun Nov 8 07:59:00 2026',
                localTimestamp: Date.now(), timestamp: Date.now(), from: { addr: 'anna' }, flags: { visible: true, read: true }
            }, {
                _id: 'msg-dc-card', _kind: 'com.palm.message:1', conversations: ['thread-family'], folder: 'inbox',
                status: 'successful', serviceName: 'type_discord', messageText: CARD,
                localTimestamp: Date.now() + 1, timestamp: Date.now() + 1, from: { addr: 'anna' }, flags: { visible: true, read: true }
            }]);
            chat.runQuery(); await wait(400);
            var texts = Array.prototype.slice.call(document.querySelectorAll('[id$="_messageText"]'));
            var dcPlace = texts.filter(function (b) {
                return b.querySelector('.msg-attachment[data-kind="location"][data-open="52.370083,4.896"]'); })[0];
            var dcCard = texts.filter(function (b) { return b.querySelector('.msg-attachment[data-kind="contact"]'); })
                .filter(function (b) { return /cdn\.discordapp\.com/.test(b.querySelector('.msg-attachment[data-kind="contact"]').getAttribute('data-open')); })[0];
            var launched = [], sendLaunch = chat.$.launchApp.send;
            chat.$.launchApp.send = function (p) { launched.push(p); return null; };
            mockDb.downloads.length = 0;
            dcCard.querySelector('.msg-attachment[data-kind="contact"]').click(); await wait(100);
            dcCard.querySelector('.msg-attachment[data-kind="contact"]').click(); await wait(100);
            mockDb.downloadFails = true;
            chat.openAttachment(null, { target: CARD.replace('/2/', '/3/'), kind: 'contact' }); await wait(100);
            mockDb.downloadFails = false;
            out.discord = {
                place: !!dcPlace && !/°/.test(dcPlace.textContent) && /maps\.app\.goo\.gl/.test(dcPlace.textContent),
                downloads: mockDb.downloads.map(function (d) { return d.targetDir + '|' + /^card-[0-9a-f]{8}\.vcf$/.test(d.targetFilename) + '|' + d.target; }),
                launched: launched.map(function (l) { return l.id + ' ' + /^file:\/\/\/media\/internal\/\.im-attachments\/cards\/card-[0-9a-f]{8}\.vcf$/.test(l.params.target); }),
                error: chat.$.errorDialog.getShowing()
            };
            chat.$.launchApp.send = sendLaunch;
            chat.$.errorDialog.hide();

            // A mention: "@Ma" offers Marta; picking her writes her name, sending says who it is.
            var node = chat.$.richText.hasNode();
            chat.$.richText.set('value', 'hi @Ma'); node.value = 'hi @Ma'; node.setSelectionRange(6, 6);
            chat.composerInput(); await wait(100);
            var items = chat.$.mentionMenu.getClientControls();
            out.offered = items.map(function (c) { return c.member.name; });
            chat.mentionPicked(null, { originator: items[0] });
            out.mentionText = chat.$.richText.get('value');
            chat.$.richText.set('value', out.mentionText + 'bring the cake');
            count = mockDb.store['com.palm.message:1'].length;
            chat.sendMessage(); await wait(200);
            var mention = sentNow()[0] || {};
            out.mention = { text: mention.messageText, mentions: mention.mentions };

            // New Group, from the app menu.
            main.showAppMenu(main.$.appMenuAnchor); await wait(100);
            out.newGroupItem = main.$.newGroupMenuItem.getShowing();
            main.$.appMenu.hide();
            main.newGroup(); await wait(100);
            var create = main.$.groupDialog;
            out.creators = create.creatable.map(function (a) { return a.serviceName; });
            out.accountRow = create.$.accountRow.getShowing();
            create.$.nameInput.set('value', 'Climbing');
            create.personPicked(null, { msgAddr: { displayName: 'Anna', value: 'anna.k', type: 'type_telegram' } });
            out.telegramPicked = create.members.length;
            create.chooseAccount(create.creatable[out.creators.indexOf('type_whatsapp')]);
            out.afterSwitch = { members: create.members.length, name: create.$.nameInput.get('value') };
            create.personPicked(null, { msgAddr: { displayName: 'Marta', value: '+46 70 123 45 67', isPhone: true } });
            create.doneTapped();
            out.create = last();

            // Leave the mock store as it was.
            var added = mockDb.store['com.palm.message:1'].map(function (m) { return m._id; })
                .filter(function (id) { return before.indexOf(id) < 0; });
            mockDb.del(added);
            mockDb.imCommands.length = 0;
            chat.runQuery(); await wait(200);
            return out;
        };
        var r = await session.evaluate('(' + page.toString() + ')()');
        var cmd = function (command, target, params) {
            return { _kind: 'com.palm.imcommand.whatsapp:1', command: command, handler: 'transport',
                serviceName: 'type_whatsapp', fromUsername: '+15555550100', targetUsername: target, params: params };
        };
        var GROUP = '120363041234567890@g.us';
        assert.deepEqual(r.reaction, cmd('sendReaction', GROUP,
            { targetServiceMessageId: '3EB0C4F1A2', emoji: 'X', remove: false, targetSender: '+46701234567' }));
        assert.deepEqual(r.theirs, { edit: false, prompt: { shown: true, all: false, me: true },
            kept: { shown: false, there: true } }, 'Cancel deletes nothing');
        assert.deepEqual(r.ours, { edit: true, prompt: { shown: true, all: true, me: true } });
        assert.deepEqual(r.editing, { bar: true, text: 'See you at six' });
        assert.deepEqual(r.edit, cmd('editMessage', GROUP, { targetServiceMessageId: '3EB0OWN', text: 'See you at seven' }));
        assert.deepEqual(r.edited, { text: 'See you at seven', edited: true, composer: '', bar: false });
        assert.deepEqual(r.deletePrompt, { shown: true, all: true, me: true }, 'asked first');
        assert.deepEqual(r.del, cmd('deleteMessage', GROUP, { targetServiceMessageId: '3EB0OWN' }));
        assert.deepEqual(r.deleted, { deleted: true, shown: false });
        assert.deepEqual(r.pickOwn, { shown: true, all: true, me: true });
        assert.deepEqual(r.pickMixed, { shown: true, all: false, me: true }, 'one of them is theirs');
        assert.deepEqual(r.forMe, { sent: 0, own: false, theirs: false, selecting: false, shown: false });
        assert.deepEqual(r.buttons, { add: true, leave: true, block: false, del: false },
            'Block Sender and Delete Conversation are in the chat list now');
        assert.equal(r.inviteShown, true);
        assert.equal(r.dialogFits, true, 'Add People fits the window');
        assert.ok(r.listHeight > 100, 'its contacts get room: ' + r.listHeight);
        assert.equal(r.pickerFits, true, 'the contact picker fits the window');
        assert.ok(r.pickerList > 100, 'its contacts get room: ' + r.pickerList);
        assert.ok(r.unfiltered > r.listed.length, 'the contacts that cannot be members are left out (' + r.unfiltered + ')');
        assert.deepEqual(r.listed.filter(function (v) { return !/^\+\d+$/.test(v) && !/@s\.whatsapp\.net$/.test(v); }), [],
            'only a WhatsApp address or a full number: ' + r.listed.join());
        assert.ok(r.listed.indexOf('anna.k') < 0 && r.listed.indexOf('5551234567') < 0);
        assert.deepEqual(r.invite, cmd('inviteToGroup', GROUP, { members: '+447700900123' }),
            'a number without its country code is not taken');
        assert.deepEqual(r.leave, cmd('leaveGroup', GROUP, {}));
        assert.deepEqual(r.afterLeave, { add: false, leave: false, row: false, stored: true }, 'a left group offers nothing');
        assert.deepEqual(r.ownOffered, [false, true], 'our own number is not offered');
        assert.equal(r.locationPrompt, true, 'asked first');
        assert.deepEqual(r.place, { text: 'My location\nhttps://maps.google.com/?q=52.3731,4.8925',
            location: { latitude: 52.3731, longitude: 4.8925 }, to: GROUP });
        assert.equal(r.card.text.split('\n')[0], 'Sam Patel');
        assert.deepEqual(r.drawn, { place: true, card: true, received: true }, 'what we send is drawn as what we receive');
        assert.deepEqual(r.discord, {
            place: true,
            downloads: [
                '/media/internal/.im-attachments/cards|true|https://cdn.discordapp.com/attachments/1/2/Jane.vcf?ex=6a&is=6b',
                '/media/internal/.im-attachments/cards|true|https://cdn.discordapp.com/attachments/1/3/Jane.vcf?ex=6a&is=6b'
            ],
            launched: ['com.palm.app.contacts true', 'com.palm.app.contacts true'],
            error: true
        }, 'a Discord place is a chip; a card link is fetched once, then opened in Contacts; a failed fetch says so');
        assert.match(r.card.vcard, /^BEGIN:VCARD\r\nVERSION:3\.0\r\nFN:Sam Patel\r\n[\s\S]*TEL;TYPE=CELL:[\s\S]*END:VCARD\r\n$/);
        assert.deepEqual(r.offered, ['Marta Lindqvist']);
        assert.equal(r.mentionText, 'hi @Marta Lindqvist ');
        assert.deepEqual(r.mention, { text: 'hi @Marta Lindqvist bring the cake',
            mentions: [{ id: '+46701234567', name: 'Marta Lindqvist' }] });
        assert.equal(r.newGroupItem, true);
        assert.deepEqual(r.creators, ['type_telegram', 'type_whatsapp', 'type_discord'], 'every account whose service makes groups');
        assert.equal(r.accountRow, true, 'so the dialog asks which');
        assert.equal(r.telegramPicked, 1);
        assert.deepEqual(r.afterSwitch, { members: 0, name: 'Climbing' }, 'another service: its people start over, the name stays');
        assert.deepEqual(r.create, cmd('createGroup', '', { name: 'Climbing', members: '+46701234567' }));
    });

    it('keeps the composer on screen through a reflow under a popup, and fits the group row and search box', async function () {
        /* global require, innerHeight, innerWidth, getComputedStyle */
        var page = async function () {
            var $ = require('enyo/dispatcher').$;
            var main = $.app_mainView, chat = $.app_mainView_chatView_conversationList;
            var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
            var thread = null;
            $.app_mainView_messaging_threadList.collection.forEach(function (m) {
                if (m.attributes._id === 'thread-family') { thread = m.attributes; }
            });
            main.selectThread(null, thread);
            for (var i = 0; i < 20 && !(chat.chatThread && chat.chatThread._id === 'thread-family' && chat.messages.length); i++) { await wait(100); }
            await wait(200);
            var out = {};
            var onScreen = function (c) {
                var b = c.hasNode().getBoundingClientRect();
                var top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
                return b.bottom <= innerHeight && b.top >= 0 && !!top && c.hasNode().contains(top);
            };

            // Reply chosen from the message menu: the bar opens while the menu is still up.
            var m = chat.messages[chat.messages.length - 1];
            chat.selectedMessage = m;
            chat.reactMore(null, {}); await wait(100);
            chat.enterReply(m); await wait(100);
            chat.$.messageMenu.hide(); await wait(100);
            out.reply = { close: onScreen(chat.$.replyBarClose), send: onScreen(chat.$.sendButton) };
            chat.cancelReply();

            // Any reflow with a popup open, as the keyboard closing under the app menu makes.
            main.showAppMenu(main.$.appMenuAnchor); await wait(100);
            main.resize(); chat.resize(); await wait(50);
            main.$.appMenu.hide(); await wait(100);
            out.afterMenu = { send: onScreen(chat.$.sendButton),
                views: Math.round(main.$.views.hasNode().getBoundingClientRect().bottom) <= innerHeight };

            // The group's row: Add People and Leave Group, whole, Leave red.
            out.row = ['groupAddButton', 'groupLeaveButton'].map(function (k) {
                var c = chat.$[k], n = c.hasNode();
                if (!c.getShowing()) { return k + ':hidden'; }
                var b = n.getBoundingClientRect();
                out.rowLeft = out.rowLeft === undefined ? Math.round(b.left) : out.rowLeft;
                return k + ':' + (n.scrollWidth <= n.clientWidth ? 'whole' : 'cut') +
                    (b.right <= innerWidth ? '' : ':off') + ':' + getComputedStyle(n).backgroundColor;
            });

            // New Group's search box: the glass inside the box, the box inside the dialog.
            main.newGroup(); await wait(200);
            var dialog = main.$.groupDialog, deco = dialog.$.people.$.searchInput.parent.hasNode();
            var glass = deco.querySelector('img').getBoundingClientRect(), box = deco.getBoundingClientRect();
            var d = dialog.hasNode().getBoundingClientRect();
            out.search = { glassInBox: glass.right <= box.right + 0.5 && glass.left >= box.left, boxInDialog: box.right <= d.right + 0.5 };
            dialog.hide();
            return out;
        };
        // A Pixel 3a's width (450 CSS px), where a group's row was cut; then back to the suite's.
        await session.send('Emulation.setDeviceMetricsOverride', { width: 450, height: HEIGHT, deviceScaleFactor: 1, mobile: true });
        var r;
        try {
            r = await session.evaluate('(' + page.toString() + ')()');
        } finally {
            await session.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true });
        }
        assert.deepEqual(r.reply, { close: true, send: true }, 'the reply bar\'s X and Send stay where a finger can reach them');
        assert.deepEqual(r.afterMenu, { send: true, views: true });
        assert.deepEqual(r.row, ['groupAddButton:whole:rgb(243, 243, 243)', 'groupLeaveButton:whole:rgb(197, 22, 22)']);
        assert.equal(r.rowLeft, 8, 'the row starts at its padding');
        assert.deepEqual(r.search, { glassInBox: true, boxInDialog: true });
    });

    it('offers Block Sender on a long tap in the chat list, for one person on IM, and asks first', async function () {
        /* global require */
        var page = async function () {
            var $ = require('enyo/dispatcher').$, Signals = require('enyo/Signals'), mockDb = require('src/data/mockDb');
            var tl = $.app_mainView_messaging_threadList, chatActions = require('src/util/chatActions');
            var appState = require('src/util/appState');
            var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
            if ($.app_mainView.$.slidingGroup.getIndex() !== 0) { Signals.send('onbackgesture', {}); await wait(600); }
            var all = tl.collection.models.map(function (m) { return m.attributes; });
            var one = all.filter(function (t) { return chatActions.canBlock(t, appState.accountService); })[0];
            var group = all.filter(function (t) { return t._id === 'thread-family'; })[0];
            var labels = async function (thread) {
                var row = null;
                tl.$.list.getClientControls().forEach(function (c) { if (c.model && c.model.attributes._id === thread._id) { row = c; } });
                var b = row.hasNode().getBoundingClientRect();
                tl.holdThread(tl.$.scroller, { originator: row, model: row.model, pageX: b.left + 20, pageY: b.top + 10,
                    preventTap: function () {} });
                await wait(200);
                var items = tl.$.chatMenu.getClientControls().map(function (c) { return c.content; });
                return items;
            };
            var out = { one: !!one };
            if (!one) { return out; }
            out.group = (await labels(group)).indexOf('Block Sender') >= 0;
            tl.$.chatMenu.hide();
            var items = await labels(one);
            out.oneOffers = items[items.length - 1];
            mockDb.imCommands.length = 0;
            var item = tl.$.chatMenu.getClientControls().filter(function (c) { return c.block; })[0];
            tl.chatOptionTapped(item); await wait(200);
            out.asked = tl.$.blockDialog.getShowing();
            out.beforeYes = mockDb.imCommands.length;
            tl.blockAccepted(); await wait(100);
            out.cmd = mockDb.imCommands[0] && { command: mockDb.imCommands[0].command, to: mockDb.imCommands[0].targetUsername === one.replyAddress,
                service: mockDb.imCommands[0].serviceName === one.replyService };
            out.closed = !tl.$.blockDialog.getShowing();
            // Cancel writes nothing.
            mockDb.imCommands.length = 0;
            await labels(one);
            tl.chatOptionTapped(tl.$.chatMenu.getClientControls().filter(function (c) { return c.block; })[0]);
            tl.closeBlockDialog(); await wait(100);
            out.cancelled = mockDb.imCommands.length;
            return out;
        };
        var r = await session.evaluate('(' + page.toString() + ')()');
        assert.deepEqual(r, { one: true, group: false, oneOffers: 'Block Sender', asked: true, beforeYes: 0,
            cmd: { command: 'blockBuddy', to: true, service: true }, closed: true, cancelled: 0 });
    });
});
