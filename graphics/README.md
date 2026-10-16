# Artwork

Open webOS shipped its UI as flat PNGs and the sources were never opened. Those
images are Palm's, so the app's artwork is being redrawn.

It ships as **SVG**, in `app/assets`, and the app loads it as SVG. WAM is
Chromium, so there is no density to build for and nothing to rebuild for a
denser screen - a glyph is as crisp at 4x as at 1x. The SVG *is* the source;
there is no raster step in the build.

Four of these marks are also written out as PNG, because sam reads `icon` and
`miniicon` out of `appinfo.json` and notificationmgr reads `iconUrl` out of
`DashboardManager`, and neither is a web view. Those PNGs are renders of the
SVG beside them, not separate drawings: `render.py --rasters` makes them.

## Tools

```sh
python3 graphics/render.py            # rasterise into graphics/render, for looking at
python3 graphics/render.py --scale 4  # ... at 4x, to check a glyph holds up
python3 graphics/render.py --rasters  # refresh the four PNGs that ship beside the SVG
python3 graphics/compare.py REFDIR    # measure the renders against the originals
python3 graphics/compare.py REFDIR --mask NAME   # one asset's alpha mask, as text
```

`render.py` uses `rsvg-convert` when it is installed and headless Chromium
otherwise - the same engine the phone draws with. ImageMagick's own SVG
renderer will not do: it drops colour entirely. A snap-confined Chromium can
read neither `/tmp` nor a dot-directory, and when it is refused it writes no
screenshot and still exits 0, so `render.py` stages beside the sources, deletes
the target first and checks the file afterwards - otherwise a failed render
looks exactly like a successful render of whatever was there before.

Giving Chromium its own `--user-data-dir` per run looks like an obvious way to
let several renders run at once. It is not: with a fresh profile it draws a tall
`<img>` at a fraction of its height and still exits 0, so `dialogbg` and
`online-status` come out cut off. Leave the profile alone.

`REFDIR` holds the images being replaced. They are not in the tree - recover
them with `git show dc8450b^:app/assets/<name>`.

## Drawing to match

Eyeballing a contact sheet is how a glyph ends up the right idea at the wrong
weight, which is what happened to the first attempt at these. `compare.py`
prints where the ink sits, how much of it there is and how far the two are apart
per pixel, and an alpha mask is usually enough to read a shape off. Work from
those numbers, not from a thumbnail.

**The toolbar glyphs are engraved, not flat.** Each original has a one-pixel line of the
opposite tone along its lower edge - white under the dark resting glyph, black under the lit
one - and that line is most of what makes them read as cut into the bar rather than laid on
it. Both traced states had inherited a dark drop shadow instead, which is the opposite of
what the resting one does. Drawing the line as a copy of the glyph a pixel lower, masked to
where the glyph is not, keeps it its own colour instead of letting the half-transparent body
tint it; adding it took `menu-icon-conversation` from 8.5 to 7.0, `menu-icon-buddies` from
12.9 to 10.6, `icon-decline` from 11.9 to 9.3 and `menu-icon-conversation-plus` from 11.0 to
9.3, and it is the single change that makes the set look like the original rather than like a
set of silhouettes.

**Author the geometry; do not trace it.** Every glyph here that was traced off
its 32px bitmap carries the resampling in its outline, and no amount of fitting
gets it back: the trace of `menu-icon-servers` was a lumpy polygon at 19, and
the same bars measured off the original - 33 by 8 on whole pixels, corners 2.5,
repeated every 10 - are at 1.3. The pattern held everywhere it was tried. What
the original is made of is usually simple and usually measurable:

- `phone-icon` is **one arc**. Its outer edge fits a circle about (25.65,4.49)
  of r 25.75 to 0.07px, its inner edge is r 18.50 about the same point, and the
  earpiece and mouthpiece are discs at the ends of that sector.
- `icon-decline` is two 45-degree bars cut square against a box, so its arm ends
  are a vertical and a horizontal edge rather than points.
- `msg-delivered` has no top-to-bottom gradient at all: the ramp runs *across*
  each arm, lit on the upper-left edge, so each arm needs its own perpendicular
  gradient and the two meet at a round join.
- `list-unread` is not a flat disc - it has a dark top and a white arc along its
  foot, drawn as the disc less a copy of itself 0.9px higher so the two regions
  meet exactly and neither tints the other.

**Refit the fill when the geometry changes.** The two-state toolbar gradients
were fitted against the traced outlines, which carried more ink than the
original, so they came out too strong. With the geometry authored they want
pulling back - a `fill-opacity` multiplier on the `<use>` does it without
disturbing the shape of the ramp, and that one change took `menu-icon-buddies`
from 17.7 to 12.9 and `menu-icon-conversation` from 13.6 to 8.6.

**A pixel metric will happily delete detail.** Fitting the calendar badge
against a 41px resample drove its binder rings to 0.2px wide, because thin rings
scored better than right ones. Numbers are for the geometry you can measure; what
the drawing is *made of* is not up for optimisation.

Sizes and sprite layouts are not free: `.sent-received` is a 17x17 window onto a
17x34 sheet, the presence sheet is stepped every 16px by `palm-app.less`, and
`menuitem-arrow-dark` holds a closed and an open frame. The root `width` and
`height` have to stay exactly what the stylesheet expects.

## Where it stands

Every image the app ships is now SVG - 47 files. Nothing is a bitmap drawing any more;
`app/icon.png` is the community's launcher artwork and the only PNG left that is not a render
of an SVG in this directory.

Mean per-pixel distance from the Palm art each one replaces, worst first, out of 255:

| | |
|---|---|
| over 12 | `menu-icon-attach` 26, `notification-large-failed` 25, `messaging-48x48` 17, `icon-165x165` 16, `notification-large-messaging` 16, `notification-small` 15, `phone-icon` 14, `attach-location` 13, `menu-icon-send` 13 |
| 8-12 | `video-call-icon` 12, `msg-read` 12, `menu-icon-buddies` 11, `header-warning-icon` 11, `online-status` 9.6, `menu-icon-conversation-plus` 9.3, `icon-decline` 9.3, `msg-delivered` 8.9, `menuitem-arrow-dark` 8.2, `menu-icon-favorites` 8.2 |
| 4-8 | `incoming-outgoing` 7.9, `chat-balloon-error-shape` 7.9, `chat-balloon-received-error-shape` 7.8, `dialogbg` 7.1, `menu-icon-conversation` 7.0, `search-input` 6.0, `list-view-avatar-frame` 5.4, `menu-icon-mic-rec` 5.0, `menu-icon-mic` 4.9, `chat-balloon-received-shape` 4.0 |
| under 4 | `attach-doc` 3.7, `mini-player-icon-play` 3.2, `attach-ppt` 3.1, `list-unread` 2.9, `attach-xls` 2.6, `chat-balloon-sent-shape` 2.4, `mini-player-icon-pause` 1.9, `loading-bg` 1.9, `list-avatar-default` 1.5, `favorites-star-blue` 1.4, `menu-icon-servers` 1.3, `defaultview-panel-tile` 0.8, the two chrome shadows 0.3 |

Four of them are not measured against Palm's art, because they are not meant to match it. The
file-type badges and the contacts mark follow the community's redrawn 1024px masters in the
[`graphics`](https://github.com/webOS-ports/graphics) repository instead - `Icon-contacts-1024`,
`Icon-calendar-1024` and `Icon-pdf-variant1`. Those are drawn from here rather than resampled
from there, which is what `from-masters.py` used to do and why it is gone: a Lanczos resample
of a 1024px painting only exists at the size it was made for. Against those resamples:
`attach-event` 21, `header-icon-contacts` 40, `attach-contact` 40, `attach-pdf` 45. They are
redraws of the same composition in the same palette, not copies of it.

Flatten a master to look at while drawing with
`convert psd/Icon-contacts-1024.psd[0] -background none -resize 410x410 out.png` - at 410 a
pixel of the output is a tenth of a unit in a 41px viewBox, so measurements come straight off
it. ImageMagick is needed because Pillow cannot read the 16-bit PSDs.

`icon-165x165` is counted against a worn stamp it deliberately does not copy: the rings and
legend are drawn clean, and the legend says LuneOS. Everything else about it is measured - the
two ring radii and weights, the legend's baseline radius and size (from Prelude's own ascender
and descender against the original's ink extent), the 32 degree turn of the legend ring, and
both balloons' ellipses fitted to the original's edge. Rendering it here the way the device
will needs Prelude, which is not a host font: pull it off a device with
`adb pull /usr/share/fonts/Prelude-Medium.ttf` and point fontconfig at it through
`FONTCONFIG_FILE`, or the sheet silently falls back and the legend comes out the wrong width.

`menu-icon-attach` is the one that resisted. Its wire is four parallel runs joined by three
bends, 2.8, 6.4 and 3.1 apart perpendicular against a wire 2.5 wide - two tight pairs with a
gap down the middle. Several serpentines built to those numbers came out worse than the trace
they would have replaced, so the outline is still the trace; it does at least carry the
engraved line now, which took it from 27 to 26. The way in is probably the clip's own
construction rather than its cross-section.

The house style to follow is the community's redrawn webOS source art in the
[`graphics`](https://github.com/webOS-ports/graphics) repository - the same collection the
system assets were rebuilt from.
