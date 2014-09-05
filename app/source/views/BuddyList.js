/*global GlobalThreadCollection */

enyo.kind({
    name: "BuddyList",
    kind: "FittableRows",
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
            kind: "enyo.DataList",
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
                        { name:"buddyItem", kind: "BuddyItem" }
                    ],
                    bindings: [
                    ]
                }
            ],

        },
        {
            name: "bottomToolbar",
            kind: "onyx.Toolbar",
            layoutKind:"FittableColumnsLayout",
            components: [
                { kind: "onyx.Button", content: "New"},
                { fit:true},
                {kind: "onyx.MenuDecorator", onSelect: "mystatusSelected", components: [
                    {
                        name:"currentStatus",
                        classes:"enyo-children-inline",
                        components:[
                            {
                                name:"currentStatusText",
                                content:"Offline"
                            },
                            {name:"currentStatusIcon", style:"width:18px; margin-left:5px", classes:"im-status button", kind:"onyx.Icon"},

                        ]
                    },
                    {kind: "onyx.Menu", floating:true, components: [
                        {
                            values:{content:"Available", classes:"im-status status-available"},
                            components:[
                                {style:"width:14px; margin-right:5px", classes:"im-status status-available", kind:"onyx.Icon"},
                                {content: "Available"},

                            ]
                        },
                        {
                            values:{content:"Busy", classes:"im-status status-busy"},
                            components:[
                                {style:"width:14px; margin-right:5px", classes:"im-status status-busy", kind:"onyx.Icon"},
                                {content: "Busy"},

                            ]
                        },
                        {
                            values:{content:"Offline", classes:"im-status status-offline"},
                            components:[
                                {style:"width:14px; margin-right:5px", classes:"im-status status-offline", kind:"onyx.Icon"},
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
        this.$.currentStatusIcon.setClassAttribute(selected.values.classes);
        this.$.bottomToolbar.resized();
    },

    globalBuddyCollectionFetchingChanged: function(){
        if (this.globalBuddyCollectionFetching==false){
            this.$.realBuddyList.set("collection", this.globalBuddyCollection, true);
        }
    },

});
