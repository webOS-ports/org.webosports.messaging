enyo.kind({
    name: "ContactsList",
    classes: "contacts-list",
    kind: "enyo.DataList",
    scrollerOptions: {
        horizontal: "hidden",
        touch: true
    },
    components: [
        {
            kind: "ContactItem",
            classes: "contacts-item"
        }
    ]
});
