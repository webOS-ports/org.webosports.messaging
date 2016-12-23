enyo.kind({
    name: "ContactItem",
    published: {
        icon: {
            src: "",
            showing: false
        }
    },
    bindings: [
        {from: ".model.displayName", to: ".$.name.content"},
        // Quotes are needed to work around a bug in Black Eye when using sizing "cover".
        // The should not be needed (and are not needed in Safari 7.1).
        {from: ".model.listPhoto", to: ".$.photo.src", transform: function(path) {return "'" + (path || "assets/bg_icon_img.png") + "'" ;}},
        {from: ".model.favorite", to: ".$.favCell.showing"}
    ],
    components: [
        //{ name: "profilePicture", kind: "Image", src: "assets/bg_icon_img.png" },
        { classes: "icon", components: [
            {
                name: "photo",
                classes: "list-img",
                kind: "enyo.Image",
                sizing: "cover"
            },
            { classes: "list-mask"}
        ] },
        { name: "name", content: "Name Name", classes: "name" },
        { name: "favCell", classes: "favorite-cell", showing: false, components: [
            { name: "favIcon", classes: "favorite", kind: "onyx.Icon" }
        ]}
    ]
});
