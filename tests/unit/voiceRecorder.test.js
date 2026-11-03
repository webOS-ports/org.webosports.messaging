/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/voiceRecorder.js - the mediarecorder steps for a voice message.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var VoiceRecorder = bootstrap.load('util/voiceRecorder.js');

/** A fake service: answers from `replies` (method -> response), or holds a call when told to. */
function fakeService(replies, held) {
    var calls = [], pending = {};
    function call(method, params, done) {
        calls.push([method, params]);
        var reply = Object.prototype.hasOwnProperty.call(replies, method) ? replies[method] : { returnValue: true };
        if (held && held.indexOf(method) >= 0) {
            pending[method] = function () { done(null, reply); };
            return;
        }
        done(null, reply);
    }
    return { call: call, calls: calls, release: function (m) { pending[m](); } };
}

var OK = {
    open: { returnValue: true, recorderId: 7 },
    stop: { returnValue: true, path: '/media/internal/.im-attachments/Audio_1.m4a' }
};

function methods(svc) { return svc.calls.map(function (c) { return c[0]; }); }

describe('voiceRecorder', function () {
    it('opens, points at the attachment folder, records, and on stop returns the file and closes', function () {
        var svc = fakeService(OK), rec = new VoiceRecorder(svc.call), result = {};
        rec.start(function (err) { result.start = err; });
        assert.equal(result.start, null);
        assert.equal(rec.state, 'recording');
        assert.deepEqual(svc.calls[1], ['setOutputFile',
            { recorderId: 7, path: '/media/internal/.im-attachments/' }]);
        rec.stop(function (err, path) { result.err = err; result.path = path; });
        assert.deepEqual(methods(svc), ['open', 'setOutputFile', 'start', 'stop', 'close']);
        assert.equal(result.err, null);
        assert.equal(result.path, '/media/internal/.im-attachments/Audio_1.m4a');
        assert.equal(rec.isBusy(), false);
    });

    it('reports a refused open (no permission) and stays idle without closing anything', function () {
        var svc = fakeService({ open: { returnValue: false, errorText: 'Denied method call open' } });
        var rec = new VoiceRecorder(svc.call), err;
        rec.start(function (e) { err = e; });
        assert.equal(err, 'Denied method call open');
        assert.deepEqual(methods(svc), ['open']);
        assert.equal(rec.isBusy(), false);
    });

    it('closes the recorder when a later step fails', function () {
        var svc = fakeService({ open: OK.open, start: { returnValue: false, errorText: 'no mic' } });
        var rec = new VoiceRecorder(svc.call), err;
        rec.start(function (e) { err = e; });
        assert.equal(err, 'no mic');
        assert.deepEqual(methods(svc), ['open', 'setOutputFile', 'start', 'close']);
        assert.equal(rec.isBusy(), false);
    });

    it('a stop without a file path is an error, and the recorder is still closed', function () {
        var svc = fakeService({ open: OK.open, stop: { returnValue: true } });
        var rec = new VoiceRecorder(svc.call), err;
        rec.start(function () {});
        rec.stop(function (e) { err = e; });
        assert.ok(err);
        assert.equal(methods(svc).pop(), 'close');
    });

    it('cancelled while opening: closes the recorder and never starts it', function () {
        var svc = fakeService(OK, ['open']), rec = new VoiceRecorder(svc.call), err;
        rec.start(function (e) { err = e; });
        rec.cancel();
        svc.release('open');
        assert.equal(err, 'cancelled');
        assert.deepEqual(methods(svc), ['open', 'close']);
        assert.equal(rec.isBusy(), false);
    });

    it('cancel while recording stops and closes without handing back a file', function () {
        var svc = fakeService(OK), rec = new VoiceRecorder(svc.call);
        rec.start(function () {});
        rec.cancel();
        assert.deepEqual(methods(svc), ['open', 'setOutputFile', 'start', 'stop', 'close']);
        assert.equal(rec.isBusy(), false);
    });

    it('refuses a second start and a stop when idle', function () {
        var svc = fakeService(OK), rec = new VoiceRecorder(svc.call), errs = [];
        rec.stop(function (e) { errs.push(e); });
        rec.start(function () {});
        rec.start(function (e) { errs.push(e); });
        assert.deepEqual(errs, ['not recording', 'already recording']);
        assert.deepEqual(methods(svc), ['open', 'setOutputFile', 'start']);
    });
});
