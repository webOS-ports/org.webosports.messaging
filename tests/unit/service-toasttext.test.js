/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * What a toast says, in the two places that raise one: the app's DashboardManager while the app
 * runs, and the service's notifier while it does not. The bodies are the shapes the transports
 * write (see webos-synergy-revival/messaging): HTML from libpurple, Telegram's <img>, a file://
 * with a caption, and the poll/event/geo tokens.
 */

"use strict";

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var bootstrap = require('./bootstrap');

var utils = bootstrap.load('util/messagingUtils.js');
var toasttext = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'toasttext.js'));
var { createNotifier } = require(path.resolve(__dirname, '..', '..', 'service', 'lib', 'notify.js'));

var IM = 'com.palm.immessage.libpurple:1';
var SOB = String.fromCodePoint(0x1F62D);

// [ what it is, the message, what the toast should say ]
var CASES = [
    ['plain text', { messageText: 'see you at 8' }, 'see you at 8'],
    ['a raw file, voice note', { _kind: IM, messageText: 'file:///media/internal/.im-attachments/abc.data' }, 'Voice message'],
    ['a raw file, photo', { _kind: IM, messageText: 'file:///media/internal/a.JPG' }, 'Photo'],
    ['a raw file, video', { _kind: IM, messageText: 'file:///media/internal/a.mp4' }, 'Video'],
    ['a raw file, document', { _kind: IM, messageText: 'file:///media/internal/a.pdf' }, 'Document received'],
    ['a raw file of no known type', { _kind: IM, messageText: 'file:///media/internal/a.zip' }, 'Attachment'],
    ['a file with a caption', { _kind: IM, messageText: 'file:///m/a.jpg\nlook at this' }, 'look at this'],
    ['a file of no known type with a caption', { _kind: IM, messageText: 'file:///m/a.zip\nthe report' }, 'the report'],
    ['a Telegram photo', { _kind: IM, messageText: '<img src="file:///m/t/a.jpg">' }, 'Photo'],
    ['a Telegram document', { _kind: IM, messageText: '<a href="file:///m/t/a.zip">report.zip</a>' }, 'report.zip'],
    ['a purple image with no source', { _kind: IM, messageText: '<img id="3" alt="x"/>' }, ''],
    ['a link to a picture', { _kind: IM, messageText: 'https://x.test/y.png' }, 'Photo'],
    ['a link that is not media', { messageText: 'go to https://x.test/page' }, 'go to https://x.test/page'],
    ['escaped text', { _kind: IM, messageText: 'a &gt; b &amp; c &lt;d&gt; it&#39;s &quot;x&quot;' }, 'a > b & c <d> it\'s "x"'],
    ['tags from a transport', { _kind: IM, messageText: '<b>bold</b> and <a href="http://x/">a link</a>' }, 'bold and a link'],
    ['angle brackets in an SMS', { messageText: 'a <b> c' }, 'a <b> c'],
    ['lines', { messageText: 'one\r\ntwo\n\nthree' }, 'one two three'],
    ['escaped lines', { messageText: 'one\\ntwo' }, 'one two'],
    ['emoji', { messageText: 'hi ' + SOB + ' there' }, 'hi there'],
    ['emoji as an entity', { messageText: '&#128557; ok' }, 'ok'],
    ['a joined emoji', { messageText: 'hi ' + SOB + '‍' + SOB + '️' }, 'hi'],
    ['only emoji', { messageText: SOB }, ''],
    ['a poll', { messageText: 'poll:eyJuYW1lIjoieCJ9' }, 'Poll'],
    ['an event', { messageText: 'event:eyJuYW1lIjoieCJ9' }, 'Event'],
    ['a location', { messageText: 'geo:52.1,4.3' }, 'Location'],
    ['a location with a name', { messageText: 'Home geo:52.1,4.3' }, 'Home'],
    ['an MMS', { _kind: 'com.palm.mmsmessage:1', messageText: 'x' }, 'New MMS on your phone'],
    ['a subject', { subject: 'Subj', messageText: 'body' }, 'Subj'],
    ['nothing', { messageText: '' }, ''],
    ['no body at all', {}, '']
];

describe('a toast\'s text', function () {
    CASES.forEach(function (c) {
        it(c[0] + ', in the app', function () {
            assert.equal(utils.message.getNotificationText(c[1]), c[2]);
        });
        it(c[0] + ', in the service', function () {
            assert.equal(toasttext.notificationText(c[1]), c[2]);
        });
    });

    it('copes with no message', function () {
        assert.equal(utils.message.getNotificationText(undefined), '');
        assert.equal(toasttext.notificationText(undefined), '');
    });

    it('never leaves a file:// in a mixed body', function () {
        ['see file:///m/a.zip now', '<a href="file:///m/a.zip">file:///m/a.zip</a>'].forEach(function (messageText) {
            var msg = { _kind: IM, messageText: messageText };
            assert.doesNotMatch(utils.message.getNotificationText(msg), /file:/);
            assert.doesNotMatch(toasttext.notificationText(msg), /file:/);
        });
    });
});

describe('the notifier', function () {
    function setup() {
        var toasts = [];
        var notifier = createNotifier({
            db: { find: function () { return Promise.resolve([]); } },
            call: function (uri, payload) {
                if (uri.endsWith('/createToast')) { toasts.push(payload); }
                return Promise.resolve({ running: [] });
            },
            log: { error: function () {} },
            now: function () { return 1000; }
        });
        return { notifier: notifier, toasts: toasts };
    }

    function send(msg, thread) {
        var s = setup();
        return s.notifier.notify(new Map([['t1', Object.assign({ localTimestamp: 1000 }, msg)]]),
            new Map([['t1', thread]])).then(function () { return s.toasts[0]; });
    }

    it('sends the name as the title and the text as the message', async function () {
        var toast = await send({ _kind: IM, from: { addr: 'x' }, messageText: 'file:///m/a.opus' }, { displayName: 'Alice' });
        assert.equal(toast.title, 'Alice');
        assert.equal(toast.message, 'Voice message');
    });

    it('takes the emoji out of the name as well', async function () {
        var toast = await send({ messageText: 'hi' }, { displayName: '&#128049; Alice ' + SOB });
        assert.equal(toast.title, 'Alice');
    });

    it('still says something when nothing of the body can be shown', async function () {
        // notificationmgr answers "Message can't be empty" and the message goes unannounced.
        var toast = await send({ messageText: SOB }, { displayName: 'Alice' });
        assert.equal(toast.message, 'New message');
    });
});
