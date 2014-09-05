enyo.kind({
    name: "ThreadCollection",
    kind: "enyo.Collection",
    model: "ThreadModel",
    defaultSource: "db8",
    dbKind: "com.palm.chatthread:1",

    didFetch: function (rec, opts, res) {
        this.inherited(arguments);

        var compare = function (a,b) {
            var recA=a.attributes?a.raw():a;
            var recB=b.attributes?b.raw():b;
            a = (recA.timestamp);
            b = (recB.timestamp);
            if (a > b) { return -1; }
            if (a < b) { return 1; }
            return 0;
        };

        if (this.records&&this.records.length!=0){
            this.records.sort(compare);
        }

    }
    //best is to not store this collection... might break things. urgs.
});

//var GlobalThreadCollection = new ThreadCollection({instanceAllRecords: false});
