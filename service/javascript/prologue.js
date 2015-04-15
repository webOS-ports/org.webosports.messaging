/*exported Contacts, Globalization, DB, Future, PalmCall */
/*global IMPORTS, console, process, require:true */

// Load the Foundations library and create
// short-hand references to some of its components.
var Foundations = IMPORTS.foundations;
var Contacts = IMPORTS.contacts;
var Globalization = IMPORTS.globalization.Globalization;

var DB = Foundations.Data.DB;
var Future = Foundations.Control.Future;
var PalmCall = Foundations.Comms.PalmCall;

//now add some node.js imports:
if (typeof require === "undefined") {
	require = IMPORTS.require;
}
var fs = require("fs"); //required for own node modules and current vCard converter.

var servicePath = fs.realpathSync(".");
var libPath = servicePath + "/javascript/utils/";
var checkResult = require(libPath + "checkResult.js");
var Log = require(libPath + "Log.js");
var MessageAssigner = require(libPath + "MessageAssigner.js");
var ActivityHandler = require(libPath + "ActivityHandler.js");

process.on("uncaughtException", function (e) {
	"use strict";
	console.error("Uncaought error:" + e.stack);
	//throw e;
});
