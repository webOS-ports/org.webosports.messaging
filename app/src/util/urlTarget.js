/**
 * The compose parameters for the im: and sms: URLs the app is opened with (see the README).
 *
 * The Contacts app opens an IM address as "im:<address>?personId=<id>&type=<service>", with the
 * "type_" prefix of the contact's IM type taken off (type_teams becomes type=teams), the form
 * webOS has always used. The transports' accounts are known by the full service name, so the
 * prefix goes back on here; without it no account matches and the compose view reports that no
 * IM account of the type is set up.
 */

/** Splits "scheme:path?query" without a DOM; the query values come back decoded. */
function parse(url) {
    var colon = url.indexOf(':');
    if (colon < 1) {
        return null;
    }
    var rest = url.slice(colon + 1);
    var mark = rest.indexOf('?');
    var path = mark === -1 ? rest : rest.slice(0, mark);
    var query = {};
    if (mark !== -1) {
        rest.slice(mark + 1).split('&').forEach(function (pair) {
            var eq = pair.indexOf('=');
            if (eq > 0 && eq < pair.length - 1) {
                query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
            }
        });
    }
    return {
        protocol: url.slice(0, colon + 1).toLowerCase(),
        path: decodeURIComponent(path),
        query: query
    };
}

/** The IM service name for a URL's type: "teams" -> "type_teams"; already prefixed stays. */
function serviceName(type) {
    if (!type) {
        return type;
    }
    return type.indexOf('type_') === 0 ? type : 'type_' + type;
}

/** The parameters for ChatView.preHandleLaunch(), or null for a URL the app does not handle. */
function composeParams(target) {
    var parsed = typeof target === 'string' ? parse(target) : null;
    if (!parsed) {
        return null;
    }
    switch (parsed.protocol) {
        case 'im:':
            return {
                ims: [{ value: parsed.path, type: serviceName(parsed.query.type) }],
                messageText: parsed.query.body
            };
        case 'sms:':
            // Several numbers can be given; the compose view takes the first.
            return {
                phoneNumbers: [{ value: parsed.path.split(',')[0], type: 'sms' }],
                messageText: parsed.query.body
            };
        default:
            return null;
    }
}

module.exports = {
    parse: parse,
    serviceName: serviceName,
    composeParams: composeParams
};
