/*global GlobalThreadCollection */

enyo.kind({
    name: "ThreadList",
    kind: "FittableRows",
    style: "text-align:center;",
    fit: true,
    events: {
        onSelected: ""
    },
    components: [
        {
            name: "toolbar",
            kind: "onyx.Toolbar",
            components: [
                {
                    name: "tabs",
                    kind: "onyx.RadioGroup",
                    controlClasses: "onyx-tabbutton",
                    onActivate: "paneChange",
                    components: [
                        { name: "conversations", content: "Conversations", index: 0, active: true },
                        { name: "buddies", content: "Buddies", index: 1 }
                    ]
                }
            ]
        },
        {
            name: "main",
            description: "All",
            kind: "FittableRows",
            classes: "threads-list",
            fit: true,
            components: [
                {
                    name: "realThreadList",
                    classes: "contacts-list",
                    kind: "enyo.DataList",
                    ontap: "selectThread",
                    fit: true,
                    collection: GlobalThreadCollection,
                    scrollerOptions: {
                        horizontal: "hidden",
                        touch: true
                    },
                    components: [
                        {
                            components:[
                                { name:"threadItemGroupHeader", content:"Unknown date", classes:"thread-item-groupheader"},
                                { name:"threadItem", kind: "ThreadItem", classes: "thread-item" }
                            ],
                            bindings: [
                                { from: ".model", to: ".$.threadItem.model",
                                    transform: function(model, dir, bind){
                                        if (!model) {return null};
                                        var col = model.owner;
                                        var currentDate = model.get?model.get("timestamp"):model.timestamp;
                                        var prevModel = col.at(col.indexOf(model)-1);
                                        if (prevModel&&prevModel!=model){
                                            var prevDate = prevModel.get?prevModel.get("timestamp"):prevModel.timestamp;
                                        }
                                        this.$.threadItemGroupHeader.setShowing(col.indexOf(model)==0||(prevDate!=null&&prevDate!=currentDate));
                                        this.$.threadItemGroupHeader.setContent(new Date(currentDate*1000).toGMTString());
                                        return model;
                                    }
                                },
                                /*{ from: ".model", to: ".null",
                                    transform: function(val, dir, bind){
                                        console.log("Collection", val, dir, bind);
                                        return val;
                                    }
                                },*/
                            ]
                        }
                    ],

                }
            ],
        },
        {
            name: "BottomToolbar",
            kind: "onyx.Toolbar",
            components: [
                { kind: "onyx.Button", content: "New"}
            ]
        },
    ],

   create: function () {
        this.inherited(arguments);
        this.log("==========> Created thread list");
    },

    selectThread: function (inSender, inEvent) {
        if (!inSender.selected()) {
            inSender.select(inEvent.index);
        }

        this.doSelected({thread: inSender.selected()});
    }
});
