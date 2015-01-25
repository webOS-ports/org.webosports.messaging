enyo.kind({
    name: "ContactsSearchList",
    kind: "FittableRows",
    classes: "contacts-list",
    published:{
        collection:null
    },
    bindings:[
        {from:".collection", to:".$.contactsList.collection"},
        {from: ".$.searchInput.value", to: ".$.contactsList.collection.searchText"}
    ],
    events: {
        onSelected: ""
    },
    create: function(){
        this.inherited(arguments);
        this.collection = new AllPersonCollection();
    },
    selectPerson: function (inSender, inEvent) {
        if (!inSender.selected()) {
            inSender.select(inEvent.index);
        }

        this.doSelected({person: inSender.selected()});
    },

    components: [
    {
        kind: "onyx.InputDecorator",
        classes: "contacts-search",
        components: [
            // When our version of webkit supports type "search", we can get a "recent searches" dropdown for free
            { name: "searchInput", kind: "onyx.Input", placeholder: "Search" /*, type: "search", attributes: {results:6, autosave:"contactsSearch"}, style: "font-size: 16px;"*/ },
            { kind: "Image", src: "assets/search-input.png" }
        ]
    },
    { name: "contactsList", kind: "ContactsList", fit: true, ontap: "selectPerson" }
    ]
});