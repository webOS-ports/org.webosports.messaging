/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/launchTargets.js - what a tap on a location or a contact card launches, and an
 * outgoing message's text as HTML.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var lt = bootstrap.load('util/launchTargets.js');
var messagingUtils = bootstrap.load('util/messagingUtils.js');
var escapeHtml = messagingUtils.message.escapeHtml;

describe('launchTargets.mapsLaunch', function () {
    it('opens the Maps app LuneOS has, at the place', function () {
        assert.deepEqual(lt.mapsLaunch('52.370216,4.895168'),
            { id: 'org.webosports.app.maps', params: { target: 'geo:52.370216,4.895168' } });
        assert.deepEqual(lt.mapsLaunch('-33.8688, -151.2093').params.target, 'geo:-33.8688,-151.2093');
    });
    it('nothing for what is not a place', function () {
        assert.equal(lt.mapsLaunch('somewhere'), null);
        assert.equal(lt.mapsLaunch('52.3'), null);
        assert.equal(lt.mapsLaunch(''), null);
        assert.equal(lt.mapsLaunch(undefined), null);
    });
});

describe('launchTargets.contactLaunch', function () {
    it('gives Contacts the file itself, without the label', function () {
        assert.deepEqual(
            lt.contactLaunch('file:///media/internal/.im-attachments/whatsapp/contact_ab12.vcf?name=Jane%20Doe'),
            { id: 'com.palm.app.contacts', params: { target: 'file:///media/internal/.im-attachments/whatsapp/contact_ab12.vcf' } });
    });
    it('a plain path, and percent-escapes in the name undone', function () {
        assert.equal(lt.vcardPath('/media/internal/a b.vcf'), '/media/internal/a b.vcf');
        assert.equal(lt.vcardPath('file:///media/internal/a%20b.vcf#x'), '/media/internal/a b.vcf');
        assert.equal(lt.vcardPath('file:///media/internal/100%.vcf'), '/media/internal/100%.vcf');
    });
    it('nothing for what names no file', function () {
        assert.equal(lt.contactLaunch('https://example.com/card.vcf'), null);
        assert.equal(lt.contactLaunch('?name=x'), null);
        assert.equal(lt.contactLaunch(''), null);
    });
});

describe('launchTargets.outgoingHtml', function () {
    it('a message sent from the phone\'s own app keeps its line breaks as breaks', function () {
        assert.equal(lt.outgoingHtml('Location<br />\ngeo:1.5,2.5', escapeHtml), 'Location<br>geo:1.5,2.5');
        assert.equal(lt.outgoingHtml('a<BR>b<br/>\r\nc', escapeHtml), 'a<br>b<br>c');
    });
    it('typed text is escaped, its own line breaks drawn', function () {
        assert.equal(lt.outgoingHtml('<b>hi</b> & bye', escapeHtml), '&lt;b&gt;hi&lt;/b&gt; &amp; bye');
        assert.equal(lt.outgoingHtml('one\ntwo\r\nthree', escapeHtml), 'one<br>two<br>three');
        assert.equal(lt.outgoingHtml('<script>x</script>\n', escapeHtml), '&lt;script&gt;x&lt;/script&gt;<br>');
        assert.equal(lt.outgoingHtml(null, escapeHtml), '');
    });
});
