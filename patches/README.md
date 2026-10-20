# Patches for fetched Enyo libraries

`app/lib/` is not part of this repository. enyo-dev fetches each library listed in
`app/.enyoconfig` straight from the URL in its `sources` block, so anything changed there is
replaced on the next clean fetch. Patches that belong in those libraries are parked here until
they land upstream, or until `.enyoconfig` points at a fork that carries them.

## Why enyo-luneos and not webos-lib

webos-lib is the Enyo 2.5-and-earlier library and uses the old loader
(`enyo.depends()` in `package.js`, kinds under `source/`). enyo-luneos is its Enyo 2.7
successor and uses CommonJS modules, which is what enyo-dev resolves - so a fix landed in
webos-lib cannot be consumed by a 2.7 app like this one at all. webos-lib's own README says as
much: "For Enyo 2.5 and lower, use this. For Enyo 2.7 and higher, use enyo-luneos".

So these patches target enyo-luneos, and a webOS-ports fork of it is the place for them -
the same way webos-lib was itself "unified from webos-ports-lib, webOS-Ext & enyo1-to-enyo2
kinds". Point `app/.enyoconfig`'s `sources.enyo-luneos` at that fork and the app-side
workaround in `app/index.js` can go.

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

## enyo-luneos/0002-Do-not-gate-the-back-gesture-on-platform-detection.patch

Moves the keyup -> `backgesture` emulation out of the platform-gated block. webos-lib's
`source/BackGesture.js` never gated it, so the guard enyo-luneos added is a regression against
the library it replaced - and it makes the back gesture depend on platform sniffing it has no
need of. The Mojo hooks (relaunch, stageActivated, show/hide) stay behind the guard, which is
where they belong.

Either patch fixes the back gesture on its own; both were verified separately on a MindPhone with
the app-side workaround compiled out. 0001 additionally restores everything else that platform
detection gates, so both are worth carrying. They apply cleanly in sequence against a pristine
`LuneOS/LuneOS.js`.
