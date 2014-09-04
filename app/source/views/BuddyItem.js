enyo.kind({
        name: "BuddyItem",
        classes: "thread-item enyo-children-inline",
        bindings: [
            { from: ".model.displayName", to: ".$.name.content" },
        ],
        components: [
            {
                classes:"info",
                components:[
                    {
                        classes:"enyo-children-inline",
                        components:[
                            { name:"imStatus", style:"width:14px; margin-right:5px;", components:[{classes:"im-status unknown", kind:"onyx.Icon"}]},
                            { name: "name", content: "Name Name", classes: "name" },
                        ]
                    },

                ]
            },
            {
                classes:"icon",
                components:[
                    {classes:"mask"},
                    {classes:"img"}
                ]
            }
        ]
    }
);
