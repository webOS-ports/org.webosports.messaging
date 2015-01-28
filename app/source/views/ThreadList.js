/*global GlobalThreadCollection */

enyo.kind({
    name: "ThreadList",
    kind: "FittableRows",
    events: {
        onSelectThread: "",
        onCreateThread:"",
        onDeleteThread:""
    },
    bindings:[
        {from:".app.$.globalThreadCollection.status", to:".globalThreadCollectionStatus"},
        {from:".app.$.globalThreadCollection", to:".globalThreadCollection"}
    ],
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
                                        var col = this.repeater.collection;
                                        console.log("model", model, this, bind.owner);
                                        var currentDate = new moment(1000*(model.get?model.get("timestamp"):model.timestamp)).format("dddd, MMMM DD, YYYY");
                                        var prevModel = col.at(this.index-1);
                                        if (prevModel&&prevModel!=model){
                                            var prevDate = new moment(1000*(prevModel.get?prevModel.get("timestamp"):prevModel.timestamp)).format("dddd, MMMM DD, YYYY");
                                        }
                                        this.$.threadItemGroupHeader.setShowing(col.indexOf(model)==0||(prevDate!=null&&prevDate!=currentDate));
                                        this.$.threadItemGroupHeader.setContent(currentDate);
                                        return model;
                                    }
                                }
                            ]
                        }
                    ]

                },

                {
                    name: "BottomToolbar",
                    kind: "onyx.Toolbar",
                    components: [
                        { kind: "onyx.Button", content: "New", ontap:"createThread"}
                    ]
                }
            ]
        }
    ],

   create: function () {
        this.inherited(arguments);
        this.log("==========> Created thread list");
        this.$.realThreadList.set("collection", this.globalThreadCollection, true);
   },

    globalThreadCollectionStatusChanged: function(){
        console.log("changed", this.globalThreadCollection, this.globalThreadCollectionStatus);
        this.$.realThreadList.set("collection", this.globalThreadCollection, true);
        /*
        if (this.globalThreadCollectionFetching==false){
            this.$.realThreadList.set("collection", this.globalThreadCollection, true);
        }*/
    },
    selectThread: function (inSender, inEvent) {
        console.log("selectThread", inSender, inEvent);
        if (!inEvent||inEvent.index==undefined||inEvent.index==null){
            return true;
        }
        if (!inSender.selected()) {
            inSender.select(inEvent.index);
        }

        this.doSelectThread({thread: inSender.selected()});
    },

    createThread: function(s,e){
        this.doCreateThread();
        this.$.realThreadList.select(0);
        this.doSelectThread({thread: this.$.realThreadList.selected()});
        console.log("createNewThread", this.$.realThreadList.selected());
    },

    deleteThread: function(s,e){
        console.log("deleteThread", s, e);
        this.doDeleteThread();
    }

});
