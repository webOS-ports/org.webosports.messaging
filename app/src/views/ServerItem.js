/**
 * A single server (guild/network) row in the Servers tab.
 * Ported from com.palm.app.messaging/app/servers/ServerItem.js.
 *
 * Shows the server name plus its account type as a subtitle; tapping the row drills into its
 * channels.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    Image = require('enyo/Image'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "ServerItem",
    kind: Control,
    classes: "contactItem server-item flex-row",

    published: {
        record: null
    },

    components: [
        {
            name: "serverImage", kind: Image, classes: "contact-image",
            src: "assets/menu-icon-servers.svg"
        },
        // The same status column as thread rows: the account's online dot above the last-message
        // sent/received arrow. It also supplies the gap between logo and title.
        {
            classes: "status-box", components: [
                { name: "status", classes: "status" },
                { name: "outgoing", classes: "sent-received" }
            ]
        },
        {
            classes: "message-summary", components: [
                { name: "displayName", classes: "contact-name", allowHtml: true },
                { name: "serviceName", classes: "message-preview" }
            ]
        },
        // Aggregate unread across the server's channels; hidden when the server is caught up.
        { name: "unreadCount", classes: "unread-count server-unread", showing: false }
    ],

    recordChanged: function () {
        if (this.record) {
            this.setServer(this.record);
        }
    },

    setServer: function (inServer) {
        var name = inServer.displayName || inServer.name || inServer.remoteId || $L("Server");
        this.$.displayName.setContent(messagingUtils.message.emojifyEscaped(name));
        this.$.serviceName.setContent(messagingUtils.message.escapeHtml(this.getServiceLabel(inServer)));
        this.updateServerImage(inServer);
    },

    /**
     * The account's online dot. inAvailability is the imloginstate availability index (0 available
     * .. 4 offline); null when the account has no login state yet, leaving the dot blank but still
     * occupying its space.
     */
    setStatus: function (inAvailability) {
        var cls = (inAvailability === null || inAvailability === undefined) ? "" :
            (" status-" + (messagingUtils.im.availabilityClasses[inAvailability] || "offline"));
        this.$.status.setClasses("status" + cls);
    },

    /** Direction of the server's most recent message, mirroring ThreadItem. */
    setOutgoing: function (inOutgoing) {
        this.$.outgoing.setClasses("sent-received " + (inOutgoing ? "message-outgoing" : ""));
    },

    /**
     * Show the account's connector logo rather than the generic servers glyph, so you can tell at
     * a glance which network a server is on. Falls back to the generic icon when the service has no
     * template icon (for instance after the account is removed).
     */
    updateServerImage: function (inServer) {
        var icon = this.getServiceIcon(inServer && inServer.serviceName);
        this.$.serverImage.setAttribute("src", icon || "assets/menu-icon-servers.svg");
        // Provider logos carry their own rounded edges and read bright at full bleed, so reuse
        // ThreadItem's softened frameless treatment. Recycled rows must clear it when falling back.
        this.$.serverImage.addRemoveClass("contact-image-service", Boolean(icon));
    },

    /** Sum of unread across this server's channels; 0 hides the badge. */
    setUnread: function (inCount) {
        var n = Number(inCount) || 0;
        this.$.unreadCount.setContent(n > 99 ? "99+" : n);
        this.$.unreadCount.setShowing(n > 0);
    },

    getServiceIcon: function (serviceName) {
        if (!serviceName || !appState.accountService || !appState.accountService.getIconPath) {
            return null;
        }
        return appState.accountService.getIconPath(serviceName);
    },

    /** Map a raw serviceName ("type_discord") to a friendly label via the account template hash. */
    getServiceLabel: function (inServer) {
        var svc = inServer.serviceName || "";
        var accountService = appState.accountService;
        if (accountService && accountService.getMyAccountTypesHash) {
            var types = accountService.getMyAccountTypesHash();
            var tmpl = types && types[svc];
            if (tmpl && (tmpl.loc_name || tmpl.name)) {
                return tmpl.loc_name || tmpl.name;
            }
        }
        return svc.replace(/^type_/, "");
    }
});
