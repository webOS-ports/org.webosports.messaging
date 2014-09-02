enyo.kind({
    name: "ThreadItem",
    kind:"FittableColumns",
    bindings: [
        { from: ".model.displayName", to: ".$.name.content" },
        { from: ".model.summary", to: ".$.summary.content" },
    ],
    components: [
        {
            fit:true,
            components:[
                { name: "name", content: "Name Name", classes: "name" },
                { name: "summary", content: "Summary", classes: "summary" },

            ]
        },
        {
            kind:"onyx.Icon",
            style:"width:50px; height:50px; border:1px solid red; vertical-align:text-top;",
        }

    ]
});
