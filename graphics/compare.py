#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Measures a redrawn asset against the one it replaces.

Eyeballing a contact sheet is how a glyph ends up the right idea at the wrong
weight. This prints numbers instead: where the ink sits, how much of it there
is, how heavy it is, and how far the two are apart pixel for pixel.

    python3 graphics/render.py                         # rasterise into graphics/render
    python3 graphics/compare.py REFDIR [names...]
    python3 graphics/compare.py REFDIR --mask NAME     # the alpha mask, as text

REFDIR holds the originals. They are not in the tree - recover them with
`git show <rev>:app/assets/<name>` from before they were replaced.
"""

import os
import sys
from PIL import Image

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render')


def stats(im):
    im = im.convert('RGBA')
    alpha = im.getchannel('A')
    ink = alpha.point(lambda a: 255 if a > 20 else 0)
    box = ink.getbbox()
    data = im.load()
    total = 0
    weighted = [0.0, 0.0, 0.0]
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = data[x, y]
            total += a
            weighted[0] += r * a
            weighted[1] += g * a
            weighted[2] += b * a
    mean = tuple(int(round(c / total)) for c in weighted) if total else (0, 0, 0)
    return {'size': im.size, 'bbox': box, 'coverage': total / 255.0, 'colour': mean}


def diff(a, b):
    a, b = a.convert('RGBA'), b.convert('RGBA')
    if a.size != b.size:
        return None
    pa, pb = a.load(), b.load()
    worst = 0
    total = 0
    n = a.size[0] * a.size[1]
    for y in range(a.size[1]):
        for x in range(a.size[0]):
            ra, ga, ba, aa = pa[x, y]
            rb, gb, bb, ab = pb[x, y]
            # premultiplied, so a transparent pixel's colour does not count
            d = max(abs(ra * aa - rb * ab), abs(ga * aa - gb * ab),
                    abs(ba * aa - bb * ab), abs(aa - ab) * 255) / 255.0
            worst = max(worst, d)
            total += d
    return worst, total / n


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    ref_dir = sys.argv[1]
    rest = sys.argv[2:]

    if '--mask' in rest:
        name = rest[rest.index('--mask') + 1]
        for label, path in (('original', os.path.join(ref_dir, name)),
                            ('redrawn', os.path.join(ASSETS, name))):
            im = Image.open(path).convert('RGBA')
            print('--- %s %s %dx%d' % (label, name, im.size[0], im.size[1]))
            for y in range(im.size[1]):
                row = ''
                for x in range(im.size[0]):
                    a = im.getpixel((x, y))[3]
                    row += ' ' if a < 30 else ('.' if a < 110 else ('+' if a < 200 else '#'))
                print('%3d %s' % (y, row))
        return 0

    names = rest or sorted(f for f in os.listdir(ref_dir) if f.endswith(('.png', '.jpg')))
    print('%-38s %-18s %-18s %7s %7s %6s %6s' %
          ('asset', 'bbox original', 'bbox redrawn', 'ink.o', 'ink.n', 'worst', 'mean'))
    for name in names:
        ref = os.path.join(ref_dir, name)
        new = os.path.join(ASSETS, name)
        if not (os.path.exists(ref) and os.path.exists(new)):
            continue
        a, b = Image.open(ref), Image.open(new)
        sa, sb = stats(a), stats(b)
        d = diff(a, b)
        print('%-38s %-18s %-18s %7.1f %7.1f %6.1f %6.1f' % (
            name, str(sa['bbox']), str(sb['bbox']), sa['coverage'], sb['coverage'],
            d[0] if d else -1, d[1] if d else -1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
