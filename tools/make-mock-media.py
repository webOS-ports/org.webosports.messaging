#!/usr/bin/env python3
"""Make the pictures the in-browser mock data (app/src/data/mockDb.js) points at.

  tools/make-mock-media.py            writes app/mock/avatars/*.svg and app/mock/photos/*.jpg

The avatars are initials on a colour, so no made-up person borrows a real face. The photos are
drawn shapes (a sunset pier, a mountain lake), so they carry no one's pictures either. Everything
lands in app/mock, which `enyo pack` copies only into development builds (devAssets).

Needs Python 3 with Pillow for the photos.
"""
import math
import os
import random

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "mock")

# id, initials, background, foreground
AVATARS = [
    ("anna", "AK", "#3f7fb5", "#ffffff"),
    ("ben", "BO", "#d9822b", "#ffffff"),
    ("chi", "CN", "#5a9e57", "#ffffff"),
    ("dora", "DS", "#a8558c", "#ffffff"),
    ("marta", "ML", "#c9a227", "#ffffff"),
    ("sam", "SP", "#4a8c8c", "#ffffff"),
    ("yuki", "YT", "#7a63b0", "#ffffff"),
    ("tomas", "TR", "#b5523f", "#ffffff"),
    ("mum", "M", "#6b8e3a", "#ffffff"),
]

SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" fill="{bg}"/>
  <rect width="128" height="128" fill="url(#g)"/>
  <text x="64" y="64" dy="0.35em" text-anchor="middle" fill="{fg}"
        font-family="Prelude, 'Prelude Medium', sans-serif" font-size="{size}">{text}</text>
</svg>
"""


def write_avatars():
    out = os.path.join(ROOT, "avatars")
    os.makedirs(out, exist_ok=True)
    for name, text, bg, fg in AVATARS:
        size = 56 if len(text) > 1 else 64
        with open(os.path.join(out, name + ".svg"), "w") as f:
            f.write(SVG.format(bg=bg, fg=fg, text=text, size=size))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgradient(draw, w, y0, y1, top, bottom):
    for y in range(y0, y1):
        draw.line([(0, y), (w, y)], fill=lerp(top, bottom, (y - y0) / max(1, y1 - y0 - 1)))


def pier(Image, ImageDraw, ImageFilter):
    w, h = 960, 640
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    horizon = 400
    vgradient(d, w, 0, horizon, (44, 62, 120), (247, 164, 92))
    # sun, softened
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([560, 300, 720, 460], fill=(255, 214, 140))
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    from PIL import ImageChops
    img = ImageChops.screen(img, glow)
    d = ImageDraw.Draw(img)
    d.ellipse([600, 340, 680, 420], fill=(255, 236, 190))
    vgradient(d, w, horizon, h, (214, 128, 86), (40, 52, 92))
    rnd = random.Random(7)
    for _ in range(140):  # glints on the water
        x = 640 + rnd.gauss(0, 70)
        y = rnd.uniform(horizon + 4, h)
        ln = rnd.uniform(6, 30)
        d.line([(x - ln, y), (x + ln, y)], fill=(255, 210, 150), width=2)
    # the pier: a deck running out to the left, on posts
    deck_y = 452
    d.polygon([(0, deck_y - 18), (470, deck_y - 4), (470, deck_y + 4), (0, deck_y + 14)], fill=(30, 26, 36))
    for i in range(12):
        x = 20 + i * 40
        top = deck_y - 16 + i * 1.2
        d.rectangle([x, top, x + 7, top + 70 - i * 3], fill=(30, 26, 36))
    d.line([(0, deck_y - 44), (470, deck_y - 24)], fill=(30, 26, 36), width=4)  # rail
    for i in range(0, 12, 2):
        x = 22 + i * 40
        d.line([(x, deck_y - 44 + i * 1.7), (x, deck_y - 16 + i * 1.2)], fill=(30, 26, 36), width=4)
    # a couple of gulls
    for gx, gy, s in [(250, 150, 1.0), (300, 120, 0.7), (780, 200, 0.8)]:
        d.arc([gx - 18 * s, gy - 8 * s, gx, gy + 8 * s], 200, 340, fill=(40, 36, 52), width=3)
        d.arc([gx, gy - 8 * s, gx + 18 * s, gy + 8 * s], 200, 340, fill=(40, 36, 52), width=3)
    return img


def lake(Image, ImageDraw, ImageFilter):
    w, h = 960, 720
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    horizon = 430
    vgradient(d, w, 0, horizon, (120, 170, 220), (214, 232, 244))
    rnd = random.Random(3)

    def ridge(base, amp, seed, colour, snow=False):
        r = random.Random(seed)
        pts, peaks = [], []
        x = -40
        while x < w + 80:
            y = base - amp * (0.35 + 0.65 * r.random())
            pts.append((x, y))
            peaks.append((x, y))
            x += r.uniform(110, 210)
            pts.append((x, base - amp * 0.2 * r.random()))
            x += r.uniform(60, 140)
        poly = [(-40, horizon)] + pts + [(w + 80, horizon)]
        d.polygon(poly, fill=colour)
        if snow:
            for px, py in peaks:
                d.polygon([(px, py), (px - 34, py + 40), (px - 10, py + 32), (px + 6, py + 44),
                           (px + 30, py + 36)], fill=(244, 248, 252))

    ridge(330, 210, 11, (112, 128, 156), snow=True)
    ridge(400, 120, 5, (70, 98, 92))
    # trees along the shore
    for i in range(70):
        x = rnd.uniform(-10, w + 10)
        th = rnd.uniform(28, 60)
        d.polygon([(x, horizon - th), (x - th * 0.28, horizon + 2), (x + th * 0.28, horizon + 2)],
                  fill=(36, 66, 52))
    sky = img.crop((0, 0, w, horizon))
    refl = sky.transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(3))
    water = Image.new("RGB", refl.size, (40, 86, 110))
    refl = Image.blend(refl, water, 0.45)
    img.paste(refl.crop((0, 0, w, h - horizon)), (0, horizon))
    d = ImageDraw.Draw(img)
    for _ in range(90):  # ripples
        y = rnd.uniform(horizon + 6, h)
        x = rnd.uniform(0, w)
        ln = rnd.uniform(10, 50) * (y - horizon) / (h - horizon)
        d.line([(x - ln, y), (x + ln, y)], fill=(170, 200, 220), width=1)
    # a small red canoe
    cx, cy = 600, 560
    d.polygon([(cx - 70, cy), (cx + 70, cy), (cx + 52, cy + 14), (cx - 52, cy + 14)], fill=(176, 52, 40))
    d.line([(cx - 10, cy - 34), (cx + 26, cy + 24)], fill=(60, 40, 30), width=4)
    d.ellipse([cx - 14, cy - 40, cx + 2, cy - 24], fill=(60, 44, 40))
    d.rectangle([cx - 14, cy - 26, cx + 2, cy], fill=(230, 170, 50))
    return img


def write_photos():
    from PIL import Image, ImageDraw, ImageFilter
    out = os.path.join(ROOT, "photos")
    os.makedirs(out, exist_ok=True)
    pier(Image, ImageDraw, ImageFilter).save(os.path.join(out, "pier.jpg"), quality=82, optimize=True)
    lake(Image, ImageDraw, ImageFilter).save(os.path.join(out, "lake.jpg"), quality=82, optimize=True)


if __name__ == "__main__":
    write_avatars()
    write_photos()
