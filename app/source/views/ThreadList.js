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
    holdEvtFlag: false,
    dialogThread: null,
    components: [
        {
            name: "main",
            kind: "FittableRows",
            fit: true,
            components: [
                {
                    name: "realThreadList",
                    kind: "enyo.DataList",
                    fit: true,
                    groupSelection: true,   // disables tap-to-deselect
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
                            ],
                            ontap: "selectThread",
                            onhold: "showThreadDlg"
                        }
                    ]

                },
                {name:'threadDlg', kind: 'onyx.Popup',
                            style: 'display: absolute; bottom: 0; left: 0; right: 0;', components: [
                    {name: 'threadDlgQuestion', style: 'margin: 0.5rem 0.5rem 1rem;'},
                    {kind: 'enyo.FittableColumns', style: 'margin: 1rem 0.5rem 0.5rem;', components: [
                        {kind: 'onyx.Button', content: $L("Cancel"), style: 'height:48px; width:45%;', ontap: "closeThreadDlg"},
                        {fit: true},
                        {kind: 'onyx.Button', content: $L("Delete"), classes: "onyx-negative", style: 'height:48px; width:45%;', ontap: "deleteThread"}
                    ]}
                ]},

                {
                    name: "BottomToolbar",
                    kind: "onyx.Toolbar",
                    classes: "unpaddedToolbar",
                    components: [
                        { kind: "onyx.IconButton", src: "assets/icon-new.png", ontap: "createThread" }
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
        this.log(this.globalThreadCollection, this.globalThreadCollectionStatus);
        this.$.realThreadList.set("collection", this.globalThreadCollection, true);
        /*
        if (this.globalThreadCollectionFetching==false){
            this.$.realThreadList.set("collection", this.globalThreadCollection, true);
        }*/
    },
    forceSelectThread: function(thread) {
        var idx = this.globalThreadCollection.indexOf(thread);
        this.$.realThreadList.select(idx);
    },
    selectThread: function (inSender, inEvent) {
        if (this.holdEvtFlag) {   // if the user held, ignore this tap event
            this.holdEvtFlag = false;
            return;
        }
        this.log(inEvent.model.toJSON());

        this.doSelectThread({thread: inEvent.model});
    },

    showThreadDlg: function(inSender, inEvent) {
        this.log(inEvent.model.toJSON());
        this.holdEvtFlag = true;

        this.dialogThread = inEvent.model;
        var displayName, question;
        if (displayName = this.dialogThread.get('displayName').trim()) {
            question = enyo.quickMacroize($L("Delete conversation with “{$displayName}”?"), {displayName: displayName});
        } else {
            question = $L("Delete selected conversation?");
        }
        this.$.threadDlgQuestion.set('content',question);
        this.$.threadDlg.show();

        //inEvent.preventDefault();
        return true;
    },
    deleteThread: function(inSender, inEvent){
        this.log();

        this.doDeleteThread({thread: this.dialogThread});
        this.$.threadDlg.hide();

        inEvent.preventDefault();
        return true;
    },
    closeThreadDlg: function (inSender, inEvent) {
        this.log();

        this.$.threadDlg.hide();

        inEvent.preventDefault();
        return true;
    },

    createThread: function(s,e){
        this.doCreateThread();
        this.$.realThreadList.select(0);
        this.doSelectThread({thread: this.$.realThreadList.selected()});
        console.log("createNewThread", this.$.realThreadList.selected());
    }

});
