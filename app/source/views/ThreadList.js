/*global GlobalThreadCollection */

enyo.kind({
    name: "ThreadList",
    kind: "FittableRows",
    events: {
        onSelected: ""
    },
    components: [
        {
            name: "main",
            kind: "FittableRows",
            fit: true,
            components: [
                {
                    name: "realThreadList",
                    kind: "enyo.DataList",
                    ontap: "selectThread",
                    fit: true,
                    collection: GlobalThreadCollection,
                    classes: "threads-list",
                    scrollerOptions: {
                        horizontal: "hidden",
                        touch: true
                    },

                    components: [
                        {
                            classes: "thread-item-container",
                            components:[
                                { name:"threadItemGroupHeader", content:"Unknown date", classes:"thread-item-groupheader"},
                                { name:"threadItem", kind: "ThreadItem" }
                            ],
                            bindings: [
                                { from: ".model", to: ".$.threadItem.model",
                                    transform: function(model, dir, bind){
                                        if (!model) {return null};
                                        var col = model.owner;
                                        var currentDate = new moment(1000*(model.get?model.get("timestamp"):model.timestamp)).calendar();
                                        var prevModel = col.at(col.indexOf(model)-1);
                                        if (prevModel&&prevModel!=model){
                                            var prevDate = new moment(1000*(prevModel.get?prevModel.get("timestamp"):prevModel.timestamp)).calendar();
                                        }
                                        this.$.threadItemGroupHeader.setShowing(col.indexOf(model)==0||(prevDate!=null&&prevDate!=currentDate));
                                        this.$.threadItemGroupHeader.setContent(currentDate);
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
    },

});
