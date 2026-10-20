/**
 * Search field shown above the thread and buddy lists.
 * Enyo 2 stand-in for Mojo's enyo.SearchInput: fires onSearchChange as the user types, with a
 * cancel affordance that clears the field.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    Input = require('onyx/Input'),
    InputDecorator = require('onyx/InputDecorator'),
    Image = require('enyo/Image'),
    $L = require('enyo/i18n').$L;

module.exports = kind({
    name: "SearchInput",
    kind: Control,
    classes: "messaging-search",

    published: {
        placeholder: $L("Search"),
        value: ""
    },

    events: {
        onSearchChange: "",
        onSearchCancel: ""
    },

    components: [
        {
            kind: InputDecorator, classes: "flex-row", components: [
                {
                    name: "input", kind: Input, classes: "flex-one search-input",
                    oninput: "inputChanged", onchange: "inputChanged"
                },
                { name: "icon", kind: Image, src: "assets/search-input.svg", ontap: "clearTapped" }
            ]
        }
    ],

    create: function () {
        this.inherited(arguments);
        this.placeholderChanged();
        this.valueChanged();
    },

    placeholderChanged: function () {
        this.$.input.set('placeholder', this.placeholder);
    },

    valueChanged: function () {
        if (this.$.input.get('value') !== this.value) {
            this.$.input.set('value', this.value);
        }
    },

    inputChanged: function (inSender, inEvent) {
        this.value = this.$.input.get('value') || "";
        this.doSearchChange({ value: this.value });
    },

    clearTapped: function (inSender, inEvent) {
        if (!this.value) {
            return true;
        }
        this.set('value', "");
        this.$.input.set('value', "");
        this.doSearchChange({ value: "" });
        this.doSearchCancel();
        return true;
    },

    forceBlur: function () {
        if (this.$.input.hasNode()) {
            this.$.input.blur();
        }
    }
});
