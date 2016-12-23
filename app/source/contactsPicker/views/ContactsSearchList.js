enyo.kind({
    name: "ContactsSearchList",
    kind: "FittableRows",
    classes: "contacts-list",
    published:{
        collection:null,
        searchText:""
    },
    bindings:[
        {from:".collection", to:".$.contactsList.collection"},
        {from: ".$.searchInput.value", to: ".$.contactsList.collection.searchText"},
        {from: "$.searchInput.value", to: "searchText", oneWay: false}
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
    refilter: function (inSender, inEvent) {
        var searchText = this.collection.get("searchText");
        // Forces refiltering without changing searchText.
        this.collection.searchTextChanged(searchText, searchText, "searchText");
    },

    components: [
    {
        kind: "onyx.InputDecorator",
        classes: "contacts-search",
        alwaysLooksFocused: true,
        components: [
            { content:"To: ", style: "font-weight: bold; vertical-align:middle; margin-right:5px;"},
            // When our version of webkit supports type "search", we can get a "recent searches" dropdown for free
            { name: "searchInput", kind: "onyx.Input", placeholder: "Name or IM address", style:"vertical-align:middle;" /*, type: "search", attributes: {results:6, autosave:"contactsSearch"}, style: "font-size: 16px;"*/ },
            { kind: "Image", src: "assets/search-input.png" }
        ]
    },
    { name: "contactsList", kind: "ContactsList", fit: true, ontap: "selectPerson" }
    ]
});
