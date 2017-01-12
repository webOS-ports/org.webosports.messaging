/**
 * Allows selection of a messaging address or phone number (for SMS), from user's contacts.
 * Copyright © 2017 by P. Douglas Reeder under the Apache 2.0 license.
 */

var kind = require('enyo/kind'),
    Control = require('enyo/Control'),
    InputDecorator = require('onyx/InputDecorator'),
    Input = require('onyx/Input'),
    Image = require('enyo/Image'),
    $L = require('enyo/i18n').$L,   // no-op placeholder
    DataList = require('enyo/DataList'),
    Collection = require('enyo/Collection'),
    MsgAddrCollection = require('../data/MsgAddrCollection'),
    showErrorBanner = require('../util/showErrorBanner');


module.exports = kind({
    name: 'MsgAddrSearchList',
    kind: Control,
    published: {
        searchText: ""
    },
    events: {
        onSelected: ''
    },
    bindings: [
        {from: "$.searchInput.value", to: "$.dataList.collection.searchText"},
        {from: "$.searchInput.value", to: "searchText", oneWay: false}
    ],
    classes: 'onyx-background',
    style: 'display: flex; flex-direction: column',
    components: [
        {
            kind: InputDecorator,
            style: 'box-sizing: border-box; width: 100%; display: flex; flex-direction: row; align-items: center;',
            components: [
                {content: $L("To"), style: "font-weight:bold; margin-right:5px;"},
                {
                    name: "searchInput",
                    kind: Input,
                    placeholder: $L("Enter number or search contacts"),
                    classes: 'search-input',
                    style: "flex: 1 1; vertical-align:middle;"
                },
                { kind: Image, src: "assets/search-input.png" }
            ]
        },
        {name: 'dataList', kind: DataList, collection: new MsgAddrCollection(), ontap: "selectMsgAddr", components: [
            {classes: 'msg-addr-item', components: [
                {name: 'addrHeader', classes: 'msg-addr-header',  components: [
                    {tag: 'hr'},
                    {name: 'addrHeaderLbl', classes: 'ellipsized-line', value: ''},
                    {tag: 'hr'}
                ]},
                {classes: 'msg-addr-wrapper', components: [
                    {name: 'value', classes: 'ellipsized-line'},
                    {name: 'type'}
                ]}
            ], bindings: [
                {from: '.model.displayName', to: '$.addrHeaderLbl.content'},
                {from: '.model.displayName', to: '$.addrHeader.showing', transform: function (value, dir, bind) {
                    // this.log(value, dir, bind);
                    if (this.index === 0) {
                        return true;
                    }
                    var prevHeader = this.repeater.collection.at(this.index-1).get('displayName');
                    return prevHeader !== value;
                }},
                {from: '.model.value', to: '$.value.content'},
                {from: '.model.type', to: '$.type.content', transform: function (type, dir, bind) {
                    if (type.indexOf('type_') === 0) {
                        return type.slice(5);
                    } else {
                        return type;
                    }
                }}
            ]}
        ]}
    ],

    reload: function () {
        this.log();
        this.$.dataList.get('collection').fetch({ error: showErrorBanner });

        var searchInput = this.$.searchInput;
        searchInput.set('value', "");
        setTimeout(function () {
            searchInput.focus();
        },0);
    },
    refilter: function (inSender, inEvent) {
        this.log(arguments);
        var searchText = this.$.dataList.get('collection').get("searchText");
        // // Forces refiltering without changing searchText.
        this.$.dataList.get('collection').searchTextChanged(searchText, searchText, "searchText");
    },
    // setupItem: function(inSender, inEvent) {
    //     this.inherited(arguments);
    // }

    selectMsgAddr: function (inSender, inEvent) {
        this.log();

        if (!inSender.selected()) {
            inSender.select(inEvent.index);
        }

        this.doSelected({msgAddr: inSender.selected()});
    }
});
