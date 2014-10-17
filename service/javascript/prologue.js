/*exported Contacts, Globalization, DB, Future, PalmCall */
/*global IMPORTS, console, process */

// Load the Foundations library and create
// short-hand references to some of its components.
var Foundations = IMPORTS.foundations;
var Contacts = IMPORTS.contacts;
var Globalization = IMPORTS.globalization.Globalization;

var DB = Foundations.Data.DB;
var Future = Foundations.Control.Future;
var PalmCall = Foundations.Comm.PalmCall;

process.on("uncaughtException", function (e) {
	"use strict";
	console.error("Uncaought error:" + e.stack);
	//throw e;
});
