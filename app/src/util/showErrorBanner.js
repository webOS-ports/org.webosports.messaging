/**
 * Scans the passed arguments for something like an error message, and shows it in a banner.
 * Intended for callbacks where errors aren't expected to occur.  If you know of an error scenario,
 * deal with it or tell the user how to deal with it!
 * Copyright © 2017 by P. Douglas Reeder under the Apache 2.0 license.
 */

var $L = require('enyo/i18n').$L;   // no-op placeholder

module.exports = function () {
    console.error(arguments);
    var msgs = [], i;
    for (i=0; i<arguments.length; ++i) {
        var obj = arguments[i];
        if (obj instanceof Error) {
            msgs.push(obj.message || obj.name || obj.toString());
        } else if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'symbol' || obj instanceof RegExp) {
            msgs.push(obj);
        } else if (typeof obj === 'undefined' || obj === null || typeof obj === 'boolean' || typeof obj === 'function') {
            // nothing useful to user
        } else if (typeof obj.errorText === 'string') {   // Luna bus service call error
            msgs.push(obj.errorText);
        // } else {
        //     try {
        //         msgs.push(JSON.stringify(obj));   // calling JSON.stringify on native under LuneOS crashes app
        //     } catch (err) {
        //     }

        }
    }

    msgs.unshift($L("File a detailed bug report:"));

    // console.error(msgs);
    if ('PalmSystem' in window) {
        PalmSystem.addBannerMessage(msgs.join(" "));
    }
};
