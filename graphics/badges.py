#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Rebuilds the file-type badges from the images they replace.

A badge is a graded tile, a border, an inner bevel and a letter. Drawing one by
eye means guessing four things at once, and the letter is the worst of them -
these are a serif italic, and an upright slab in its place is the first thing
anyone notices. So measure instead: the gradient off the tile row by row, the
border off its edge, and the letter traced out of whatever is lighter than the
tile behind it.

    python3 graphics/badges.py REFDIR [name...]
"""

import io
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trace as tracer   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'app', 'assets'))
BADGES = ('attach-doc', 'attach-ppt', 'attach-xls')


def luma(p):
    return 0.3 * p[0] + 0.6 * p[1] + 0.1 * p[2]


def inner_box(im):
    """The tile, inside its border and its drop shadow."""
    px = im.load()
    w, h = im.size
    cols = [x for x in range(w) if any(px[x, y][3] > 200 for y in range(h))]
    rows = [y for y in range(h) if any(px[x, y][3] > 200 for x in range(w))]
    return cols[0], rows[0], cols[-1], rows[-1]


def tile_gradient(im, box, slices=6):
    """Median tile colour in horizontal slices, ignoring the letter and the edges."""
    px = im.load()
    x0, y0, x1, y1 = box
    inset = 4
    stops = []
    for i in range(slices):
        a = y0 + inset + (y1 - y0 - 2 * inset) * i // slices
        b = y0 + inset + (y1 - y0 - 2 * inset) * (i + 1) // slices
        samples = []
        for y in range(a, max(a + 1, b)):
            for x in range(x0 + inset, x1 - inset):
                p = px[x, y]
                if p[3] > 200:
                    samples.append(p[:3])
        if not samples:
            stops.append(stops[-1] if stops else (128, 128, 128))
            continue
        samples.sort(key=luma)
        stops.append(samples[len(samples) // 2])     # median: the letter is an outlier
    return stops


def edge_colour(im, box):
    """The border, one pixel inside the outline.

    The outermost ring is the drop shadow, and taking the median across it returned a muddy
    dark edge where attach-doc actually has a bright cyan one. Sample the ring inside it and
    take the most common colour, which is the border itself rather than its corners.
    """
    px = im.load()
    x0, y0, x1, y1 = box
    inset = 1
    ring = ([px[x, y0 + inset][:3] for x in range(x0 + 2, x1 - 1)] +
            [px[x, y1 - inset][:3] for x in range(x0 + 2, x1 - 1)] +
            [px[x0 + inset, y][:3] for y in range(y0 + 2, y1 - 1)] +
            [px[x1 - inset, y][:3] for y in range(y0 + 2, y1 - 1)])
    import collections
    return collections.Counter(ring).most_common(1)[0][0]


SUPER = 6


def outer_edge(im, box):
    """The dark line the bright border sits inside."""
    import collections
    px = im.load()
    x0, y0, x1, y1 = box
    ring = ([px[x, y0][:3] for x in range(x0 + 2, x1 - 1)] +
            [px[x0, y][:3] for y in range(y0 + 2, y1 - 1)])
    return collections.Counter(ring).most_common(1)[0][0]


def letter_halo(im, box, stops):
    """The letters sit in a darker edge - more than half the pixels touching them are darker
    than the tile, and evenly all round rather than to one side, so it is an outline and not a
    drop shadow. Measure its colour the same way as everything else."""
    px = im.load()
    x0, y0, x1, y1 = box
    span = max(1, y1 - y0)

    def local(y):
        return stops[min(len(stops) - 1, (y - y0) * len(stops) // span)]

    lit = {(x, y) for y in range(y0 + 2, y1 - 1) for x in range(x0 + 2, x1 - 1)
           if px[x, y][3] > 150 and luma(px[x, y]) > luma(local(y)) + 38}
    dark = []
    for x, y in lit:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (x + dx, y + dy)
                if q in lit or not (x0 < q[0] < x1 and y0 < q[1] < y1):
                    continue
                p = px[q[0], q[1]]
                if luma(p) < luma(local(q[1])) - 16:
                    dark.append(p[:3])
    if not dark:
        return None
    return '#%02x%02x%02x' % tuple(
        int(round(sum(c[i] for c in dark) / len(dark))) for i in range(3))


def letter_mask(im, box, stops):
    """Whatever is clearly lighter than the tile it sits on.

    Resampled up first. A letter twelve pixels tall has more of its form in the antialiasing
    than in the solid pixels, and tracing it at native size broke the W into pieces; at six
    times the size the contour is there to be found, and the path scales back down.
    """
    x0, y0, x1, y1 = box
    big = im.resize((im.size[0] * SUPER, im.size[1] * SUPER), Image.LANCZOS)
    px = big.load()
    mask = Image.new('RGBA', big.size, (0, 0, 0, 0))
    mp = mask.load()
    span = max(1, (y1 - y0) * SUPER)
    picked = []
    for y in range((y0 + 2) * SUPER, (y1 - 1) * SUPER):
        local = stops[min(len(stops) - 1, (y - y0 * SUPER) * len(stops) // span)]
        for x in range((x0 + 2) * SUPER, (x1 - 1) * SUPER):
            p = px[x, y]
            if p[3] > 150 and luma(p) > luma(local) + 38:
                mp[x, y] = (255, 255, 255, 255)
                picked.append(p[:3])
    if not picked:
        return None, '#ffffff'
    colour = '#%02x%02x%02x' % tuple(
        int(round(sum(c[i] for c in picked) / len(picked))) for i in range(3))
    return mask, colour


def hexc(rgb):
    return '#%02x%02x%02x' % tuple(int(round(v)) for v in rgb)


def build(name, ref):
    im = Image.open(os.path.join(ref, name + '.png')).convert('RGBA')
    w, h = im.size
    box = inner_box(im)
    stops = tile_gradient(im, box)
    border = edge_colour(im, box)
    mask, ink = letter_mask(im, box, stops)
    halo = letter_halo(im, box, stops)
    outer = outer_edge(im, box)
    glyph = ''
    if mask is not None:
        paths = tracer.trace(mask, 0, 0, w * SUPER, h * SUPER, 0.5, 1.2, 0.5)
        if paths:
            edge = ('' if not halo else
                    ' stroke="%s" stroke-width="%.1f" stroke-linejoin="round"'
                    ' paint-order="stroke"' % (halo, 1.15 * SUPER))
            glyph = ('  <g transform="scale(%.6f)" fill="%s" fill-rule="evenodd">'
                     '<path d="%s"%s/></g>'
                     % (1.0 / SUPER, ink, ' '.join(paths), edge))
    x0, y0, x1, y1 = box
    grad = '\n'.join('      <stop offset="%.3f" stop-color="%s"/>' % (i / (len(stops) - 1), hexc(c))
                     for i, c in enumerate(stops))
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
%s
    </linearGradient>
  </defs>
  <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="1.2" fill="#000000" fill-opacity="0.20"/>
  <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="1.2" fill="url(#tile)"
        stroke="%s" stroke-width="1"/>
  <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="0.8" fill="none"
        stroke="%s" stroke-width="1"/>
%s
</svg>
''' % (w, h, w, h, grad,
       x0 + 1.4, y0 + 1.6, x1 - x0, y1 - y0,
       x0 + 0.5, y0 + 0.5, x1 - x0 - 1.0, y1 - y0 - 1.0, hexc(outer),
       x0 + 1.5, y0 + 1.5, x1 - x0 - 3.0, y1 - y0 - 3.0, hexc(border),
       glyph)
    io.open(os.path.join(ASSETS, name + '.svg'), 'w', encoding='utf-8').write(svg)
    return stops[0], stops[-1], border, ink


if __name__ == '__main__':
    ref = sys.argv[1]
    for n in (sys.argv[2:] or BADGES):
        top, bottom, border, ink = build(n, ref)
        print('%-14s tile %s -> %s  border %s  letter %s'
              % (n, hexc(top), hexc(bottom), hexc(border), ink))
