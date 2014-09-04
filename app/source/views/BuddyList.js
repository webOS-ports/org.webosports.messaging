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
            name: "BottomToolbar",
            kind: "onyx.Toolbar",
            layoutKind:"FittableColumnsLayout",
            components: [
                { kind: "onyx.Button", content: "New"},
                { fit:true},
                {kind: "onyx.MenuDecorator", onSelect: "mystatusSelected", components: [
                    {
                        classes:"enyo-children-inline",
                        components:[
                            {
                                name:"currentStatus",
                                content:"Offline"
                            },
                            {name:"imStatus", style:"width:14px; margin-left:5px", components:[{classes:"im-status button", kind:"onyx.Icon"}]},

                        ]
                    },
                    {kind: "onyx.Menu", components: [
                        {
                            components:[
                                {name:"imStatus", style:"width:14px; margin-right:5px", components:[{classes:"im-status available", kind:"onyx.Icon"}]},
                                {content: "Available"},

                            ]
                        },
                        {
                            components:[
                                {name:"imStatus", style:"width:14px; margin-right:5px", components:[{classes:"im-status away", kind:"onyx.Icon"}]},
                                {content: "Busy"},

                            ]
                        },
                        {
                            components:[
                                {name:"imStatus", style:"width:14px; margin-right:5px", components:[{classes:"im-status offline", kind:"onyx.Icon"}]},
                                {content: "Offline"},

                            ]
                        },
                        {classes: "onyx-menu-divider"},
                        {content: "Individual"},
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

    globalBuddyCollectionFetchingChanged: function(){
        if (this.globalBuddyCollectionFetching==false){
            this.$.realBuddyList.set("collection", this.globalBuddyCollection, true);
        }
    },

});
