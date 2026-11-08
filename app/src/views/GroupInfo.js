/**
 * Group Info: what a tap on a group chat's header shows (ConversationList.openGroupInfo). The
 * group's name and service, who is in it, and the group's own actions where its service has them
 * (Add People, Leave Group, as the row under the header offers them).
 *
 * Who is in it comes from the conversation list (util/groupInfo): the transport's member list, or
 * while it has none, who has written in the chat, which the line under the title then says. A tap
 * on a member offers a 1:1 chat with them and making a contact of them. Where the service can take
 * someone out of a group (canRemove) and the transport said who is in it, a member's row swipes
 * as the chat list's rows do, to Delete and Cancel; Delete asks once more before onRemoveMember.
 *
 * The sheet takes the window less a margin, the member list what is left of its height, so the
 * list scrolls inside it however many there are; it is placed again once they are in.
 *
 * Drawn as the app's other dialogs: a light Enyo 1.0 sheet (palm-chrome.less), the rows as the
 * light popup menus' rows.
 */

var kind = require('enyo/kind'),
    Popup = require('onyx/Popup'),
    Button = require('onyx/Button'),
    Menu = require('onyx/Menu'),
    MenuItem = require('onyx/MenuItem'),
    Scroller = require('enyo/Scroller'),
    Control = require('enyo/Control'),
    SwipeableItem = require('./widgets/SwipeableItem'),
    groupInfo = require('../util/groupInfo'),
    messagingUtils = require('../util/messagingUtils'),
    $L = require('enyo/i18n').$L;

// A server's channel can have thousands online; more rows than this say how many more there are.
var MAX_ROWS = 300;

module.exports = kind({
    name: "GroupInfo",
    kind: Popup,
    centered: true,
    floating: true,
    modal: true,
    scrim: true,
    classes: "group-info",

    events: {
        onMemberChat: "",
        onMemberContact: "",
        onAddPeople: "",
        onLeaveGroup: "",
        onRemoveMember: ""
    },

    components: [
        { name: "title", classes: "group-dialog-title group-info-title", allowHtml: true },
        { name: "service", classes: "group-info-service", allowHtml: true },
        { name: "count", classes: "group-info-count" },
        {
            name: "scroller", kind: Scroller, classes: "group-info-members", horizontal: "hidden",
            touch: true, components: [
                { name: "list" }
            ]
        },
        {
            name: "actions", classes: "flex-row group-info-actions", components: [
                { name: "addButton", kind: Button, content: $L("Add People"), ontap: "addTapped" },
                {
                    name: "leaveButton", kind: Button, content: $L("Leave Group"),
                    classes: "onyx-negative", ontap: "leaveTapped"
                }
            ]
        },
        { kind: Button, content: $L("Done"), classes: "group-info-done", ontap: "doneTapped" },
        {
            name: "memberMenu", kind: Menu, floating: true, scrolling: false, components: [
                { name: "chatItem", kind: MenuItem, content: $L("Send Message"), ontap: "chatTapped" },
                { name: "contactItem", kind: MenuItem, content: $L("Add to Contacts"), ontap: "contactTapped" }
            ]
        },
        {
            name: "removeDialog", kind: Popup, centered: true, floating: true, modal: true, scrim: true,
            classes: "group-info-remove", components: [
                { name: "removeTitle", classes: "group-dialog-title", content: $L("Remove Member") },
                { name: "removeMessage", classes: "group-info-remove-message", allowHtml: true },
                {
                    classes: "flex-row", components: [
                        { kind: Button, content: $L("Cancel"), ontap: "removeCancelled" },
                        { classes: "flex-auto" },
                        {
                            name: "removeButton", kind: Button, content: $L("Remove"),
                            classes: "onyx-negative", ontap: "removeConfirmed"
                        }
                    ]
                }
            ]
        }
    ],

    /**
     * info: { title, serviceHtml, serviceName, members, fromService, loading, canAdd, canLeave,
     * canRemove }.
     */
    open: function (info) {
        this.info = info || {};
        this.$.title.setContent(messagingUtils.message.emojifyEscaped(this.info.title || $L("Group")));
        this.$.service.setContent(this.info.serviceHtml || "");
        this.$.addButton.setShowing(!!this.info.canAdd);
        this.$.leaveButton.setShowing(!!this.info.canLeave);
        this.$.actions.setShowing(!!(this.info.canAdd || this.info.canLeave));
        this.show();
        this.setMembers(this.info.members, this.info.fromService, this.info.loading);
    },

    /** The members to list; fromService: the transport gave them, else they are who has written. */
    setMembers: function (members, fromService, loading) {
        this.members = members || [];
        this.fromService = !!fromService;
        var n = this.members.length;
        var count;
        if (!n) {
            count = loading ? $L("Looking up members...") : $L("No members known yet.");
        } else if (fromService) {
            count = n === 1 ? $L("1 member") : $L("{n} members").replace("{n}", n);
        } else {
            count = $L("Who has written here");
        }
        this.$.count.setContent(count);
        this.$.list.destroyClientControls();
        var shown = Math.min(n, MAX_ROWS);
        // Only who the transport says is in it can be taken out; who has written may have left.
        var removable = !!(this.info && this.info.canRemove && this.fromService);
        for (var i = 0; i < shown; i++) {
            var m = this.members[i], address = groupInfo.shownAddress(m);
            this.$.list.createComponent({
                kind: removable ? SwipeableItem : Control, swipeable: removable,
                onConfirm: "removeSwiped",
                classes: "group-info-member", memberIndex: i, ontap: "memberTapped", components: [
                    {
                        classes: "group-info-member-name", allowHtml: true,
                        content: messagingUtils.message.emojifyEscaped(m.name)
                    },
                    {
                        classes: "group-info-member-address", showing: !!address,
                        content: address
                    }
                ]
            }, { owner: this });
        }
        if (n > shown) {
            this.$.list.createComponent({
                classes: "group-info-more", content: $L("and {n} more").replace("{n}", n - shown)
            }, { owner: this });
        }
        if (this.hasNode()) {
            this.$.list.render();
            this.$.scroller.scrollToTop();
            if (this.showing) {
                this.updatePosition();   // its height changed with the rows: centre it again
            }
        }
    },

    /** The member row a control is in, or null. */
    rowOf: function (control) {
        while (control && control.memberIndex === undefined) {
            control = control.parent;
        }
        return control || null;
    },

    /** A member swiped to Delete: ask once more, naming them and the group. */
    removeSwiped: function (inSender) {
        var row = this.rowOf(inSender);
        this.removing = row ? this.members[row.memberIndex] : null;
        if (!this.removing) {
            return true;
        }
        this.$.removeMessage.setContent($L("Remove {name} from {group}?")
            .replace("{name}", "<b>" + messagingUtils.message.emojifyEscaped(this.removing.name) + "</b>")
            .replace("{group}", messagingUtils.message.emojifyEscaped(this.info.title || $L("this group"))));
        this.$.removeDialog.show();
        return true;
    },

    removeCancelled: function () {
        this.$.removeDialog.hide();
        this.removing = null;
        return true;
    },

    removeConfirmed: function () {
        this.$.removeDialog.hide();
        var member = this.removing;
        this.removing = null;
        if (member) {
            this.doRemoveMember({ member: member });
        }
        return true;
    },

    memberTapped: function (inSender, inEvent) {
        var row = this.rowOf(inSender);
        // A tap on a row's Delete or Cancel is the prompt's, not the member's.
        if (row && row.$ && row.$.confirm && row.$.confirm.getShowing()) {
            return true;
        }
        this.member = row ? this.members[row.memberIndex] : null;
        if (!this.member) {
            return true;
        }
        this.$.memberMenu.requestMenuShow(this, { activator: row });
        return true;
    },

    chatTapped: function () {
        this.$.memberMenu.hide();
        var member = this.member;
        if (member) {
            this.hide();
            this.doMemberChat({ member: member });
        }
        return true;
    },

    contactTapped: function () {
        this.$.memberMenu.hide();
        if (this.member) {
            this.doMemberContact({ member: this.member });
        }
        return true;
    },

    addTapped: function () {
        this.hide();
        this.doAddPeople();
        return true;
    },

    leaveTapped: function () {
        this.hide();
        this.doLeaveGroup();
        return true;
    },

    /** Closed with a row's Delete showing: that prompt goes too, unanswered. */
    showingChanged: function () {
        this.inherited(arguments);
        if (!this.showing) {
            SwipeableItem.cancelPending();
            this.$.removeDialog.hide();
        }
    },

    doneTapped: function () {
        this.hide();
        return true;
    }
});
