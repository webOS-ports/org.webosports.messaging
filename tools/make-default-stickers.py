#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
"""
Makes the default stickers (app/assets/stickers) from Noto Emoji's 512px PNGs.

    git clone --depth 1 --branch v2026-09-24-unicode18_0 https://github.com/googlefonts/noto-emoji
    tools/make-default-stickers.py noto-emoji/2D/png/512 app/assets/stickers

The images are Google's, under the Apache License 2.0 (noto-emoji 2D/svg/LICENSE); the notice
goes with them (app/assets/stickers/NOTICE).

A sticker as WhatsApp takes one: a 512x512 WebP with a transparent background, the picture
inside a 16px margin, under 100 KB.
"""
import os
import sys

from PIL import Image

# The ones offered, in the picker's order: faces first, then hands, then the rest.
CODES = [
    "1f602", "1f923", "1f60a", "1f60d", "1f618", "1f609", "1f60e", "1f914",
    "1f605", "1f62d", "1f621", "1f631", "1f973", "1f634", "1f644", "1f917",
    "1f44d", "1f44f", "1f64f", "1f4aa", "1f44b", "2764", "1f525", "1f389",
]
SIZE = 512
MARGIN = 16
MAX_BYTES = 100 * 1024


def sticker(src, dest):
    im = Image.open(src).convert("RGBA")
    box = im.getbbox()
    if box:
        im = im.crop(box)
    room = SIZE - 2 * MARGIN
    scale = min(room / im.width, room / im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    for quality in (90, 80, 70, 60, 50):
        out.save(dest, "WEBP", quality=quality, method=6)
        if os.path.getsize(dest) <= MAX_BYTES:
            return
    raise SystemExit("%s: still over %d bytes" % (dest, MAX_BYTES))


def main(argv):
    if len(argv) != 3:
        raise SystemExit("usage: make-default-stickers.py <noto-emoji/2D/png/512> <out dir>")
    src_dir, out_dir = argv[1], argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for i, code in enumerate(CODES):
        sticker(os.path.join(src_dir, "emoji_u%s.png" % code),
                os.path.join(out_dir, "%02d-emoji-u%s.webp" % (i + 1, code)))


if __name__ == "__main__":
    main(sys.argv)
