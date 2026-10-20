# Patches for fetched Enyo libraries

`app/lib/` is not part of this repository. enyo-dev fetches each library listed in
`app/.enyoconfig` straight from the URL in its `sources` block, so anything changed there is
replaced on the next clean fetch. Patches that belong in those libraries are parked here until
they land upstream, or until `.enyoconfig` points at a fork that carries them.

## enyo-luneos/0001-Detect-LuneOS-from-PalmSystem.patch

Applies to <https://github.com/JayCanuck/enyo-luneos.git> (the `sources` entry for
`enyo-luneos`), against `LuneOS/LuneOS.js`.

Makes the library detect LuneOS from `window.PalmSystem` when the user agent does not say
"luneos" - which it no longer does on a current WAM. Without it `webOS.platform` is `{}`, the
guard around every event hook in LuneOS.js is false, and an app has no back gesture.

`app/index.js` forces `webOS.platform.luneos` itself for exactly this reason, and that workaround
is what actually ships today. It can go once `.enyoconfig` fetches a patched enyo-luneos; the
library fix was verified on a MindPhone to be sufficient on its own, with the app-side workaround
disabled.

The same note records a second, separate bug this patch does not fix: enyo-webos's `webOS.js`
tests `if (d.platformVersionMajor && d.platformVersionMinor)`, which is falsy when the minor
version is legitimately 0 - as it is for LuneOS's "3.0.5" - so neither `platform.legacy` nor
`platform.open` is ever set either. That one wants a presence test, in enyo-webos.
