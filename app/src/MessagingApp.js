/** Root control for LuneOS Messaging. */

var kind = require('enyo/kind'),
    Application = require('enyo/Application'),
    MainView = require('./views/MainView'),
    AccountService = require('./data/AccountService'),
    PrefsHandler = require('./data/PrefsHandler'),
    DashboardManager = require('./data/DashboardManager'),
    AccountErrorDashboard = require('./data/AccountErrorDashboard'),
    appState = require('./util/appState');

module.exports = kind({
    name: "MessagingApp",
    kind: Application,
    view: MainView,

    create: function () {
        // These have to exist on appState BEFORE the view tree is built: list rows consult the
        // account service and the prefs handler while rendering, so creating them as ordinary
        // components (which the inherited create() would build alongside the view) would leave the
        // first paint without connector icons, presence or the offline-buddy setting.
        appState.accountService = new AccountService();
        appState.prefsHandler = new PrefsHandler();
        appState.dashboardManager = new DashboardManager();
        appState.accountErrorDashboard = new AccountErrorDashboard();

        appState.accountService.getAccounts();

        this.inherited(arguments);
    },

    destroy: function () {
        if (appState.accountService) {
            appState.accountService.destroy();
            appState.accountService = null;
        }
        if (appState.prefsHandler) {
            appState.prefsHandler.destroy();
            appState.prefsHandler = null;
        }
        if (appState.dashboardManager) {
            appState.dashboardManager.destroy();
            appState.dashboardManager = null;
        }
        if (appState.accountErrorDashboard) {
            appState.accountErrorDashboard.destroy();
            appState.accountErrorDashboard = null;
        }
        this.inherited(arguments);
    }
});
