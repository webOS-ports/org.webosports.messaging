/**  */


var kind = require('enyo/kind'),
    Collection = require('enyo/Collection'),
    ThreadModel = require('./ThreadModel');


module.exports = kind({
    name: "ThreadCollection",
    kind: Collection,
    model: ThreadModel,
    source: "db8",
    dbKind: "com.palm.chatthread:1",

    fetched: function (opts, res, source) {
        console.log("ThreadCollection fetched:", opts, res, source);
        var compare = function (a,b) {
            var recA=a.attributes?a.raw():a;
            var recB=b.attributes?b.raw():b;
            a = (recA.timestamp);
            b = (recB.timestamp);
            if (a > b) { return -1; }
            if (a < b) { return 1; }
            return 0;
        };
        if (res&&res.length>0){
            res.sort(compare);
        }
        this.inherited(arguments);

    }
    //best is to not store this collection... might break things. urgs.
});

