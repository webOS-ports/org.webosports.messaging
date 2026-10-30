/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * app/src/util/messagingUtils.js - the shared logic ported from the Mojo app's utilities/utils.js.
 * Everything here is pure, so it runs on the host; nothing in this file needs a device.
 */

var { describe, it } = require('node:test');
var assert = require('node:assert/strict');
var bootstrap = require('./bootstrap');

var utils = bootstrap.load('util/messagingUtils.js');
var message = utils.message;
var person = utils.person;
var thread = utils.thread;
var u = utils.utils;

describe('message.removeHtml', function () {
    it('drops a script element and everything inside it', function () {
        assert.equal(message.removeHtml('a<script>evil()</script>b'), 'ab');
        assert.equal(message.removeHtml('<SCRIPT src="x.js">evil()</SCRIPT>'), '');
        assert.equal(message.removeHtml('a<script>\nmulti\nline\n</script>b'), 'ab');
    });

    it('drops tags but keeps their text', function () {
        assert.equal(message.removeHtml('<b>hi</b>'), 'hi');
        assert.equal(message.removeHtml('<a href="http://x/">link</a>'), 'link');
    });

    it('coerces non-strings, since db records are not guaranteed to hold them', function () {
        assert.equal(message.removeHtml(42), '42');
    });

    it('passes falsy values straight through', function () {
        assert.equal(message.removeHtml(''), '');
        assert.equal(message.removeHtml(undefined), undefined);
        assert.equal(message.removeHtml(null), null);
    });
});

describe('message.escapeHtml / unescapeText', function () {
    it('escapes the five markup characters', function () {
        assert.equal(message.escapeHtml('<a href="x">&\'</a>'),
            '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    });

    it('escaping runs & first, so nothing is double-escaped', function () {
        assert.equal(message.escapeHtml('&lt;'), '&amp;lt;');
    });

    it('null and undefined escape to the empty string', function () {
        assert.equal(message.escapeHtml(undefined), '');
        assert.equal(message.escapeHtml(null), '');
    });

    it('unescapeText reverses the named entities', function () {
        assert.equal(message.unescapeText('&lt;b&gt;&amp;&quot;&apos;'), '<b>&"\'');
    });
});

describe('message.getMessageText', function () {
    it('a subject wins over the body', function () {
        assert.equal(message.getMessageText({ subject: 'Subj', messageText: 'Body' }), 'Subj');
    });

    it('MMS keeps its body in the first text/plain attachment', function () {
        assert.equal(message.getMessageText({
            serviceName: 'mms',
            messageText: 'ignored',
            attachments: [
                { mimeType: 'image/jpeg', partText: 'no' },
                { mimeType: 'text/plain', partText: 'the body' },
                { mimeType: 'text/plain', partText: 'later' }
            ]
        }), 'the body');
    });

    it('an MMS with no text part reads as empty', function () {
        assert.equal(message.getMessageText({ serviceName: 'mms', attachments: [] }), '');
        assert.equal(message.getMessageText({ serviceName: 'mms' }), '');
    });

    it('anything else is the messageText', function () {
        assert.equal(message.getMessageText({ messageText: 'hi' }), 'hi');
        assert.equal(message.getMessageText({}), '');
        assert.equal(message.getMessageText(undefined), '');
    });
});

describe('message.getAddressesForThreading', function () {
    it('a group chat threads on its name', function () {
        assert.deepEqual(message.getAddressesForThreading({ groupChatName: 'The Group' }),
            [{ addr: 'The Group' }]);
    });

    it('an outgoing message threads on its recipients', function () {
        assert.deepEqual(message.getAddressesForThreading({
            folder: 'outbox',
            to: [{ addr: 'a' }, { addr: 'b' }]
        }), [{ addr: 'a' }, { addr: 'b' }]);
    });

    it('an incoming message threads on its sender', function () {
        assert.deepEqual(message.getAddressesForThreading({ folder: 'inbox', from: { addr: 'a' } }),
            [{ addr: 'a' }]);
    });

    it('a message with no usable address yields an empty list, never undefined', function () {
        assert.deepEqual(message.getAddressesForThreading({ folder: 'inbox' }), []);
        assert.deepEqual(message.getAddressesForThreading(undefined), []);
    });
});

describe('message read/visible/replacement flags', function () {
    it('isVisible defaults to true and only flags.visible===false hides', function () {
        assert.equal(message.isVisible({}), true);
        assert.equal(message.isVisible({ flags: {} }), true);
        assert.equal(message.isVisible({ flags: { visible: false } }), false);
    });

    it('isUnread is inbox-only and respects read and visible', function () {
        assert.equal(message.isUnread({ folder: 'inbox' }), true);
        assert.equal(message.isUnread({ folder: 'inbox', flags: {} }), true);
        assert.equal(message.isUnread({ folder: 'inbox', flags: { read: true } }), false);
        assert.equal(message.isUnread({ folder: 'inbox', flags: { visible: false } }), false);
        assert.equal(message.isUnread({ folder: 'outbox' }), false);
    });

    it('isReplacementMessage covers SMS types 0x41..0x47 and nothing else', function () {
        assert.equal(message.isReplacementMessage({ smsType: 0x40 }), false);
        assert.equal(message.isReplacementMessage({ smsType: 0x41 }), true);
        assert.equal(message.isReplacementMessage({ smsType: 0x47 }), true);
        assert.equal(message.isReplacementMessage({ smsType: 0x48 }), false);
        assert.equal(message.isReplacementMessage({}), false);
        assert.equal(message.isReplacementMessage(undefined), false);
    });
});

describe('message.getMessageErrorFromCode', function () {
    it('a known code with no data returns the template unexpanded', function () {
        assert.equal(message.getMessageErrorFromCode('fdnrestricted'), 'Number is FDN restricted');
    });

    it('placeholders are filled from the message data', function () {
        assert.equal(message.getMessageErrorFromCode('smsnetworkerror', { networkErrorCode: 42 }),
            'Could not send your message due to a network error. Try again. 42');
    });

    it('a placeholder with no matching field is left in place', function () {
        assert.equal(message.getMessageErrorFromCode('smsnetworkerror', {}),
            'Could not send your message due to a network error. Try again. {networkErrorCode}');
    });

    it('an unknown code falls back, and a permanent failure drops "Try again"', function () {
        assert.equal(message.getMessageErrorFromCode('nosuchcode'),
            'Could not send your message. Try again.');
        assert.equal(message.getMessageErrorFromCode('nosuchcode', { status: 'permanent-fail' }),
            'Could not send your message.');
        assert.equal(message.getMessageErrorFromCode('nosuchcode', { status: 'failed' }),
            'Could not send your message. Try again.');
    });
});

describe('utils.isTextMessage', function () {
    it('treats an absent or empty service as SMS, as the db records do', function () {
        assert.equal(u.isTextMessage(undefined), true);
        assert.equal(u.isTextMessage(''), true);
    });

    it('accepts the sms/mms services and the phone-number types', function () {
        assert.equal(u.isTextMessage('sms'), true);
        assert.equal(u.isTextMessage('mms'), true);
        assert.equal(u.isTextMessage('type_mobile'), true);
        assert.equal(u.isTextMessage('type_work_fax2'), true);
    });

    it('rejects IM services', function () {
        assert.equal(u.isTextMessage('type_whatsapp'), false);
        assert.equal(u.isTextMessage('type_signal'), false);
        assert.equal(u.isTextMessage('aol'), false);
    });
});

describe('utils.normalizeShortcode', function () {
    it('accepts 2..6 digits, which is what carriers use for shortcodes', function () {
        assert.equal(u.normalizeShortcode('12'), '12');
        assert.equal(u.normalizeShortcode('123456'), '123456');
    });

    it('strips punctuation before measuring', function () {
        assert.equal(u.normalizeShortcode('123-45'), '12345');
    });

    it('rejects anything that is really a phone number, or too short to be either', function () {
        assert.equal(u.normalizeShortcode('1'), false);
        assert.equal(u.normalizeShortcode('1234567'), false);
        assert.equal(u.normalizeShortcode('no digits'), false);
        assert.equal(u.normalizeShortcode(''), false);
    });
});

describe('utils.subscriberNumber', function () {
    it('keeps the last ten digits, so country and trunk prefixes do not split a thread', function () {
        assert.equal(u.subscriberNumber('+1 (555) 123-4567'), '5551234567');
        assert.equal(u.subscriberNumber('0031612345678'), '1612345678');
    });

    it('keeps a short-but-valid local number whole', function () {
        assert.equal(u.subscriberNumber('555-1234'), '5551234');
    });

    it('returns empty for anything under seven digits', function () {
        assert.equal(u.subscriberNumber('12345'), '');
        assert.equal(u.subscriberNumber(''), '');
    });
});

describe('utils.normalizeAddress', function () {
    it('reduces a phone number to its subscriber digits', function () {
        assert.equal(u.normalizeAddress('+1 (555) 123-4567', 'sms'), '5551234567');
        assert.equal(u.normalizeAddress('5551234567', 'sms'), '5551234567');
    });

    it('two spellings of one number key the same conversation', function () {
        assert.equal(u.normalizeAddress('+1 555 123 4567', 'sms'),
            u.normalizeAddress('(555) 123-4567', 'sms'));
    });

    it('leaves a shortcode as its digits', function () {
        assert.equal(u.normalizeAddress('12345', 'sms'), '12345');
    });

    it('lowercases a non-phone address', function () {
        assert.equal(u.normalizeAddress('Foo@Example.COM', 'sms'), 'foo@example.com');
        assert.equal(u.normalizeAddress('ScreenName', 'aol'), 'screenname');
    });

    it('unwraps an address object', function () {
        assert.equal(u.normalizeAddress({ addr: '5551234567' }, 'sms'), '5551234567');
        assert.equal(u.normalizeAddress({ value: '5551234567' }, 'sms'), '5551234567');
    });

    it('falls back to the no-recipient label', function () {
        assert.equal(u.normalizeAddress('', 'sms'), u.kMissingAddress);
        assert.equal(u.normalizeAddress(undefined, 'sms'), u.kMissingAddress);
        assert.equal(u.normalizeAddress({}, 'sms'), u.kMissingAddress);
    });

    it('trims surrounding whitespace', function () {
        assert.equal(u.normalizeAddress('  5551234567  ', 'sms'), '5551234567');
    });

    describe('WhatsApp', function () {
        it('unifies the +phone, bare phone and JID spellings onto one E.164 key', function () {
            // E.164, the form a contact keeps a WhatsApp im in, so the thread finds its contact;
            // the messaging service keys threads the same way.
            var jid = u.normalizeAddress('31612345678@s.whatsapp.net', 'type_whatsapp');
            assert.equal(u.normalizeAddress('+31612345678', 'type_whatsapp'), jid);
            assert.equal(u.normalizeAddress('31612345678', 'type_whatsapp'), jid);
            assert.equal(jid, '+31612345678');
        });

        it('leaves the opaque @lid identifier alone', function () {
            assert.equal(u.normalizeAddress('123456@lid', 'type_whatsapp'), '123456@lid');
        });
    });
});

describe('utils.phoneFromImAddress', function () {
    it('recovers the phone number from a WhatsApp JID', function () {
        assert.equal(u.phoneFromImAddress('15551234567@s.whatsapp.net', 'type_whatsapp'),
            '+1 555 123 4567');
        assert.equal(u.phoneFromImAddress('31612345678@s.whatsapp.net', 'type_whatsapp'),
            '+31612345678');
    });

    it('returns nothing for an identifier that carries no phone number', function () {
        assert.equal(u.phoneFromImAddress('123456@lid', 'type_whatsapp'), '');
        assert.equal(u.phoneFromImAddress('8f1d2c3b-4a5e-6789-abcd-ef0123456789', 'type_signal'), '');
        assert.equal(u.phoneFromImAddress('12345', 'type_signal'), '');
    });

    it('only applies to the two phone-based IM services', function () {
        assert.equal(u.phoneFromImAddress('15551234567', 'sms'), '');
        assert.equal(u.phoneFromImAddress('15551234567', undefined), '');
    });
});

describe('utils.formatPhoneNumber', function () {
    it('groups a bare North American number', function () {
        assert.equal(u.formatPhoneNumber('5551234567'), '(555) 123-4567');
        assert.equal(u.formatPhoneNumber('5551234'), '555-1234');
        assert.equal(u.formatPhoneNumber('15551234567'), '1 (555) 123-4567');
    });

    it('groups a NANP number written in E.164', function () {
        assert.equal(u.formatPhoneNumber('+15551234567'), '+1 555 123 4567');
    });

    it('shows any other international number as stored, rather than mis-grouping it', function () {
        // There is no country-code table here, so the subscriber part cannot be located. Grouping
        // on the NANP shape used to cut into the country code: +31612345678 -> "+3 161 234 5678".
        assert.equal(u.formatPhoneNumber('+31612345678'), '+31612345678');
        assert.equal(u.formatPhoneNumber('+447700900123'), '+447700900123');
    });

    it('returns anything it cannot group unchanged', function () {
        assert.equal(u.formatPhoneNumber('no digits here'), 'no digits here');
        assert.equal(u.formatPhoneNumber(''), '');
    });
});

describe('utils.formatAddress', function () {
    it('formats a phone number for an SMS thread', function () {
        assert.equal(u.formatAddress('5551234567', 'sms'), '(555) 123-4567');
    });

    it('leaves an email address alone', function () {
        assert.equal(u.formatAddress('foo@example.com', 'sms'), 'foo@example.com');
    });

    it('shows the phone number behind a WhatsApp JID', function () {
        assert.equal(u.formatAddress('15551234567@s.whatsapp.net', 'type_whatsapp'),
            '+1 555 123 4567');
    });

    it('leaves an IM address with no recoverable number untouched', function () {
        assert.equal(u.formatAddress('123456@lid', 'type_whatsapp'), '123456@lid');
    });

    it('labels a missing address', function () {
        assert.equal(u.formatAddress('', 'sms'), u.kMissingAddress);
        assert.equal(u.formatAddress(undefined, 'sms'), u.kMissingAddress);
    });
});

describe('utils.cleanPhoneNumber', function () {
    it('keeps only diallable characters, and only for phone values', function () {
        assert.equal(u.cleanPhoneNumber('+1 (555) 123-4567', 'phone'), '+15551234567');
        assert.equal(u.cleanPhoneNumber('*#06#', 'phone'), '*#06#');
    });

    it('leaves emails and non-phone types as they are', function () {
        assert.equal(u.cleanPhoneNumber('foo@example.com', 'phone'), 'foo@example.com');
        assert.equal(u.cleanPhoneNumber('+1 555', 'im'), '+1 555');
    });
});

describe('utils.joinData', function () {
    it('hangs the looked-up record off each result', function () {
        var data = { results: [{ personId: 1 }, { personId: 2 }, { personId: 9 }] };
        u.joinData(data, [{ _id: 1, name: 'one' }, { _id: 2, name: 'two' }],
            '_id', 'personId', 'person');
        assert.equal(data.results[0].person.name, 'one');
        assert.equal(data.results[1].person.name, 'two');
        assert.equal(data.results[2].person, undefined);
    });
});

describe('person.getDisplayName', function () {
    it('prefers a stored display name', function () {
        assert.equal(person.getDisplayName({ displayName: 'Stored', nickname: 'nick' }), 'Stored');
    });

    it('assembles the name parts in order, skipping the empty ones', function () {
        assert.equal(person.getDisplayName({
            name: {
                honorificPrefix: 'Dr',
                givenName: 'Ada',
                middleName: '',
                familyName: 'Lovelace',
                honorificSuffix: null
            }
        }), 'Dr Ada Lovelace');
    });

    it('reads the first entry of a names array', function () {
        assert.equal(person.getDisplayName({ names: [{ givenName: 'Ada', familyName: 'Lovelace' }] }),
            'Ada Lovelace');
    });

    it('falls back through nickname, organization, then the first address', function () {
        assert.equal(person.getDisplayName({ names: [{}], nickname: 'nick' }), 'nick');
        assert.equal(person.getDisplayName({ organization: { name: 'Acme' } }), 'Acme');
        assert.equal(person.getDisplayName({ ims: [{ value: 'who@aim' }] }), 'who@aim');
        assert.equal(person.getDisplayName({ phoneNumbers: [{ value: '5551234567' }] }), '5551234567');
        assert.equal(person.getDisplayName({ emails: [{ value: 'a@b' }] }), 'a@b');
    });

    it('prefers an IM address over a phone number, matching the Mojo order', function () {
        assert.equal(person.getDisplayName({
            ims: [{ value: 'who@aim' }],
            phoneNumbers: [{ value: '5551234567' }]
        }), 'who@aim');
    });

    it('never returns undefined', function () {
        assert.equal(person.getDisplayName({}), '');
        assert.equal(person.getDisplayName(null), '');
        assert.equal(person.getDisplayName(undefined), '');
    });
});

describe('person helpers', function () {
    it('isNotBlank rejects empty and missing strings', function () {
        assert.equal(person.isNotBlank('x'), true);
        assert.equal(person.isNotBlank(''), false);
        assert.equal(person.isNotBlank(undefined), false);
    });

    it('getDisplayImage falls back to the silhouette', function () {
        assert.equal(person.getDisplayImage({ photos: { squarePhotoPath: '/p.png' } }), '/p.png');
        assert.equal(person.getDisplayImage({}), 'assets/list-avatar-default.svg');
        assert.equal(person.getDisplayImage(undefined), 'assets/list-avatar-default.svg');
    });

    it('avatarFailed swaps a photo that would not load for the silhouette', function () {
        var img = {
            attrs: { src: '/var/luna/data/im-avatars/abc.jpg' },
            getAttribute: function (n) { return this.attrs[n]; },
            setAttribute: function (n, v) { this.attrs[n] = v; }
        };
        person.avatarFailed(img);
        assert.equal(img.attrs.src, 'assets/list-avatar-default.svg');
    });

    it('avatarFailed leaves the silhouette alone, so a missing one cannot loop', function () {
        var sets = 0;
        var img = {
            getAttribute: function () { return 'assets/list-avatar-default.svg'; },
            setAttribute: function () { sets += 1; }
        };
        person.avatarFailed(img);
        person.avatarFailed(null);
        assert.equal(sets, 0);
    });

    it('reports which kinds of account a person can be reached on', function () {
        assert.equal(person.hasMessagingAccounts({ ims: [{ value: 'a' }] }), true);
        assert.equal(person.hasMessagingAccounts({ ims: [] }), false);
        assert.equal(person.hasSMSAccounts({ phoneNumbers: [{ value: '1' }] }), true);
        assert.equal(person.hasSMSAccounts(undefined), false);
    });
});

describe('thread.updateFromNewMessage', function () {
    it('creates a thread from an incoming message and counts it unread', function () {
        var t = thread.updateFromNewMessage(undefined, {
            folder: 'inbox',
            serviceName: 'sms',
            messageText: 'hi there',
            localTimestamp: 1234,
            from: { addr: '+1 (555) 123-4567' }
        });
        assert.equal(t._kind, 'com.palm.chatthread:1');
        assert.equal(t.summary, 'hi there');
        assert.equal(t.timestamp, 1234);
        assert.equal(t.replyService, 'sms');
        assert.equal(t.replyAddress, '+1 (555) 123-4567');
        assert.equal(t.normalizedAddress, '5551234567');
        assert.equal(t.flags.outgoing, false);
        assert.equal(t.unreadCount, 1);
    });

    it('marks an outgoing message as outgoing and leaves the unread count alone', function () {
        var t = thread.updateFromNewMessage(undefined, {
            folder: 'outbox',
            serviceName: 'sms',
            messageText: 'yo',
            localTimestamp: 1,
            to: [{ addr: '5551234567' }]
        });
        assert.equal(t.flags.outgoing, true);
        assert.equal(t.unreadCount, 0);
        assert.equal(t.replyAddress, '5551234567');
    });

    it('adds to the unread count of an existing thread', function () {
        var existing = { _id: 'x', unreadCount: 2, flags: { outgoing: true } };
        var t = thread.updateFromNewMessage(existing, {
            folder: 'inbox', serviceName: 'sms', messageText: 'again',
            localTimestamp: 2, from: { addr: '5551234567' }
        });
        assert.equal(t, existing);
        assert.equal(t.unreadCount, 3);
        assert.equal(t.flags.outgoing, false);
        assert.equal(t.flags.visible, true);
    });

    it('does not count a replacement message, which edits a message already there', function () {
        var t = thread.updateFromNewMessage(undefined, {
            folder: 'inbox', serviceName: 'sms', messageText: 'edited', smsType: 0x41,
            localTimestamp: 3, from: { addr: '5551234567' }
        });
        assert.equal(t.unreadCount, 0);
        assert.equal(t.summary, 'edited');
    });

    it('ignores anything outside the inbox and outbox', function () {
        assert.equal(thread.updateFromNewMessage(undefined, { folder: 'drafts' }), undefined);
        assert.equal(thread.updateFromNewMessage(undefined, { folder: 'transient' }), undefined);
        assert.equal(thread.updateFromNewMessage(undefined, undefined), undefined);
    });

    it('ignores an invisible message', function () {
        var existing = { unreadCount: 7 };
        assert.equal(thread.updateFromNewMessage(existing, {
            folder: 'inbox', flags: { visible: false }, messageText: 'hidden'
        }), existing);
        assert.equal(existing.unreadCount, 7);
    });

    it('threads a group chat on its name', function () {
        var t = thread.updateFromNewMessage(undefined, {
            folder: 'inbox', serviceName: 'sms', messageText: 'hello all',
            localTimestamp: 4, groupChatName: 'The Group'
        });
        assert.equal(t.replyAddress, 'The Group');
    });

    it('labels a message that carries no address at all', function () {
        var t = thread.updateFromNewMessage(undefined, {
            folder: 'inbox', serviceName: 'sms', messageText: 'orphan', localTimestamp: 5
        });
        assert.equal(t.replyAddress, u.kMissingAddress);
    });
});

describe('imLoginState.getAggregatedLoginState', function () {
    var ONLINE = utils.imLoginState.TRANSPORT_STATE.ONLINE;
    var RETRIEVING = utils.imLoginState.TRANSPORT_STATE.RETRIEVING_DATA;
    var LOGGING_ON = utils.imLoginState.TRANSPORT_STATE.LOGGING_ON;
    var OFFLINE_STATE = utils.imLoginState.TRANSPORT_STATE.OFFLINE;
    var AVAIL = utils.im.availability;

    it('returns nothing when there is no IM account at all', function () {
        assert.equal(utils.imLoginState.getAggregatedLoginState([]), undefined);
        assert.equal(utils.imLoginState.getAggregatedLoginState(undefined), undefined);
    });

    it('takes the best availability of the connected accounts', function () {
        var s = utils.imLoginState.getAggregatedLoginState([
            { state: ONLINE, availability: AVAIL.BUSY },
            { state: ONLINE, availability: AVAIL.AVAILABLE }
        ]);
        assert.equal(s.bestAvailability, AVAIL.AVAILABLE);
        assert.equal(s.identicalStates, true);
        assert.equal(s.identicalAvailabilities, false);
        assert.equal(s.hasPending, false);
        assert.equal(s.hasOffline, false);
    });

    it('counts retrieving-buddies as connected, not as still signing in', function () {
        var s = utils.imLoginState.getAggregatedLoginState([
            { state: RETRIEVING, availability: AVAIL.AVAILABLE }
        ]);
        assert.equal(s.bestAvailability, AVAIL.AVAILABLE);
        assert.equal(s.hasPending, false);
    });

    it('reports an account that is still signing in as pending', function () {
        var s = utils.imLoginState.getAggregatedLoginState([
            { state: LOGGING_ON, availability: AVAIL.AVAILABLE }
        ]);
        assert.equal(s.hasPending, true);
        assert.equal(s.bestAvailability, AVAIL.OFFLINE);
    });

    it('reports a signed-out account as offline', function () {
        var s = utils.imLoginState.getAggregatedLoginState([
            { state: OFFLINE_STATE, availability: AVAIL.OFFLINE }
        ]);
        assert.equal(s.hasOffline, true);
        assert.equal(s.hasPending, false);
    });

    it('surfaces a shared custom message, and nothing when they differ', function () {
        var same = utils.imLoginState.getAggregatedLoginState([
            { state: ONLINE, availability: AVAIL.AVAILABLE, customMessage: 'brb' },
            { state: ONLINE, availability: AVAIL.AVAILABLE, customMessage: 'brb' }
        ]);
        assert.equal(same.identicalCustomMessages, true);
        assert.equal(same.customMessage, 'brb');

        var differ = utils.imLoginState.getAggregatedLoginState([
            { state: ONLINE, availability: AVAIL.AVAILABLE, customMessage: 'brb' },
            { state: ONLINE, availability: AVAIL.AVAILABLE, customMessage: 'afk' }
        ]);
        assert.equal(differ.identicalCustomMessages, false);
        assert.equal(differ.customMessage, undefined);
    });

    it('treats a missing custom message as an empty one', function () {
        var s = utils.imLoginState.getAggregatedLoginState([
            { state: ONLINE, availability: AVAIL.AVAILABLE },
            { state: ONLINE, availability: AVAIL.AVAILABLE, customMessage: '' }
        ]);
        assert.equal(s.identicalCustomMessages, true);
        assert.equal(s.customMessage, '');
    });

    it('getAvailability reports a signed-out account as offline whatever it last said', function () {
        assert.equal(utils.imLoginState.getAvailability({
            state: OFFLINE_STATE, availability: AVAIL.AVAILABLE
        }), AVAIL.OFFLINE);
        assert.equal(utils.imLoginState.getAvailability({
            state: ONLINE, availability: AVAIL.BUSY
        }), AVAIL.BUSY);
    });
});

describe('emoji handling', function () {
    var SOB = '😭';          // U+1F62D loudly crying face
    var HEART = '❤️';        // U+2764 + variation selector 16
    var FLAG_NL = '🇳🇱';

    it('decodes the numeric entities transports store astral emoji as', function () {
        assert.equal(message.decodeNumericEntities('&#128557;'), SOB);
        assert.equal(message.decodeNumericEntities('&#x1f62d;'), SOB);
        assert.equal(message.decodeNumericEntities('a&#128557;b'), 'a' + SOB + 'b');
    });

    it('leaves the ASCII entities alone, so markup escaping survives', function () {
        assert.equal(message.decodeNumericEntities('&lt;b&gt;'), '&lt;b&gt;');
        assert.equal(message.decodeNumericEntities('&#60;'), '&#60;');
        assert.equal(message.decodeNumericEntities(''), '');
    });

    it('keys an image by code point, dropping the variation selectors', function () {
        assert.equal(message._emojiKey(SOB), '1f62d');
        assert.equal(message._emojiKey(HEART), '2764');
        assert.equal(message._emojiKey(FLAG_NL), '1f1f3-1f1f1');
    });

    it('_fromCodePoint builds the surrogate pair old WebKit cannot', function () {
        assert.equal(message._fromCodePoint(0x1F62D), SOB);
        assert.equal(message._fromCodePoint(0x2764), '❤');
    });

    it('emojify swaps emoji for images next to the running app', function () {
        var html = message.emojify('hi ' + SOB);
        assert.match(html, /^hi <img class="emoji" /);
        assert.match(html, /src="file:\/\/\/usr\/palm\/applications\/org\.webosports\.app\.messaging\/assets\/emoji\/1f62d\.png"/);
        assert.match(html, /alt="😭"/);
        assert.match(html, /onerror="window\.__messagingEmojiFallback/);
    });

    it('emojify decodes entities on the way, so a stored &#...; also becomes an image', function () {
        assert.match(message.emojify('&#128557;'), /assets\/emoji\/1f62d\.png/);
    });

    it('emojify leaves plain text alone', function () {
        assert.equal(message.emojify('no emoji here'), 'no emoji here');
        assert.equal(message.emojify(''), '');
    });

    it('emojifyEscaped escapes a name before imageifying it', function () {
        var html = message.emojifyEscaped('<b> ' + SOB);
        assert.match(html, /^&lt;b&gt; <img class="emoji" /);
    });

    it('stripEmojiForPlainText drops emoji and tidies the gap they leave', function () {
        assert.equal(message.stripEmojiForPlainText('hi ' + SOB + ' there'), 'hi there');
        assert.equal(message.stripEmojiForPlainText('&#128557; ok'), 'ok');
        assert.equal(message.stripEmojiForPlainText(SOB + ' !'), '!');
        assert.equal(message.stripEmojiForPlainText('plain'), 'plain');
    });
});

describe('message.audioFmt', function () {
    it('formats a duration as minutes and padded seconds', function () {
        assert.equal(message.audioFmt(0), '0:00');
        assert.equal(message.audioFmt(9), '0:09');
        assert.equal(message.audioFmt(61), '1:01');
        assert.equal(message.audioFmt(3599), '59:59');
    });

    it('treats a missing or non-finite duration as zero', function () {
        assert.equal(message.audioFmt(undefined), '0:00');
        assert.equal(message.audioFmt(NaN), '0:00');
        assert.equal(message.audioFmt(Infinity), '0:00');
    });
});

describe('message.summarizeMedia', function () {
    it('labels a bare media URL', function () {
        assert.equal(message.summarizeMedia('file:///media/internal/a.jpg'), '📷 Photo');
        assert.equal(message.summarizeMedia('https://x/y.mp4'), '🎥 Video');
        assert.equal(message.summarizeMedia('file:///m/v.opus'), '🎤 Voice message');
        assert.equal(message.summarizeMedia('https://x/y.pdf'), '📄 Document received');
    });

    it('keeps real text and drops the URL beside it', function () {
        assert.equal(message.summarizeMedia('look at this https://x/y.png'), 'look at this');
    });

    it('labels the structured tokens the transports send', function () {
        assert.equal(message.summarizeMedia('poll:abc123'), '📊 Poll');
        assert.equal(message.summarizeMedia('event:abc123'), '📅 Event');
        assert.equal(message.summarizeMedia('geo:52.37,4.89'), '📍 Location');
        assert.equal(message.summarizeMedia('meet here geo:52.37,4.89'), 'meet here');
    });

    it('leaves an ordinary message untouched', function () {
        assert.equal(message.summarizeMedia('just a message'), 'just a message');
        assert.equal(message.summarizeMedia(''), '');
    });
});

describe('imLoginState.getErrorMessage', function () {
    var ls = utils.imLoginState;

    it('says nothing when the account is fine', function () {
        assert.equal(ls.getErrorMessage({}), '');
        assert.equal(ls.getErrorMessage({ errorCode: '' }), '');
        assert.equal(ls.getErrorMessage({ errorCode: 'AcctMgr_No_Error' }), '');
        assert.equal(ls.getErrorMessage(null), '');
    });

    it('explains the code a WhatsApp account actually came back with', function () {
        // Observed on a MindPhone: the account was created but the transport gave up before
        // attempting a login, and the app showed nothing but a warning triangle.
        var msg = ls.getErrorMessage({ errorCode: 'AcctMgr_Credentials_Not_Found' });
        assert.match(msg, /sign in again/i);
    });

    it('has a line for every code the transport can emit', function () {
        // The set is what `strings /usr/sbin/imlibpurpleservice` carries.
        ['AcctMgr_Bad_Username', 'AcctMgr_Bad_Password', 'AcctMgr_Bad_Authentication',
            'AcctMgr_Credentials_Not_Found', 'AcctMgr_Name_In_Use', 'AcctMgr_Network_Error',
            'AcctMgr_Generic_Error'
        ].forEach(function (code) {
            var msg = ls.getErrorMessage({ errorCode: code });
            assert.ok(msg && msg !== code, 'no message for ' + code);
        });
    });

    it('shows an unknown code as itself rather than swallowing it', function () {
        assert.equal(ls.getErrorMessage({ errorCode: 'AcctMgr_Something_New' }),
                     'AcctMgr_Something_New');
    });
});
