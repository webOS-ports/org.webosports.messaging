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

## Still to draw

Done: the chrome, the balloon tails, presence, the list glyphs, the media
player controls, the delivery receipts, the default avatar and its frame - 20
assets, all SVG.

Not yet, and still Palm's:

| | |
|---|---|
| `attach-{contact,doc,event,location,pdf,ppt,xls}.png` | 41x41 attachment-type badges |
| `menu-icon-{attach,buddies,conversation,conversation-plus,favorites,mic,mic-rec,send,servers}.png` | toolbar icons, two frames each |
| `phone-icon.png`, `video-call-icon.png`, `icon-decline.png` | call controls, two frames each |
| `header-icon-contacts.png` | 32x32 |
| `icon-165x165.png` | the watermark on the empty conversation view |
| `messaging-48x48.png`, `notification-small.png`, `notification-large-messaging.png`, `notification-large-failed.png` | the app and notification marks |
| `loading-bg.png`, `dialogbg.png` | the spinner strip and the dialog border-image |
| `app/icon.png` | the launcher icon |

The last group stays PNG whatever happens: sam and notificationmgr read those
paths out of `appinfo.json` and are not web views. `render.py` is what produces
them from the SVG.

The house style to follow is the community's redrawn webOS source art in the
[`graphics`](https://github.com/webOS-ports/graphics) repository - the same
collection the system assets were rebuilt from.
