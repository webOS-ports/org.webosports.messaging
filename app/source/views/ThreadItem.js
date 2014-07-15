enyo.kind({
    name: "ThreadItem",
    bindings: [
        { from: ".model.displayName", to: ".$.name.content" },
        { from: ".model.summary", to: ".$.summary.content" },
    ],
    components: [
        { name: "name", content: "Name Name", classes: "name" },
        { name: "summary", content: "Summary", classes: "summary" },
    ]
});
