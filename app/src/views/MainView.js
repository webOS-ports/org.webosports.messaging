/**
 * The app shell: the messaging pane on the left, the conversation pane on the right, plus the app
 * menu, preferences, first launch and launch-parameter handling.
 * Ported from com.palm.app.messaging/app/MessagingApp.js.
 */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    Panels = require('layout/Panels'),
    CollapsingArranger = require('layout/CollapsingArranger'),
    CardArranger = require('layout/CardArranger'),
    Signals = require('enyo/Signals'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    Menu = require('onyx/Menu'),
    MenuItem = require('onyx/MenuItem'),
    LunaService = require('enyo-webos/LunaService'),
    Messaging = require('./Messaging'),
    ChatView = require('./ChatView'),
    PreferencesView = require('./PreferencesView'),
    FirstLaunch = require('./FirstLaunch'),
    AddBuddyDialog = require('./AddBuddyDialog'),
    messagingUtils = require('../util/messagingUtils'),
    appState = require('../util/appState'),
    urlTarget = require('../util/urlTarget'),
    formFactor = require('../util/formFactor'),
    mockDb = require('../data/mockDb'),
    $L = require('enyo/i18n').$L;

var DB_SERVICE = 'luna://com.webos.service.db';

// Before any Panels instance exists, so the first arrangement is already the right one: this
// points Panels' narrow-screen test at the form factor rather than at the viewport width.
formFactor.install();

module.exports = kind({
    name: "messaging.MainView",
    kind: FittableRows,

    components: [
        {
            // CardArranger, not CollapsingArranger: these are alternative whole-screen views, so
            // exactly one shows at a time. A collapsing arranger lays its panels side by side,
            // which put first launch and preferences on screen next to the app.
            // animate:false matches Mojo, whose Pane used transitions.Simple - an instant swap.
            // Enyo 2 defaults to an animated cross-fade, which reads as a flicker on every switch.
            name: "views", kind: Panels, arrangerKind: CardArranger, fit: true,
            draggable: false, animate: false, classes: "app-panels",
            components: [
                {
                    // narrowFit is left at its default: it adds the class that makes each panel
                    // fill the width once the screen is narrow, which is how the conversation
                    // takes over the screen on a small display. Forcing it off kept the
                    // conversation pinned to its wide-layout width.
                    name: "slidingGroup", kind: Panels, arrangerKind: CollapsingArranger,
                    fit: true, draggable: false, classes: "app-panels",
                    components: [
                        {
                            name: "messaging", kind: Messaging,
                            onSelectThread: "threadSelected",
                            onDeleteThread: "deleteThread",
                            onThreadLocked: "threadLocked",
                            onOpenComposeView: "openComposeView",
                            onNewBuddy: "addBuddy",
                            onNewFavorite: "showAddFavoriteList",
                            onLoginStatesChange: "loginStatesChange",
                            onAddAccount: "showAddAccountDialog",
                            onOpenAppMenu: "openAppMenu"
                        },
                        {
                            name: "chatView", kind: ChatView, fit: true,
                            onSelectThread: "chatViewSelectedThread",
                            onClearUnreadCount: "clearUnreadCount"
                        }
                    ]
                },
                { name: "firstLaunch", kind: FirstLaunch, onFirstLaunchDone: "doneFirstLaunch" },
                {
                    name: "preferencesView", kind: PreferencesView,
                    onClosePreferences: "closePreferences"
                }
            ]
        },
        {
            kind: Signals,
            onbackgesture: "goBack",
            onwebOSRelaunch: "handleRelaunch",
            onmenubutton: "toggleAppMenu",
            onwindowactivated: "windowActivatedHandler",
            onwindowdeactivated: "windowDeactivatedHandler",
            onwindowhidden: "windowHiddenHandler",
            onwindowshown: "windowShownHandler"
        },

        { name: "buddyDialog", kind: AddBuddyDialog },
        // What the app menu opens against when the status bar asks for it: the top left corner
        // of the app, just under the app's name in the status bar.
        { name: "appMenuAnchor", style: "position: absolute; top: 0; left: 0; width: 0; height: 0;" },
        {
            name: "appMenu", kind: Menu, floating: true, components: [
                { name: "addBuddyMenuItem", kind: MenuItem, content: $L("Add Buddy"), ontap: "addBuddy" },
                {
                    name: "showOfflineMenuItem", kind: MenuItem,
                    content: $L("Show Offline Buddies"), ontap: "updateOfflinePrefs"
                },
                {
                    name: "prefsAccntsMenuItem", kind: MenuItem,
                    content: $L("Preferences & Accounts"), ontap: "openPreferences"
                },
                { name: "helpMenuItem", kind: MenuItem, content: $L("Help"), ontap: "openHelp" }
            ]
        },
        {
            name: "noAccountDialog", kind: Popup, centered: true, floating: true, modal: true,
            components: [
                {
                    content: $L("Add a messaging account to set your online status."),
                    style: "padding-bottom: 22px; text-align: center;"
                },
                {
                    classes: "flex-row", components: [
                        { kind: Button, content: $L("OK"), ontap: "closeNoAccountDialog" },
                        { classes: "flex-auto" },
                        {
                            kind: Button, content: $L("Add an Account"),
                            ontap: "addAccountClicked"
                        }
                    ]
                }
            ]
        },

        {
            name: 'threadFinder', kind: LunaService, service: DB_SERVICE, method: 'get',
            onResponse: 'gotThread', onError: 'serviceErr'
        },
        {
            name: 'threadMerge', kind: LunaService, service: DB_SERVICE, method: 'merge',
            onError: 'serviceErr'
        },
        {
            name: 'readMessageMerger', kind: LunaService, service: DB_SERVICE, method: 'merge',
            onError: 'serviceErr'
        },
        {
            name: 'launchApp', kind: LunaService,
            service: 'luna://com.webos.applicationManager', method: 'launch', onError: 'serviceErr'
        },
        {
            name: 'openApp', kind: LunaService,
            service: 'luna://com.palm.applicationManager', method: 'open', onError: 'serviceErr'
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.launchParamsHandled = false;
        this.prefs = null;

        this.$.views.setIndex(0);

        if (window.PalmSystem && PalmSystem.keepAlive) {
            // Mark the card cacheable off-screen, so throwing it away usually does not close it.
            PalmSystem.keepAlive(true);
        }

        if (appState.prefsHandler) {
            appState.prefsHandler.register(this, this.prefsUpdated.bind(this));
        }
        if (appState.accountService) {
            appState.accountService.register(this, this.accountsChanged.bind(this));
        }

        formFactor.apply(this);
    },

    /**
     * A rotation changes the answer on a tablet, so re-apply it. The narrow class is picked once
     * when the Panels is built, so re-pick it here too. The tab strip does not change - all four
     * tabs are offered on every device - only the number of panes does.
     *
     * handleResize, not resize: resize() is what *sends* the onresize waterfall from
     * enyo/master, and overriding it here only runs if somebody calls this control's resize()
     * directly, which nothing does. handleResize is the end that receives it.
     */
    handleResize: function () {
        this.inherited(arguments);
        var wide = formFactor.apply(this);
        if (this.$.slidingGroup && this.$.slidingGroup.narrowFitChanged) {
            this.$.slidingGroup.removeClass('enyo-panels-fit-narrow');
            this.$.slidingGroup.removeClass('enyo-panels-force-narrow');
            this.$.slidingGroup.narrowFitChanged();
            this.$.slidingGroup.reflow();
        }
        // Coming back to one pane with the conversation showing would otherwise leave the list
        // unreachable, since there is no Back affordance until a thread is open.
        if (!wide && this.$.slidingGroup && !appState.selectedThread) {
            this.$.slidingGroup.setIndex(0);
        }
    },

    destroy: function () {
        if (appState.prefsHandler) {
            appState.prefsHandler.unregister(this);
        }
        if (appState.accountService) {
            appState.accountService.unregister(this);
        }
        this.inherited(arguments);
    },

    rendered: function () {
        this.inherited(arguments);
        // Again here, not only in create(): FittableLayout reflows this control as it renders,
        // and the class has to be on the node the stylesheet will match against.
        formFactor.apply(this);
        this.handleLaunchParam();
    },

    // --- preferences -----------------------------------------------------------------------

    prefsUpdated: function (prefs) {
        this.prefs = prefs;
        if (!prefs) {
            return;
        }
        this.setOfflineMenuItem();
        this.$.messaging.setOfflinePrefs(prefs);

        if (window.PalmSystem && prefs.firstUseMode) {
            this.handleFirstLaunch();
        }
    },

    updateOfflinePrefs: function () {
        if (!this.prefs) {
            return true;
        }
        this.prefs.showOnlineBuddiesOnly = !this.prefs.showOnlineBuddiesOnly;
        if (appState.prefsHandler) {
            appState.prefsHandler.setPrefs(this.prefs);
        }
        return true;
    },

    setOfflineMenuItem: function () {
        if (!this.$.showOfflineMenuItem || !this.prefs) {
            return;
        }
        this.$.showOfflineMenuItem.setContent(this.prefs.showOnlineBuddiesOnly ?
            $L("Show Offline Buddies") : $L("Hide Offline Buddies"));
    },

    // --- accounts --------------------------------------------------------------------------

    accountsChanged: function () {
        // The presence bar and every list re-read their own data when accounts change; nothing to do
        // here beyond keeping the menu labels current.
        this.setOfflineMenuItem();
    },

    showAddAccountDialog: function () {
        this.$.noAccountDialog.show();
        return true;
    },

    closeNoAccountDialog: function () {
        this.$.noAccountDialog.hide();
        return true;
    },

    addAccountClicked: function () {
        this.$.noAccountDialog.hide();
        this.openPreferences();
        return true;
    },

    // --- thread selection --------------------------------------------------------------------

    threadSelected: function (inSender, inEvent) {
        this.selectThread(this.$.messaging, inEvent && inEvent.thread);
        return true;
    },

    chatViewSelectedThread: function (inSender, inEvent) {
        this.selectThread(this.$.chatView, inEvent && inEvent.thread);
        return true;
    },

    selectThread: function (source, thread) {
        appState.setSelectedThread(thread);

        if (source === this.$.messaging) {
            this.$.chatView.setChatThread(thread);
        } else if (source === this.$.chatView) {
            this.$.messaging.setSelection(thread);
        } else {
            this.$.chatView.setChatThread(thread);
            this.$.messaging.setSelection(thread);
        }

        if (thread && Panels.isScreenNarrow()) {
            this.$.slidingGroup.setIndex(1);
        }
    },

    deleteThread: function (inSender, inEvent) {
        var thread = inEvent && inEvent.thread;
        this.$.chatView.setDeletedChatThread(thread);
        if (appState.selectedThread && thread && appState.selectedThread._id === thread._id) {
            appState.setSelectedThread(null);
        }
        return true;
    },

    threadLocked: function (inSender, inEvent) {
        this.$.chatView.threadLocked(inEvent && inEvent.thread);
        return true;
    },

    openComposeView: function () {
        if (appState.selectedThread) {
            this.selectThread(null, null);
        }
        this.$.chatView.openComposeView(this, {});
        if (Panels.isScreenNarrow()) {
            this.$.slidingGroup.setIndex(1);
        }
        return true;
    },

    loginStatesChange: function (inSender, inEvent) {
        this.$.chatView.set('loginStates', (inEvent && inEvent.loginStates) || []);
        return true;
    },

    // --- unread counts -----------------------------------------------------------------------

    clearUnreadCount: function (inSender, inEvent) {
        var threadId = inEvent && inEvent.threadId;
        if (!threadId) {
            return true;
        }
        this.clearUnreadCountForThread(threadId);
        this.setThreadMessagesRead(threadId);
        return true;
    },

    clearUnreadCountForThread: function (threadId) {
        var record = { _id: threadId, _kind: messagingUtils.thread.dbKind, unreadCount: 0 };
        if (mockDb.enabled) {
            mockDb.merge([record]);
            return;
        }
        this.$.threadMerge.send({ objects: [record] });
    },

    setThreadMessagesRead: function (threadId) {
        if (mockDb.enabled) {
            var messages = mockDb.store[messagingUtils.message.dbKind] || [];
            for (var i = 0; i < messages.length; i++) {
                if (messages[i].conversations && messages[i].conversations.indexOf(threadId) >= 0 &&
                        messages[i].folder === messagingUtils.message.FOLDERS.INBOX) {
                    messages[i].flags = messages[i].flags || {};
                    messages[i].flags.read = true;
                }
            }
            return;
        }
        this.$.readMessageMerger.send({
            query: {
                from: messagingUtils.message.dbKind,
                where: [
                    { prop: "conversations", op: "=", val: threadId },
                    { prop: "folder", op: "=", val: messagingUtils.message.FOLDERS.INBOX }
                ]
            },
            props: { flags: { read: true } }
        });
    },

    // --- buddies & favorites -------------------------------------------------------------------

    addBuddy: function () {
        this.$.buddyDialog.show();
        return true;
    },

    showAddFavoriteList: function () {
        // Favorites are a Contacts concept, so adding one hands off to that app.
        this.$.launchApp.send({
            id: "com.palm.app.contacts", params: { launchType: "pickPerson", mode: "noFavoritesOnly" }
        });
        return true;
    },

    // --- menus & views ---------------------------------------------------------------------

    openAppMenu: function (inSender, inEvent) {
        this.showAppMenu(inEvent.activator);
        return true;
    },

    // The app's name in the status bar. Tapping it relaunches the app with
    // palm-command "open-app-menu", which webos-lib passes on as `menubutton` rather than as a
    // relaunch. The menu opens at the top left, under the name, and a second tap closes it, as
    // Mojo's did.
    toggleAppMenu: function () {
        if (this.$.appMenu.showing) {
            this.$.appMenu.hide();
        } else {
            this.showAppMenu(this.$.appMenuAnchor);
        }
        return true;
    },

    // onyx's floating Menu places itself against the control that opened it, and measures that
    // control again while it sizes itself. Opened with showAtEvent() or showAtPosition() it has
    // none: it threw while hidden for sizing, and stayed invisible.
    showAppMenu: function (activator) {
        this.setOfflineMenuItem();
        this.$.appMenu.requestMenuShow(this, { activator: activator });
    },

    openHelp: function () {
        this.$.openApp.send({ target: "http://help.palm.com/messaging/index.html" });
        return true;
    },

    openPreferences: function () {
        this.$.views.setIndex(2);
        return true;
    },

    closePreferences: function () {
        this.$.views.setIndex(0);
        return true;
    },

    handleFirstLaunch: function () {
        this.$.views.setIndex(1);
        // Land on the buddies tab after first launch, as the Mojo app did.
        this.$.messaging.menuToggle(this, 1);
        this.$.messaging.highlightTabButton(1);
    },

    doneFirstLaunch: function () {
        if (this.prefs && appState.prefsHandler) {
            this.prefs.firstUseMode = false;
            appState.prefsHandler.setPrefs(this.prefs);
        }
        this.$.views.setIndex(0);
        return true;
    },

    // --- launch parameters ---------------------------------------------------------------------

    handleRelaunch: function () {
        this.launchParamsHandled = false;
        this.handleLaunchParam();
        return true;
    },

    handleLaunchParam: function () {
        setTimeout(this.processParams.bind(this), 0);
    },

    processParams: function () {
        if (this.launchParamsHandled) {
            return;
        }
        this.launchParamsHandled = true;

        var params;
        try {
            if ('PalmSystem' in window && PalmSystem.launchParams) {
                params = JSON.parse(PalmSystem.launchParams);
            } else {
                return;
            }
        } catch (err) {
            this.error(err);
            return;
        }
        if (!params) {
            return;
        }

        try {
            if (params.threadId !== undefined) {
                this.findThread(params.threadId);
            } else if (params.message && params.message.conversations) {
                // Tapped a notification: open the thread the message belongs to.
                this.findThread(params.message.conversations[0]);
            } else if (params.compose) {
                this.$.chatView.preHandleLaunch(params.compose);
            } else if (params.personId || params.messageText ||
                    (params.composeRecipients && params.composeRecipients.length)) {
                this.$.chatView.preHandleLaunch(params);
            } else if (params.target) {
                var composeParams = urlTarget.composeParams(params.target);
                if (composeParams) {
                    this.$.chatView.preHandleLaunch(composeParams);
                }
            }
        } catch (err) {
            this.error(err);
        }
    },

    findThread: function (threadId) {
        if (mockDb.enabled) {
            this.gotThread(null, mockDb.get([threadId]));
            return;
        }
        this.$.threadFinder.send({ ids: [threadId] });
    },

    gotThread: function (inSender, inResponse) {
        var thread = inResponse && inResponse.results && inResponse.results[0];
        if (thread) {
            this.selectThread(null, thread);
        }
        return true;
    },

    // --- window lifecycle ----------------------------------------------------------------------

    windowActivatedHandler: function () {
        appState.setAppDeactivated(false);
        if (appState.selectedThread) {
            this.clearUnreadCount(this, { threadId: appState.selectedThread._id });
        }
        return true;
    },

    windowDeactivatedHandler: function () {
        appState.setAppDeactivated(true);
        if (appState.selectedThread) {
            this.clearUnreadCount(this, { threadId: appState.selectedThread._id });
        }
        return true;
    },

    windowHiddenHandler: function () {
        if (this.prefs && this.prefs.firstUseMode) {
            return true;
        }
        this.$.messaging.windowHiddenHandler();
        this.$.chatView.windowHiddenHandler();
        this.$.appMenu.hide();
        appState.setSelectedThread(null);
        return true;
    },

    windowShownHandler: function () {
        if (this.prefs && this.prefs.firstUseMode) {
            return true;
        }
        this.$.slidingGroup.setIndex(0);
        this.$.views.setIndex(0);
        this.$.messaging.windowShownHandler();
        return true;
    },

    goBack: function () {
        if (this.$.views.getIndex() !== 0) {
            this.$.views.setIndex(0);
            return true;
        }
        if (Panels.isScreenNarrow()) {
            this.$.slidingGroup.setIndex(0);
        }
        return true;
    },

    serviceErr: function (inSender, inError) {
        this.error("shell service failed:", inError && (inError.errorText || inError));
        return true;
    }
});
