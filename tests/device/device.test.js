/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * What the app does on a real device: that it is registered, that it launches, that the db8
 * queries it issues can actually be answered, that it lays itself out for the screen it is on,
 * and that it reaches that state without a console error.
 *
 * Driven by tests/device/run.sh, which deploys first. Needs:
 *   MESSAGING_DEVICE     adb serial
 *   MESSAGING_PACK_DIR   the packed build that was deployed
 *
 * The layout assertions go through WAM's inspector rather than a screenshot: "the thread list
 * fills the screen" is a fact about the live DOM, and a picture cannot be asserted on.
 */

var { describe, it, before, after } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var crypto = require('node:crypto');
var { execFileSync } = require('node:child_process');
var cdp = require('./cdp');

var SERIAL = process.env.MESSAGING_DEVICE;
var PACK = process.env.MESSAGING_PACK_DIR;
var APP_ID = 'org.webosports.app.messaging';
var APP_DIR = '/usr/palm/applications/' + APP_ID;

var forward, session, cursor, deviceName, firstUse, prefsId;

function sh(command) {
    return cdp.adb(SERIAL, ['shell', command]);
}

/** luna-send a request and parse the one reply. */
function luna(uri, payload) {
    // sam reports itself active before it has finished registering on the bus, and a call made in
    // that window comes back with nothing at all rather than an error. Give it a few tries.
    var out = '';
    for (var attempt = 0; attempt < 5; attempt++) {
        // -a: db8 permissions are keyed on the caller, and the prefs record may only be written
        // by the app itself. Without it a merge comes back "db: permission denied".
        out = sh("luna-send -n 1 -w 20000 -a " + APP_ID + " 'luna://" + uri + "' '" +
            JSON.stringify(payload) + "'");
        if (out.indexOf('{') !== -1) {
            return JSON.parse(out.slice(out.indexOf('{')));
        }
        execFileSync('sleep', ['2']);
    }
    assert.fail('luna-send printed no reply for ' + uri + ' after 5 tries: ' + out);
}

function find(query) {
    return luna('com.webos.service.db/find', { query: query });
}

before(async function () {
    assert.ok(SERIAL, 'set MESSAGING_DEVICE to an adb serial');
    assert.ok(PACK, 'set MESSAGING_PACK_DIR to the deployed build');
    deviceName = sh('cat /etc/hostname').trim();

    // Everything after this point gets checked against the journal, so mark the spot first.
    cursor = (sh('journalctl -b -n 0 --show-cursor 2>/dev/null | tail -n 1').match(/cursor: (.*)/) || [])[1];

    luna('com.webos.applicationManager/launch', { id: APP_ID });

    forward = cdp.forwardInspector(SERIAL);
    var target = await cdp.waitForTarget(forward.port, APP_ID + '/index.html', 30000);
    session = await cdp.attach(target);

    // enyo renders on its own schedule after load; wait for the thread list to exist rather than
    // for a fixed number of seconds.
    var deadline = Date.now() + 20000;
    for (;;) {
        var ready = await session.evaluate('!!document.querySelector(".messaging-pane")');
        if (ready) { break; }
        assert.ok(Date.now() < deadline, 'the app never rendered itself');
        await new Promise(function (r) { setTimeout(r, 500); });
    }

    // A device with no messaging account opens on the first-run screen instead of the thread
    // list, so which view is on screen has to be established before anything is measured.
    firstUse = await session.evaluate(
        '(function () {' +
        '  var b = document.querySelector(".connect-phone");' +
        '  return !!(b && b.getBoundingClientRect().height);' +
        '}())');
    var prefs = find({ from: 'com.palm.app.messagingprefs:1' });
    prefsId = prefs.results && prefs.results[0] && prefs.results[0]._id;
});

after(function () {
    if (session) { session.close(); }
    if (forward) { forward.close(); }
    try { luna('com.webos.applicationManager/closeByAppId', { id: APP_ID }); } catch (e) { /* fine */ }

    // The thread-list tests have to get past the first-run screen, and tapping Done stores
    // firstUseMode: false. Put it back, so the device is left as it was found - after the app is
    // gone, because it writes its preferences out again on the way down.
    if (firstUse && prefsId) {
        execFileSync('sleep', ['2']);
        try {
            luna('com.webos.service.db/merge',
                { objects: [{ _id: prefsId, firstUseMode: true }] });
        } catch (e) { /* reported by the tests themselves */ }
    }
});

describe('deployment', function () {
    it('serves the build that was packed, byte for byte', function () {
        var local = crypto.createHash('md5')
            .update(fs.readFileSync(path.join(PACK, 'index.html'))).digest('hex');
        var onDevice = sh('md5sum ' + APP_DIR + '/index.html').trim().split(/\s+/)[0];
        assert.equal(onDevice, local);
    });

    it('left nothing behind from the package it replaced', function () {
        // The packaged app ships enyo-luneos/, which the rewrite does not reference; a push over
        // the top would leave it being served. Which directories the build itself ships moves
        // with its libraries - webos-lib/ arrived with the LuneOS kinds - so hold the device to
        // what was packed, not to a list written out here.
        var packed = fs.readdirSync(PACK).sort();
        var entries = sh('ls ' + APP_DIR).trim().split(/\s+/).sort();
        assert.deepEqual(entries, packed);
    });
});

describe('registration', function () {
    it('sam lists the app from the directory it was deployed to', function () {
        var reply = luna('com.webos.applicationManager/listApps', {});
        assert.equal(reply.returnValue, true);
        var app = reply.apps.filter(function (a) { return a.id === APP_ID; })[0];
        assert.ok(app, 'sam does not know about ' + APP_ID);
        assert.equal(app.folderPath, APP_DIR);
        assert.equal(app.main, 'index.html');
    });
});

describe('the db8 queries the app issues', function () {
    it('answers the thread list', function () {
        assert.equal(find({
            from: 'com.palm.chatthread:1',
            where: [{ prop: 'flags.visible', op: '=', val: true }],
            orderBy: 'timestamp', desc: true
        }).returnValue, true);
    });

    it('answers a thread search', function () {
        assert.equal(luna('com.webos.service.db/search', {
            query: {
                from: 'com.palm.chatthread:1',
                where: [
                    { prop: 'flags.visible', op: '=', val: true },
                    { prop: 'displayName', op: '%', val: 'a', collate: 'primary', tokenize: 'all' }
                ],
                orderBy: 'timestamp', desc: true
            }
        }).returnValue, true);
    });

    it('answers a conversation', function () {
        assert.equal(find({
            from: 'com.palm.message:1',
            where: [
                { prop: 'conversations', op: '=', val: 'no-such-thread' },
                { prop: 'flags.visible', op: '=', val: true },
                { prop: 'localTimestamp', op: '>', val: 0 }
            ],
            orderBy: 'localTimestamp'
        }).returnValue, true);
    });

    it('answers the unread watch the notification banners run on', function () {
        // Needs the unreadbyfolder index on com.palm.message; without it every incoming message
        // goes unnoticed, with "db: no index for query" in the log and nothing on screen.
        assert.equal(find({
            from: 'com.palm.message:1',
            where: [
                { prop: 'folder', op: '=', val: 'inbox' },
                { prop: 'flags.read', op: '=', val: false }
            ],
            orderBy: 'localTimestamp', desc: true, limit: 20
        }).returnValue, true);
    });

    it('answers the login-state and favorites queries', function () {
        assert.equal(find({ from: 'com.palm.imloginstate:1' }).returnValue, true);
        assert.equal(find({
            from: 'com.palm.person:1',
            where: [{ prop: 'favorite', op: '=', val: true }],
            orderBy: 'sortKey'
        }).returnValue, true);
    });

    it('answers the server and channel lists', function () {
        assert.equal(find({ from: 'com.palm.imserver:1', orderBy: 'serviceName' }).returnValue, true);
        assert.equal(find({
            from: 'com.palm.imchannel:1',
            where: [{ prop: 'serverId', op: '=', val: 'x' }],
            orderBy: 'position'
        }).returnValue, true);
    });

    it('answers the person join', function () {
        assert.equal(find({
            from: 'com.palm.person:1',
            where: [{ prop: '_id', op: '=', val: ['a', 'b'] }]
        }).returnValue, true);
    });

    it('answers the invitation watch', function () {
        // com.palm.iminvitation belongs to com.palm.app.messaging and has no index on `accepted`,
        // so the watch rides the revision index instead and filters in the app.
        assert.equal(find({
            from: 'com.palm.iminvitation:1',
            where: [{ prop: '_rev', op: '>', val: 0 }]
        }).returnValue, true);
    });

    it('answers the buddy list, where an IM transport is installed', function (t) {
        var probe = find({ from: 'com.palm.imbuddystatus:1', limit: 1 });
        if (probe.returnValue === false && /kind not registered/.test(probe.errorText || '')) {
            return t.skip('no IM transport on ' + deviceName + ': com.palm.imbuddystatus is unknown');
        }
        assert.equal(find({
            from: 'com.palm.imbuddystatus:1',
            where: [
                { prop: 'primary', op: '=', val: true },
                { prop: 'offline', op: '=', val: false },
                { prop: 'groupAvailability', op: '%', val: '', collate: 'secondary' }
            ]
        }).returnValue, true);
    });
});

describe('the running app', function () {
    it('runs against db8, not the in-browser mock data', function () {
        // mockDb turns itself on when window.PalmSystem is absent, which is how the app is
        // developed in a desktop browser. On a device that must never be the case.
        return session.evaluate('!!window.PalmSystem').then(function (hasPalmSystem) {
            assert.equal(hasPalmSystem, true);
        });
    });

    it('rendered its chrome', function () {
        return session.evaluate('document.body.textContent').then(function (text) {
            assert.match(text, /New Conversation/);
        });
    });
});

describe('the first-run screen', function () {
    it('fits what it asks the user to do onto the screen', function (t) {
        if (!firstUse) {
            return t.skip('an account is already set up on ' + deviceName);
        }
        // On a 720x720 panel there are 380px of viewport once the two toolbars are taken off,
        // and a centred column that does not fit overflows past both edges - the Add An Account
        // button ended up underneath the footer, unreachable.
        return session.evaluate(
            '(function () {' +
            '  var b = document.querySelector(".connect-phone").getBoundingClientRect();' +
            '  return { top: b.top, bottom: b.bottom, view: window.innerHeight };' +
            '}())'
        ).then(function (box) {
            assert.ok(box.top >= 0, 'Add An Account starts ' + -box.top + 'px above the screen');
            assert.ok(box.bottom <= box.view,
                'Add An Account ends ' + (box.bottom - box.view) + 'px below the screen');
        });
    });

    it('keeps Done reachable', function (t) {
        if (!firstUse) {
            return t.skip('an account is already set up on ' + deviceName);
        }
        return session.evaluate(
            '(function () {' +
            '  var buttons = document.querySelectorAll(".onyx-toolbar .onyx-button");' +
            '  for (var i = 0; i < buttons.length; i++) {' +
            '    var r = buttons[i].getBoundingClientRect();' +
            '    if (r.height && /Done/.test(buttons[i].textContent)) {' +
            '      return { top: r.top, bottom: r.bottom, view: window.innerHeight };' +
            '    }' +
            '  }' +
            '  return null;' +
            '}())'
        ).then(function (box) {
            assert.ok(box, 'no Done button on the first-run screen');
            assert.ok(box.bottom <= box.view + 1 && box.top >= 0, 'Done is off screen');
        });
    });
});

describe('the layout on this screen', function () {
    before(async function () {
        // Get to the thread list. On a device with no account that means tapping Done, which is
        // what a user does once; after() puts the stored flag back.
        if (firstUse) {
            await session.tap('.onyx-toolbar .onyx-button.onyx-dark');
            var deadline = Date.now() + 15000;
            for (;;) {
                var laid = await session.evaluate(
                    'document.querySelector(".messaging-pane").getBoundingClientRect().width');
                if (laid > 0) { break; }
                assert.ok(Date.now() < deadline, 'the thread list never took the screen');
                await new Promise(function (r) { setTimeout(r, 500); });
            }
        }
    });

    it('agrees with Panels about how wide this screen is', function () {
        // Both the CSS (a max-width: 800px media query) and MainView's navigation
        // (Panels.isScreenNarrow) key off the same threshold; this is the input they share.
        return session.evaluate('window.innerWidth').then(function (width) {
            assert.ok(width > 0, 'no viewport width');
        });
    });

    it('applies the narrow-fit class to the sliding panels', function (t) {
        return session.evaluate(
            '({ cls: document.querySelector(".messaging-pane").parentNode.className,' +
            '   view: window.innerWidth })'
        ).then(function (info) {
            if (info.view > 800) {
                return t.skip(deviceName + ' is ' + info.view + 'px wide, so it lays out in two panes');
            }
            assert.match(info.cls, /enyo-panels-(fit|force)-narrow/);
        });
    });

    it('lays the panes out for the width it has', function () {
        return session.evaluate(
            '(function () {' +
            '  var pane = document.querySelector(".messaging-pane").getBoundingClientRect();' +
            '  var chat = document.querySelector(".conversation-pane");' +
            '  chat = chat && chat.getBoundingClientRect();' +
            '  return {' +
            '    view: window.innerWidth,' +
            '    pane: pane.width,' +
            '    chatLeft: chat ? chat.left : null,' +
            '    chatWidth: chat ? chat.width : null' +
            '  };' +
            '}())'
        ).then(function (box) {
            assert.notEqual(box.chatLeft, null, 'no conversation pane in the dom');
            if (box.view > 800) {
                // Wide: the Mojo SlidingPane arrangement - a 320px list beside the conversation,
                // both on screen at once.
                assert.equal(Math.round(box.pane), 320,
                    'thread list is ' + box.pane + 'px, not the 320px column');
                assert.equal(Math.round(box.chatLeft), 320,
                    'conversation pane starts at ' + box.chatLeft + 'px, not beside the list');
                assert.equal(Math.round(box.chatLeft + box.chatWidth), Math.round(box.view),
                    'conversation pane does not reach the right edge');
            } else {
                // Narrow: one pane at a time. The list takes the screen and the conversation
                // waits off the right edge until a thread is picked. Pinning the 320px column
                // here is what used to leave the conversation a 130px sliver on a phone.
                assert.equal(Math.round(box.pane), Math.round(box.view),
                    'thread list is ' + box.pane + 'px of a ' + box.view + 'px viewport');
                assert.ok(box.chatLeft >= box.view - 1,
                    'conversation pane starts at ' + box.chatLeft + 'px, inside the viewport');
            }
        });
    });

    it('shows the thread list chrome', function () {
        return session.evaluate('document.body.textContent').then(function (text) {
            assert.match(text, /New Conversation/);
        });
    });

    it('does not scroll sideways', function () {
        return session.evaluate(
            '({ scroll: document.documentElement.scrollWidth, view: window.innerWidth })'
        ).then(function (box) {
            assert.ok(box.scroll <= box.view,
                'page scrolls to ' + box.scroll + 'px in a ' + box.view + 'px viewport');
        });
    });
});

describe('the journal since launch', function () {
    it('holds no console error from the app', function () {
        var since = cursor ? "--after-cursor='" + cursor + "'" : '-b';
        var log = sh('journalctl ' + since + ' --no-pager 2>/dev/null | grep -F ' + APP_ID +
            " | grep -E 'ERROR:CONSOLE|SyntaxError' | head -n 20 || true");

        // The account service hands back icon paths under /usr/palm/public, which is outside the
        // app's folder and so outside what the renderer will load over file://. Those are Palm's
        // images anyway and are being replaced with the app's own, which removes the reference
        // along with the error. Everything else is a real console error and fails here.
        var lines = log.split('\n').filter(function (line) {
            return line.trim() &&
                !/Access is blocked to resource: file:\/\/\/usr\/palm\/public\//.test(line);
        });
        assert.deepEqual(lines, []);
    });

    it('holds no bus call the app was not allowed to make', function () {
        var since = cursor ? "--after-cursor='" + cursor + "'" : '-b';
        var log = sh('journalctl ' + since + ' --no-pager 2>/dev/null' +
            " | grep -F " + APP_ID + " | grep -iE 'not allow|denied|LS_REQUIRES_SECURITY'" +
            ' | head -n 20 || true');
        assert.equal(log.trim(), '');
    });
});
