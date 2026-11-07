/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/bubbleHit.js - only a tap on a message's bubble opens the reactions, not one on
 * the avatar or on the row beside the bubble. The nodes are shaped like ConversationItem's.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var bubbleHit = bootstrap.load('util/bubbleHit.js');

function node(className, parent) {
    return { className: className, parentNode: parent || null };
}

// chat-balloon row > imageContainer | messageContainer > message (the bubble) > messageText > span
var list = node('enyo-scroller');
var row = node('swipeable-item chat-balloon', list);
var content = node('swipeable-item-content', row);
var avatar = node('conversationContactImage', content);
var avatarImg = node('contact-image', avatar);
var container = node('flex-one', content);

describe('bubbleHit', function () {
    ['received', 'sent', 'error', 'system'].forEach(function (kind) {
        it('a tap inside a ' + kind + ' bubble', function () {
            var bubble = node('chat-balloon-' + kind + ' high-priority', container);
            var text = node('', bubble);
            var badge = node('reaction-badge reaction-mine', node('message-reactions', text));
            assert.equal(bubbleHit(bubble), true);
            assert.equal(bubbleHit(text), true);
            assert.equal(bubbleHit(badge), true);
        });
    });

    it('not on the avatar, the row beside the bubble, or outside any row', function () {
        assert.equal(bubbleHit(avatarImg), false);
        assert.equal(bubbleHit(container), false);
        assert.equal(bubbleHit(content), false);
        assert.equal(bubbleHit(row), false);
        assert.equal(bubbleHit(list), false);
        assert.equal(bubbleHit(null), false);
    });

    it('a bubble class must be a whole class name', function () {
        var notBubble = node('chat-balloon-receivedx', container);
        assert.equal(bubbleHit(node('', notBubble)), false);
    });

    it('stops at the row: a bubble class above it does not count', function () {
        var outer = node('chat-balloon-sent');
        var innerRow = node('chat-balloon', outer);
        assert.equal(bubbleHit(node('flex-one', innerRow)), false);
    });

    it('nodes without a string className (svg) are walked through', function () {
        var bubble = node('chat-balloon-received', container);
        var svg = { className: { baseVal: 'icon' }, parentNode: bubble };
        assert.equal(bubbleHit(svg), true);
    });
});
