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

Every image the app ships is now SVG - 47 files. Nothing is a bitmap drawing any
more; `app/icon.png` is the community's launcher artwork and the only PNG left
that is not a render of an SVG in this directory.

Mean per-pixel distance from the Palm art each one replaces, worst first, out
of 255:

| | |
|---|---|
| over 12 | `menu-icon-attach` 27, `icon-165x165` 16, `phone-icon` 15, `menu-icon-send` 14, `menu-icon-buddies` 13, `attach-location` 13 |
| 8-12 | `icon-decline` 12, `video-call-icon` 12, `msg-read` 12, `menu-icon-conversation-plus` 11, `header-warning-icon` 11, `online-status` 10, `menu-icon-favorites` 9.2, `msg-delivered` 8.9, `menu-icon-conversation` 8.6, `menuitem-arrow-dark` 8.2 |
| 4-8 | `incoming-outgoing` 7.9, `chat-balloon-error-shape` 7.9, `chat-balloon-received-error-shape` 7.8, `dialogbg` 7.1, `search-input` 6.0, `menu-icon-mic-rec` 5.8, `menu-icon-mic` 5.5, `list-view-avatar-frame` 5.4, `chat-balloon-received-shape` 4.0 |
| under 4 | `attach-doc` 3.7, `mini-player-icon-play` 3.2, `attach-ppt` 3.1, `list-unread` 2.9, `attach-xls` 2.6, `chat-balloon-sent-shape` 2.4, `mini-player-icon-pause` 1.9, `loading-bg` 1.9, `list-avatar-default` 1.5, `favorites-star-blue` 1.4, `menu-icon-servers` 1.3, `defaultview-panel-tile` 0.8, the two chrome shadows 0.3 |

Eight of them are not measured against Palm's art, because they are not meant to
match it: the app's own mark, the notification marks and the file-type badges
were taken off the community's redrawn 1024px masters, and are now drawn as SVG
instead of resampled from those PSDs. Against the resamples they replace:
`notification-large-messaging` 4.9, `notification-large-failed` 10,
`notification-small` 24, `attach-event` 26, `messaging-48x48` 30, `attach-pdf`
43, `header-icon-contacts` 50, `attach-contact` 52. The balloons are close; the
three badges and the two card stacks are redraws of the same subject in the same
palette rather than copies - simpler at 41px than a Lanczos resample of a 1024px
painting, and unlike that resample they hold up at any size.

`icon-165x165` is counted against a worn stamp it deliberately does not copy:
the rings and legend are drawn clean, and the legend says LuneOS. Everything
else about it is measured - the two ring radii and weights, the legend's baseline
radius and size (from Prelude's own ascender and descender against the original's
ink extent), the 32 degree turn of the legend ring, and both balloons' ellipses
fitted to the original's edge. Rendering it here the way the device will needs
Prelude, which is not a host font: pull it off a device with
`adb pull /usr/share/fonts/Prelude-Medium.ttf` and point fontconfig at it through
`FONTCONFIG_FILE`, or the sheet silently falls back and the legend comes out the
wrong width.

`menu-icon-attach` is the one that resisted. Its wire is four parallel runs
joined by three bends, and the run spacing measures 2.8, 6.4 and 3.1 apart
perpendicular against a wire 2.5 wide - two tight pairs with a gap down the
middle. Several serpentines built to those numbers came out worse than the trace
they would have replaced, so the trace stays and this is still open. The way in
is probably the clip's own construction rather than its cross-section.

The house style to follow is the community's redrawn webOS source art in the
[`graphics`](https://github.com/webOS-ports/graphics) repository - the same
collection the system assets were rebuilt from.
