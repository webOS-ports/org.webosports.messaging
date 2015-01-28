enyo.depends(
    "$lib/layout",
   // "$lib/layout/flex/source",
    "$lib/onyx",    // To theme Onyx using Theme.less, change this line to $lib/onyx/source,
    //"Theme.less",    // uncomment this line, and follow the steps described in Theme.less
    //"$lib/webos-lib",
    "$lib/enyo-webos",
    "$lib/webos-lib/source/BackGesture.js",
    "$lib/momentjs",
    "$lib/sharedWidgets",
    // CSS/LESS style files
    "style",
    // Model and data definitions
    "data",
    // View kind definitions
    "views",
    // Include our default entry point
    "app.js"
);
