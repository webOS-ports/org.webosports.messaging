/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/messageState.js - a message the sender edited, or deleted for everyone, as
 * imlibpurpleservice marks it (edited: true / deleted: true, MessageChanges.cpp).
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var ms = bootstrap.load('util/messageState.js');

describe('messageState.isDeleted', function () {
    it('only on deleted: true', function () {
        assert.equal(ms.isDeleted({ deleted: true, messageText: 'This message was deleted.' }), true);
        assert.equal(ms.isDeleted({ deleted: 'true' }), false);
        assert.equal(ms.isDeleted({ messageText: 'This message was deleted.' }), false);
        assert.equal(ms.isDeleted(null), false);
    });
});

describe('messageState.timeLine', function () {
    it('the time, and Edited after it when it was', function () {
        assert.equal(ms.timeLine({}, '10:54 AM'), '10:54 AM');
        assert.equal(ms.timeLine({ edited: true }, '10:54 AM'), '10:54 AM · Edited');
        assert.equal(ms.timeLine({ edited: true }, ''), 'Edited');
        assert.equal(ms.timeLine({ edited: 1 }, '10:54 AM'), '10:54 AM');
        assert.equal(ms.timeLine({}, undefined), '');
    });
    it('not Edited once deleted', function () {
        assert.equal(ms.isEdited({ edited: true, deleted: true }), false);
        assert.equal(ms.timeLine({ edited: true, deleted: true }, '10:54 AM'), '10:54 AM');
        assert.equal(ms.isEdited(null), false);
    });
});

describe('messageState.deletedHtml', function () {
    it('says so, in the deleted style', function () {
        assert.equal(ms.deletedHtml(), '<span class="msg-deleted">This message was deleted.</span>');
    });
});
