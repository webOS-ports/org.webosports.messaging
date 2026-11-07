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

    // Find in Chat, from the app menu: the newest match first, older from there, and back closes
    // the bar before it leaves the chat.
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
            'var offered = main.$.findInChatMenuItem.showing;' +
            'main.findInChat(); await wait(300);' +
            'chat.searchChanged(null, { value: "BRING" }); await wait(100);' +
            'var count = chat.$.searchCount.getContent();' +
            'var hit = document.querySelector(".search-hit");' +
            'var newest = !!hit && /jacket/.test(hit.textContent);' +
            'chat.searchOlder(); await wait(100);' +
            'var older = chat.$.searchCount.getContent();' +
            'hit = document.querySelector(".search-hit");' +
            'var olderHit = !!hit && /dessert/.test(hit.textContent);' +
            'Signals.send("onbackgesture", {}); await wait(300);' +
            'return { offered: offered, count: count, newest: newest, older: older, olderHit: olderHit,' +
            '  closed: !chat.$.searchBar.showing && !document.querySelector(".search-hit"),' +
            '  chatStill: chat.chatThread && chat.chatThread._id };' +
            '})()');
        assert.deepEqual(r, { offered: true, count: '2 of 2', newest: true, older: '1 of 2', olderHit: true,
            closed: true, chatStill: 'thread-family' });
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
        assert.deepEqual(r, { rows: 6, whole: true, onScreen: true, mid: true, light: true, helpShown: true, appDark: true });
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

    // Select, in the message menu: taps pick messages, the bar takes the composer's place with all
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
            'chat.selectedMessage = m[last]; chat.menuSelect(); await wait(100);' +
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
