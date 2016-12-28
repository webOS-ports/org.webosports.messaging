/**  */

var kind = require('enyo/kind'),
    DataList = require('enyo/DataList'),
    ContactItem = require('./ContactItem');


module.exports = kind({
    name: "ContactsList",
    classes: "contacts-list",
    kind: DataList,
    scrollerOptions: {
        horizontal: "hidden",
        touch: true
    },
    components: [
        {
            kind: ContactItem,
            classes: "contacts-item"
        }
    ]
});
