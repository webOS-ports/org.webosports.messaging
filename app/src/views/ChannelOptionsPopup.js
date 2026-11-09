/**
 * What holding a Discord server or channel row in the Servers tab brings up: mute or unmute it,
 * and choose whether its messages arrive while it is closed (see util/channelOptions).
 *
 * A menu at the finger, as the message menu is here and as the legacy app's PopupSelect was: just
 * the choices, no title or buttons. The row itself says what is set.
 *
 * The choice goes to imlibpurpleservice's setChannelOptions. Its answer comes before the network
 * has taken it, and the row shows the new state once the service has written it to the
 * imserver/imchannel row. Only a failure is shown, in the app's usual dialog.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    Menu = require('onyx/Menu'),
    MenuItem = require('onyx/MenuItem'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    LunaService = require('enyo-webos/LunaService'),
    channelOptions = require('../util/channelOptions'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

// MojErrNotOpen (mojodb core/MojErr.h): no Discord account is signed in.
var MOJ_ERR_NOT_OPEN = -988;

module.exports = kind({
    name: "ChannelOptionsPopup",
    kind: Control,

    components: [
        { name: "menu", kind: Menu, floating: true },
        {
            name: "errorDialog", kind: Popup, centered: true, floating: true, modal: true,
            components: [
                { name: "errorTitle", style: "font-weight: bold; margin-bottom: 0.5rem;" },
                { name: "errorMessage", style: "margin: 0.5rem 0 1rem;" },
                { kind: Button, content: $L("OK"), style: "width: 100%;", ontap: "closeError" }
            ]
        },
        {
            name: "setter", kind: LunaService,
            service: 'luna://com.palm.imlibpurple', method: 'setChannelOptions',
            onError: "setFailed"
        }
    ],

    /**
     * Open the choices for a row at the hold. isServer: record is an imserver; server: a
     * channel's imserver. False when the row has none, so the caller can do what a hold did before.
     */
    showFor: function (record, isServer, server, inEvent) {
        var list = channelOptions.actions(record, isServer, server);
        if (!list.length) {
            return false;
        }
        this.record = record;
        this.isServer = !!isServer;
        this.$.menu.destroyClientControls();
        for (var i = 0; i < list.length; i++) {
            this.$.menu.createComponent({
                kind: MenuItem, content: list[i].label, change: list[i].change, ontap: "choiceTapped"
            }, { owner: this });
        }
        this.$.menu.render();
        // As the message menu: anchor to the finger; without an activatorOffset the open menu
        // throws on every resize.
        this.$.menu.activatorOffset = {
            top: (inEvent && inEvent.pageY) || 0, left: (inEvent && inEvent.pageX) || 0, width: 0, height: 0
        };
        this.$.menu.showAtEvent(inEvent);
        return true;
    },

    choiceTapped: function (inSender) {
        this.$.menu.hide();
        var payload = channelOptions.request(this.record, this.isServer, inSender.change);
        if (!payload) {
            return true;
        }
        if (mockDb.enabled) {
            this.log("would set:", JSON.stringify(payload));
            return true;
        }
        this.$.setter.send(payload);
        return true;
    },

    setFailed: function (inSender, inError) {
        var record = this.record || {};
        this.$.errorTitle.setContent(record.displayName || record.name || record.remoteId || "");
        this.$.errorMessage.setContent(inError && inError.errorCode === MOJ_ERR_NOT_OPEN ?
            $L("Sign in to Discord to change this.") : $L("This could not be changed."));
        this.$.errorDialog.show();
        return true;
    },

    closeError: function () {
        this.$.errorDialog.hide();
        return true;
    }
});
