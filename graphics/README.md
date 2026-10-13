# Artwork

Open webOS shipped its UI as flat PNGs and the sources were never opened. Those
images are Palm's, so the app's own artwork is drawn from scratch here instead.

`build.py` **is** the source. Re-run it and every asset it covers is rebuilt:

```sh
python3 graphics/build.py           # write app/assets
python3 graphics/build.py --check   # report drift, write nothing (tests/run.sh does this)
python3 graphics/build.py --list    # what is covered so far
```

Needs python3 and Pillow, nothing else. Shapes are drawn at 4x and resampled
down, because Pillow does not antialias.

- `palette.py` — every colour, named after the rule it belongs to. The values
  that also live in the stylesheets (balloon fills and borders, the panel
  gradient) are the same numbers, so a tail that stops matching its balloon is
  a one-line fix in one place.
- `canvas.py` — the drawing surface and the shape helpers.
- `build.py` — one function per asset, registered with the size the stylesheets
  require.

Sizes and sprite layouts are not free: `.sent-received` is a 17x17 window onto a
17x34 sheet, the presence sheet is stepped every 16px by `palm-app.less`, and
`menuitem-arrow-dark` holds a resting and a pressed frame. Each asset declares
its size and `--check` fails if what is on disk no longer matches.

## Still to draw

Covered so far: the chrome, the balloon tails, presence, the list glyphs, the
media-player controls, the delivery receipts, the default avatar and its frame.

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

The house style to follow is the community's redrawn webOS source art in the
[`graphics`](https://github.com/webOS-ports/graphics) repository - the same
collection the system assets were rebuilt from.
