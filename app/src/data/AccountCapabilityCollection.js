/**
 * Collection of messaging capabilities, from user's accounts.
 * Copyright © 2017 by P. Douglas Reeder under the Apache 2.0 license.
 */

var kind = require('enyo/kind'),
    Collection = require('enyo/Collection'),
    showErrorBanner = require('../util/showErrorBanner');


module.exports = kind({
    name: "AccountCapabilityCollection",
    kind: Collection,
    published: {
    },
    // model: AccountCapabilityModel,
    source: "lunaSource",
    options: {parse: true},
    service: 'luna://com.webos.service.accounts',
    method: 'listAccounts',
    subscribe: true,
    mock: !('PalmSystem' in window),
    parse: function (data) {
        console.log("parsing accounts:", data);
        var accountCapabilites = [];
        if (!data || ! data.results instanceof Array) {
            console.error("listAccounts returned no data");
            return accountCapabilites;
        }
        data.results.forEach( function (account) {
            if (! account || ! account.capabilityProviders instanceof Array) {
                return;
            }
            var accountDisplayName = account.loc_name || account.alias;
            var accountUsername = account.username || "";

            account.capabilityProviders.forEach(function (capability) {
                if (! capability.loc_name) {   // some capabilites have their own name
                    capability.loc_name = accountDisplayName;
                }
                if (!capability.username) {    // no capability is known to have its own username
                    capability.username = accountUsername;
                }
                if (capability.capability === 'MESSAGING') {
                    accountCapabilites.push(capability);
                }
            });
        });
        return accountCapabilites;
    }
});
