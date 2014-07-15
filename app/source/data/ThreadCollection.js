enyo.kind({
    name: "ThreadCollection",
    kind: "enyo.Collection",
    model: "ThreadModel",
    defaultSource: "db8",
    dbKind: "com.palm.chatthread:1"
    //best is to not store this collection... might break things. urgs.
});

var GlobalThreadCollection = new ThreadCollection({instanceAllRecords: false});
