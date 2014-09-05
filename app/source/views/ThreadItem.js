enyo.kind({
    name: "ThreadItem",
    classes: "thread-item enyo-children-inline",
    bindings: [
        { from: ".model.unreadCount", to: ".$.unreadCount.content" },
        { from: ".model.unreadCount", to: ".$.unreadCount.showing", transform: function(val, dir, bind){return (val!=0);} },
        { from: ".model.displayName", to: ".$.name.content" },
        { from: ".model.summary", to: ".$.summary.content" },
    ],
    components: [
        {
            classes:"info",
            components:[
                {
                    classes:"enyo-children-inline",
                    components:[
                        { name: "name", content: "Name Name", classes: "name" },
                        {
                            name:"unreadCount",
                            classes:"unreadcount"
                        },

                    ]
                },
                { name: "summary", content: "Summary", classes: "summary"},

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
