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
            'return { inMenu: inMenu, placed: placed, opened: opened, reopened: reopened, toggled: toggled,' +
            '  count: count, newest: newest, older: older, olderHit: olderHit,' +
            '  closed: closed,' +
            '  chatStill: chat.chatThread && chat.chatThread._id };' +
            '})()');
        assert.deepEqual(r, { inMenu: false, placed: true, opened: true, reopened: true, toggled: true,
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
            '  return !/divider/.test(x.className); });' +
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
    // so once, and "none" once it is sent; a buddy typing to us shows after their name until it
    // stops. With the mock db the calls are kept on mockDb.presenceCalls instead of sent.
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
            'main.gotTyping(null, ev("typing")); await wait(50);' +
            'var header = chat.$.header.hasNode().textContent;' +
            'var shown = !!chat.$.header.hasNode().querySelector(".conversation-typing");' +
            'main.gotTyping(null, ev("none")); await wait(50);' +
            'var gone = !chat.$.header.hasNode().querySelector(".conversation-typing");' +
            'return { read: read, typed: typed, cleared: cleared, account: account.username, header: header, shown: shown, gone: gone,' +
            '  name: chat.$.header.hasNode().textContent };' +
            '})()');
        var who = { serviceName: 'type_telegram', username: r.account, usernameTo: 'anna.k' };
        assert.deepEqual(r.read, [{ method: 'markRead', payload: who }]);
        assert.deepEqual(r.typed, [{ method: 'sendTyping', payload: Object.assign({ state: 'typing' }, who) }],
            'typing is said once, not on every key');
        assert.deepEqual(r.cleared, [{ method: 'sendTyping', payload: Object.assign({ state: 'none' }, who) }]);
        assert.equal(r.shown, true, 'typing shows in the header');
        assert.match(r.header, /^Anna Kowalski typing\.\.\.$/);
        assert.equal(r.gone, true);
        assert.equal(r.name, 'Anna Kowalski');
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
            'Signals.send("onbackgesture", {}); await wait(300);' +
            'state.after = { bar: chat.$.selectionBar.showing, composer: chat.$.footer.showing,' +
            '  lit: document.querySelectorAll(".msg-selected").length, chat: chat.chatThread && chat.chatThread._id };' +
            'return state;' +
            '})()');
        assert.deepEqual(r, { count: '2 selected', order: true, hasDeleted: true, lit: 2, fits: true, composer: false, react: false,
            after: { bar: false, composer: true, lit: 0, chat: 'thread-family' } });
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
});
