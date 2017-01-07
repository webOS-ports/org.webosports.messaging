/**
 * A messaging address or phone number (for SMS), from user's contacts
 * Copyright © 2017 by P. Douglas Reeder under the Apache 2.0 license.
 */


var kind = require('enyo/kind'),
    Model = require('enyo/Model');


module.exports = kind({
    name: "AddrModel",
    kind: Model,
    attributes:{
        displayName: "",   // recipient's real name (used in dividers)
        personId: '',   // _id of associated person
        value: "",   // recipient's account name/alias, may or may not include @ and host
        isPhone: false,
        type: 'type_other'   // IM: type_jabber, type_icq, etc. Phone: type_work, type_mobile, etc.
    }

});
