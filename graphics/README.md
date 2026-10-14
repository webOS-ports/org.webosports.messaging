# Artwork

Open webOS shipped its UI as flat PNGs and the sources were never opened. Those
images are Palm's, so the app's artwork is being redrawn.

It ships as **SVG**, in `app/assets`, and the app loads it as SVG. WAM is
Chromium, so there is no density to build for and nothing to rebuild for a
denser screen - a glyph is as crisp at 4x as at 1x. The SVG *is* the source;
there is no raster step in the build.

## Tools

```sh
python3 graphics/render.py            # rasterise into graphics/render, for looking at
python3 graphics/render.py --scale 4  # ... at 4x, to check a glyph holds up
python3 graphics/compare.py REFDIR    # measure the renders against the originals
python3 graphics/compare.py REFDIR --mask NAME   # one asset's alpha mask, as text
```

`render.py` uses `rsvg-convert` when it is installed and headless Chromium
otherwise - the same engine the phone draws with. ImageMagick's own SVG
renderer will not do: it drops colour entirely. A snap-confined Chromium can
read neither `/tmp` nor a dot-directory, and when it is refused it writes no
screenshot and still exits 0, so `render.py` stages beside the sources and
checks the file afterwards.

`REFDIR` holds the images being replaced. They are not in the tree - recover
them with `git show dc8450b^:app/assets/<name>`.

## Drawing to match

Eyeballing a contact sheet is how a glyph ends up the right idea at the wrong
weight, which is what happened to the first attempt at these: a scrim drawn as a
solid colour, an open/closed arrow drawn as two shades of the same chevron, a
pause button at half the size. `compare.py` prints where the ink sits, how much
of it there is and how far the two are apart per pixel, and an alpha mask is
usually enough to read a shape off. Work from those numbers, not from a
thumbnail.

Sizes and sprite layouts are not free: `.sent-received` is a 17x17 window onto a
17x34 sheet, the presence sheet is stepped every 16px by `palm-app.less`, and
`menuitem-arrow-dark` holds a closed and an open frame. The root `width` and
`height` have to stay exactly what the stylesheet expects.

## Where it stands

Everything the app loads through a web view is SVG and drawn here - 39 files.
Four marks stay PNG whatever happens, because sam and notificationmgr read those
paths out of `appinfo.json` and are not web views: `messaging-48x48`,
`notification-small`, `notification-large-messaging`, `notification-large-failed`,
plus `attach-contact`, `attach-event`, `attach-pdf`, `header-icon-contacts` and
`app/icon.png`, which come off the community masters through `from-masters.py`.
`render.py` is what produces the rasters from the SVG.

Mean per-pixel distance from the art each one replaces, worst first, out of 255:

| | |
|---|---|
| 19-34 | `attach-location` 33, `menu-icon-attach` 27, `msg-read` 26, `search-input` 23, `phone-icon` 22, `icon-decline` 20, `menu-icon-buddies` 20, `menu-icon-conversation-plus` 20, `video-call-icon` 20, `menu-icon-servers` 19 |
| 10-18 | `icon-165x165` 16, `menu-icon-conversation` 16, `menu-icon-send` 16, `favorites-star-blue` 14, `menu-icon-favorites` 13, `menu-icon-mic-rec` 13, `list-unread` 12, `menu-icon-mic` 12, `msg-delivered` 21, `header-warning-icon` 10 |
| under 10 | `online-status` 9.6, `menuitem-arrow-dark` 8.2, `chat-balloon-error-shape` 7.9, `incoming-outgoing` 7.9, `chat-balloon-received-error-shape` 7.8, `dialogbg` 7.1, `list-view-avatar-frame` 5.4, `chat-balloon-received-shape` 4.0, `attach-doc` 3.7, `mini-player-icon-play` 3.2, `attach-ppt` 3.1, `attach-xls` 2.6, `chat-balloon-sent-shape` 2.4, `loading-bg` 1.9, `mini-player-icon-pause` 1.9, `list-avatar-default` 1.5, `defaultview-panel-tile` 0.8, the two chrome shadows 0.3 |

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

What is still visibly off, and why: `menu-icon-send`'s upper fold,
`menu-icon-attach`'s wire clip and `menu-icon-buddies`' shoulders are one- and
two-pixel separations that survive only in the antialiasing of a 32px bitmap.
Deriving them from the bitmap cannot recover them - `menu-icon-conversation-plus`
proved that, where a 2px cross traced as a four-pointed star at every tolerance
and had to be authored from measurement instead. These three want the same
treatment.

The house style to follow is the community's redrawn webOS source art in the
[`graphics`](https://github.com/webOS-ports/graphics) repository - the same
collection the system assets were rebuilt from.
