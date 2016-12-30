/*global GlobalThreadCollection */

var kind = require('enyo/kind'),
    FittableRows = require('layout/FittableRows'),
    FittableColumnsLayout = require('layout/FittableLayout').Columns,
    DataList = require('enyo/DataList'),
    BuddyItem = require('./BuddyItem'),
    Toolbar = require('onyx/Toolbar'),
    Button = require('onyx/Button'),
    MenuDecorator = require('onyx/MenuDecorator'),
    Icon = require('onyx/Icon'),
    Menu = require('onyx/Menu');

module.exports = kind({
    name: "BuddyList",
    kind: FittableRows,
    events: {
        onSelected: ""
    },
    bindings:[
        {from:".app.$.globalBuddyCollection.isFetching", to:".globalBuddyCollectionFetching"},
        {from:".app.$.globalBuddyCollection", to:".globalBuddyCollection"}
    ],
    components: [
        {
            name: "realBuddyList",
            kind: DataList,
            ontap: "selectThread",
            fit: true,
            classes: "threads-list",
            scrollerOptions: {
                horizontal: "hidden",
                touch: true
            },

            components: [
                {
                    classes: "thread-item-container",
                    components:[
                        { name:"buddyItem", kind: BuddyItem }
                    ],
                    bindings: [
                    ]
                }
            ],

        },
        {
            name: "bottomToolbar",
            kind: Toolbar,
            layoutKind: FittableColumnsLayout,
            components: [
                { kind: Button, content: "New"},
                { fit:true},
                {kind: MenuDecorator, onSelect: "mystatusSelected", components: [
                    {
                        name:"currentStatus",
                        classes:"enyo-children-inline",
                        components:[
                            {
                                name:"currentStatusText",
                                content:"Offline"
                            },
                            {name:"currentStatusIcon", style:"width:18px; margin-left:5px", classes:"im-status button", kind:Icon},

                        ]
                    },
                    {kind: Menu, floating:true, components: [
                        {
                            values:{content:"Available", classes:"im-status status-available"},
                            components:[
                                {style:"width:14px; margin-right:5px", classes:"im-status status-available", kind:Icon},
                                {content: "Available"},

                            ]
                        },
                        {
                            values:{content:"Busy", classes:"im-status status-busy"},
                            components:[
                                {style:"width:14px; margin-right:5px", classes:"im-status status-busy", kind:Icon},
                                {content: "Busy"},

                            ]
                        },
                        {
                            values:{content:"Offline", classes:"im-status status-offline"},
                            components:[
                                {style:"width:14px; margin-right:5px", classes:"im-status status-offline", kind:Icon},
                                {content: "Offline"},

                            ]
                        },
                        {classes: "onyx-menu-divider"},
                        {content: "Set Individually", style:"font-size:0.9rem;"},
                    ]}
                ]},
            ]
        },
    ],

    create: function () {
        this.inherited(arguments);
        this.log("==========> Created buddy list");
        this.$.realBuddyList.set("collection", this.globalBuddyCollection);
    },

    selectThread: function (inSender, inEvent) {
        if (!inSender.selected()) {
            inSender.select(inEvent.index);
        }

        this.doSelected({thread: inSender.selected()});
    },

    mystatusSelected: function(s,e){
        this.log("mystatusChanged", s,e);
        console.log( this.$.currentStatus);
        var selected = e.selected;
        this.$.currentStatusText.setContent(selected.values.content);
        this.$.currentStatusIcon.set('classes', selected.values.classes);
        this.$.bottomToolbar.resize();
    },

    globalBuddyCollectionFetchingChanged: function(){
        if (this.globalBuddyCollectionFetching==false){
            this.$.realBuddyList.set("collection", this.globalBuddyCollection, true);
        }
    },

});
