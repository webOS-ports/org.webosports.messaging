enyo.depends(
    "$lib/layout",
   // "$lib/layout/flex/source",
    "$lib/onyx",    // To theme Onyx using Theme.less, change this line to $lib/onyx/source,
    "$lib/enyo-webos",
    "$lib/webos-lib",
    "$lib/momentjs",
    "contactsPicker",   // separate from other source to ease refactoring
    // CSS/LESS style files
    "style",
    // Model and data definitions
    "data",
    // View kind definitions
    "views",
    // Include our default entry point
    "app.js"
);
