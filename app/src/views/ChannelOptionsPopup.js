/**
 * What holding a Discord server or channel row in the Servers tab brings up: mute or unmute it,
 * and choose whether its messages arrive while it is closed (see util/channelOptions).
 *
 * The choice goes to imlibpurpleservice's setChannelOptions. Its answer comes before the network
 * has taken it, so the popup closes on the answer and the row shows the new state once the
 * service has written it to the imserver/imchannel row.
 */

var kind = require('enyo/kind'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    Control = require('enyo/Control'),
    LunaService = require('enyo-webos/LunaService'),
    channelOptions = require('../util/channelOptions'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var MOJ_ERR_NOT_OPEN = -988;

module.exports = kind({
    name: "ChannelOptionsPopup",
    kind: Popup,
    centered: true, floating: true, modal: true, scrim: true,
    style: "width: 20em;",

    components: [
        { name: "title", style: "font-weight: bold; margin-bottom: 0.25rem;" },
        { name: "state", classes: "account-username-text", style: "margin-bottom: 0.75rem;" },
        { name: "choices", kind: Control },
        { name: "status", classes: "account-username-text", style: "margin: 0.5rem 0;", showing: false },
        { kind: Button, content: $L("Close"), style: "width: 100%;", ontap: "closeTapped" },
        {
            name: "setter", kind: LunaService,
            service: 'luna://com.palm.imlibpurple', method: 'setChannelOptions',
            onResponse: "setDone", onError: "setFailed"
        }
    ],

    /**
     * Show the choices for a row. isServer: record is an imserver; server: a channel's imserver.
     * False when the row has none, so the caller can do what a hold did before.
     */
    showFor: function (record, isServer, server) {
        var list = channelOptions.actions(record, isServer, server);
        if (!list.length) {
            return false;
        }
        this.record = record;
        this.isServer = !!isServer;
        var name = String(record.displayName || record.name || record.remoteId);
        // A channel as its row shows it (ChannelItem): "# name", but not doubled for "#name".
        this.$.title.setContent(isServer || name.charAt(0) === "#" ? name : "# " + name);
        var state = channelOptions.summary(record, isServer, server);
        this.$.state.setContent(state);
        this.$.state.setShowing(!!state);
        this.$.status.setContent("");
        this.$.status.hide();
        this.$.choices.destroyClientControls();
        for (var i = 0; i < list.length; i++) {
            this.$.choices.createComponent({
                kind: Button, content: list[i].label, style: "width: 100%; margin-bottom: 0.5rem;",
                change: list[i].change, ontap: "choiceTapped"
            }, { owner: this });
        }
        this.$.choices.render();
        this.show();
        return true;
    },

    choiceTapped: function (inSender) {
        var payload = channelOptions.request(this.record, this.isServer, inSender.change);
        if (!payload) {
            this.hide();
            return true;
        }
        this.setBusy(true);
        if (mockDb.enabled) {
            this.log("would set:", JSON.stringify(payload));
            this.setDone();
            return true;
        }
        this.$.setter.send(payload);
        return true;
    },

    setBusy: function (busy) {
        var buttons = this.$.choices.getClientControls();
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].setDisabled(busy);
        }
    },

    setDone: function () {
        this.setBusy(false);
        this.record = null;
        this.hide();
        return true;
    },

    setFailed: function (inSender, inError) {
        this.setBusy(false);
        // MojErrNotOpen (mojodb core/MojErr.h): no Discord account is signed in.
        this.$.status.setContent(inError && inError.errorCode === MOJ_ERR_NOT_OPEN ?
            $L("Sign in to Discord to change this.") : $L("This could not be changed."));
        this.$.status.show();
        return true;
    },

    closeTapped: function () {
        this.record = null;
        this.hide();
        return true;
    }
});
