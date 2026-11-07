/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/forward.js - Forward and Forward Via Email from the message menu. The message's
 * text goes as typed (the db holds it escaped, with <br> and numeric entities for astral emoji);
 * its file goes only when it is a path on this device; the email app gets them through its
 * newEmail launch parameter.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var fw = bootstrap.load('util/forward.js');

describe('forward.text', function () {
    it('as typed: no markup, no escapes, line breaks and emoji kept', function () {
        assert.equal(fw.text({ messageText: 'Fish &amp; chips<br>at 5 &lt;3' }), 'Fish & chips\nat 5 <3');
        assert.equal(fw.text({ messageText: 'hi <b>there</b> &#128512;' }), 'hi there \u{1F600}');
        assert.equal(fw.text({ messageText: 'a<BR/>b<br >c' }), 'a\nb\nc');
        assert.equal(fw.text({ messageText: '&quot;x&quot; &#39;y&#39;' }), '"x" \'y\'');
    });
    it('"" for none', function () {
        assert.equal(fw.text({}), '');
        assert.equal(fw.text(null), '');
        assert.equal(fw.text({ messageText: '<img src="x">' }), '');
    });
});

describe('forward.file', function () {
    it('a path on this device, a file:// URL made one', function () {
        assert.equal(fw.file({ filePath: '/media/internal/downloads/a.jpg' }), '/media/internal/downloads/a.jpg');
        assert.equal(fw.file({ filePath: 'file:///media/internal/My%20File.pdf' }), '/media/internal/My File.pdf');
    });
    it('nothing for a remote URL, a relative path, a bad escape or no file', function () {
        assert.equal(fw.file({ filePath: 'https://cdn.example/a.jpg' }), null);
        assert.equal(fw.file({ filePath: 'a.jpg' }), null);
        assert.equal(fw.file({ filePath: 'file:///bad%E0%A4%A' }), null);
        assert.equal(fw.file({ filePath: 42 }), null);
        assert.equal(fw.file({ filePath: '' }), null);
        assert.equal(fw.file(null), null);
    });
});

describe('forward.composeParams', function () {
    it('the text and the file, only those it has', function () {
        assert.deepEqual(fw.composeParams({ messageText: 'hi', filePath: '/m/a.jpg' }),
            { messageText: 'hi', filePath: '/m/a.jpg' });
        assert.deepEqual(fw.composeParams({ messageText: 'hi' }), { messageText: 'hi' });
        assert.deepEqual(fw.composeParams({ messageText: '', filePath: '/m/a.jpg' }), { filePath: '/m/a.jpg' });
    });
    it('null for nothing to forward', function () {
        assert.equal(fw.composeParams({ messageText: '', filePath: 'https://x/y' }), null);
        assert.equal(fw.composeParams(null), null);
    });
});

describe('forward.composeParamsFor', function () {
    it('the texts in order, a blank line apart, and every file in order', function () {
        assert.deepEqual(fw.composeParamsFor([
            { messageText: 'one' },
            { messageText: '', filePath: '/media/internal/a.jpg' },
            { messageText: 'two<br>lines', filePath: 'file:///media/internal/b.pdf' }
        ]), { messageText: 'one\n\ntwo\nlines', filePaths: ['/media/internal/a.jpg', '/media/internal/b.pdf'] });
    });
    it('only what there is: texts alone, files alone; a remote file is left out', function () {
        assert.deepEqual(fw.composeParamsFor([{ messageText: 'a' }, { messageText: 'b' }]),
            { messageText: 'a\n\nb' });
        assert.deepEqual(fw.composeParamsFor([
            { filePath: '/media/internal/a.jpg' }, { filePath: 'https://cdn.example/x.jpg' }
        ]), { filePaths: ['/media/internal/a.jpg'] });
    });
    it('null for nothing to forward', function () {
        assert.equal(fw.composeParamsFor([]), null);
        assert.equal(fw.composeParamsFor(null), null);
        assert.equal(fw.composeParamsFor([{ messageText: '' }, { filePath: 'x.jpg' }]), null);
    });
});

describe('forward.emailLaunch', function () {
    it("the email app's newEmail, as plain text, with the file attached", function () {
        assert.deepEqual(fw.emailLaunch({ messageText: 'a &amp; b', filePath: '/m/a.jpg' }), {
            id: 'com.palm.app.email',
            params: { newEmail: { text: 'a & b', isHtml: false, attachments: [{ fullPath: '/m/a.jpg' }] } }
        });
        assert.deepEqual(fw.emailLaunch({ messageText: 'hi' }),
            { id: 'com.palm.app.email', params: { newEmail: { text: 'hi', isHtml: false } } });
        assert.deepEqual(fw.emailLaunch({ filePath: '/m/a.jpg' }).params.newEmail,
            { text: '', isHtml: false, attachments: [{ fullPath: '/m/a.jpg' }] });
    });
    it('null for nothing to forward', function () {
        assert.equal(fw.emailLaunch({}), null);
        assert.equal(fw.emailLaunch(null), null);
    });
});
