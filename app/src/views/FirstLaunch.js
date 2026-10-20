/**
 * The first-run screen: explain what the app needs and offer to add an account.
 * Ported from com.palm.app.messaging/app/firstlaunch/FirstLaunch.js.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    Toolbar = require('onyx/Toolbar'),
    Button = require('onyx/Button'),
    Image = require('enyo/Image'),
    LunaService = require('enyo-webos/LunaService'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "FirstLaunch",
    kind: FittableRows,
    classes: "onyx-background",

    events: {
        onFirstLaunchDone: ""
    },

    components: [
        {
            kind: Toolbar, classes: "accounts-header flex-row", components: [
                { kind: Image, src: "assets/messaging-48x48.png" },
                { content: $L("Messaging"), style: "margin-left: 0.5rem;" }
            ]
        },
        { classes: "header-shadow" },
        {
            // first-launch-body centres this column and lets it scroll when the screen is too
            // short to hold it, which a 720x720 panel is.
            fit: true, classes: "flex-column first-launch-body",
            components: [
                { kind: Image, src: "assets/icon-165x165.svg" },
                {
                    style: "text-align: center; margin-top: 1.5rem; font-size: 18px;",
                    content: $L("Send text messages and chat with your friends.")
                },
                {
                    classes: "messageTexts",
                    style: "text-align: center; background: transparent; margin-top: 0.5rem;",
                    content: $L("Add an instant messaging account to see your buddies and chat. Text messaging works as soon as your phone is connected.")
                },
                {
                    kind: Button, classes: "connect-phone onyx-affirmative",
                    content: $L("Add An Account"), ontap: "addAccount"
                }
            ]
        },
        { classes: "footer-shadow" },
        {
            kind: Toolbar, components: [
                {
                    kind: Button, content: $L("Done"), classes: "onyx-dark", ontap: "doneTapped"
                }
            ]
        },
        {
            name: 'launchApp', kind: LunaService,
            service: 'luna://com.webos.applicationManager', method: 'launch', onError: 'serviceErr'
        }
    ],

    addAccount: function () {
        this.$.launchApp.send({
            id: "com.palm.app.accounts", params: { capability: "MESSAGING", launchType: "add" }
        });
        return true;
    },

    doneTapped: function () {
        this.doFirstLaunchDone();
        return true;
    },

    serviceErr: function (inSender, inError) {
        this.error("first launch service failed:", inError && (inError.errorText || inError));
        return true;
    }
});
