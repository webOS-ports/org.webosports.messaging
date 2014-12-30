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
var checkResult = require(servicePath + "/javascript/utils/checkResult.js");
var Log = require(servicePath + "/javascript/utils/Log.js");

process.on("uncaughtException", function (e) {
	"use strict";
	console.error("Uncaought error:" + e.stack);
	//throw e;
});
