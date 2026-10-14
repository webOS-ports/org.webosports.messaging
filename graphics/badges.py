#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Rebuilds the file-type badges from the images they replace.

A badge is a graded tile, two border rings and a letter. Drawing one by eye
means guessing four things at once, and the letter is the worst of them - these
are a serif italic, and an upright slab in its place is the first thing anyone
notices. So measure instead.

Everything here is a vertical gradient, including both rings: attach-ppt's inner
ring runs gold at the top to amber three quarters down and brightens again at the
bottom edge, and fitting it as one colour is visible. The letter is cut at the
midpoint between its own core and the dark halo around it, not at a fixed offset
from the tile - the tile is not what the letter's edge fades into, the halo is,
and thresholding against the tile lost a pixel off every side (attach-ppt's P
came out twelve wide where the original is thirteen).

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


TILE_INSET = 2          # the two border rings


def tile_span(box):
    """The tile proper: inside the dark ring and the bright one."""
    x0, y0, x1, y1 = box
    return x0 + TILE_INSET, y0 + TILE_INSET, x1 - TILE_INSET, y1 - TILE_INSET


def tile_gradient(im, box, slices=8):
    """Median tile colour in horizontal slices, ignoring the letter and the rings.

    Sampled across the tile's own span rather than an inset guess, so the stops land where
    the gradient really is; fitting it four pixels short left the bottom of every badge too
    light.
    """
    px = im.load()
    x0, y0, x1, y1 = tile_span(box)
    inset = 0
    stops = []
    for i in range(slices):
        a = y0 + (y1 - y0 + 1) * i // slices
        b = y0 + (y1 - y0 + 1) * (i + 1) // slices
        samples = []
        for y in range(a, max(a + 1, b)):
            for x in range(x0 + inset, x1 - inset + 1):
                p = px[x, y]
                if p[3] > 200:
                    samples.append(p[:3])
        if not samples:
            stops.append(stops[-1] if stops else (128, 128, 128))
            continue
        samples.sort(key=luma)
        stops.append(samples[len(samples) // 2])     # median: the letter is an outlier
    return stops


def ring_gradient(im, box, inset, slices=8):
    """A border ring, down its left-hand column, as gradient stops.

    Both rings are graded, not flat. attach-ppt's bright ring is #fbde73 at the top, has
    fallen to #e08f40 three quarters down and comes back to #e6a658 on the bottom edge;
    one colour across the whole ring reads as a flat gold box.
    """
    px = im.load()
    x0, y0, x1, y1 = box
    col = x0 + inset
    top, bottom = y0 + inset, y1 - inset
    stops = []
    for i in range(slices):
        a = top + (bottom - top + 1) * i // slices
        b = top + (bottom - top + 1) * (i + 1) // slices
        rows = [px[col, y][:3] for y in range(a, max(a + 1, b)) if px[col, y][3] > 200]
        if not rows:
            stops.append(stops[-1] if stops else (128, 128, 128))
            continue
        rows.sort(key=luma)
        stops.append(rows[len(rows) // 2])
    # the horizontal runs of each ring are its own top and bottom rows, so take them as the
    # end stops rather than letting the column's corners stand in for them
    for y, end in ((top, 0), (bottom, -1)):
        run = [px[x, y][:3] for x in range(x0 + inset + 2, x1 - inset - 1) if px[x, y][3] > 200]
        if run:
            run.sort(key=luma)
            stops[end] = run[len(run) // 2]
    return stops


SUPER = 6


def tile_at(stops, box, y):
    """The tile colour under row y, from the stops that were fitted to it."""
    x0, y0, x1, y1 = tile_span(box)
    span = max(1, y1 - y0 + 1)
    i = min(len(stops) - 1, max(0, int((y - y0) * len(stops) / span)))
    return stops[i]


def letter_halo(im, box, stops):
    """The letters sit in a darker edge - more than half the pixels touching them are darker
    than the tile, and evenly all round rather than to one side, so it is an outline and not a
    drop shadow. Measure its colour the same way as everything else."""
    px = im.load()
    x0, y0, x1, y1 = box
    lit = {(x, y) for y in range(y0 + 5, y1 - 4) for x in range(x0 + 5, x1 - 4)
           if px[x, y][3] > 150 and luma(px[x, y]) > luma(tile_at(stops, box, y)) + 38}
    dark = []
    for x, y in lit:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (x + dx, y + dy)
                if q in lit or not (x0 < q[0] < x1 and y0 < q[1] < y1):
                    continue
                p = px[q[0], q[1]]
                if luma(p) < luma(tile_at(stops, box, q[1])) - 16:
                    dark.append(p[:3])
    if not dark:
        return None
    dark.sort(key=luma)
    return dark[len(dark) // 2]          # median: the corners of the halo are not the halo


def letter_ink(im, box, stops, bands=6):
    """The letter's own colour, in bands down it.

    Not the mean - averaging pulls the antialiased edge in with the solid pixels and the
    letter comes out dull. These are near white at the top and shade toward the tile's hue
    at the foot.
    """
    px = im.load()
    x0, y0, x1, y1 = box
    rows = [[] for _ in range(bands)]
    top, bottom = y0 + 5, y1 - 4
    for y in range(top, bottom):
        local = tile_at(stops, box, y)
        idx = min(bands - 1, max(0, (y - top) * bands // max(1, bottom - top)))
        for x in range(x0 + 5, x1 - 4):
            p = px[x, y]
            if p[3] > 150 and luma(p) > luma(local) + 38:
                rows[idx].append(p[:3])
    out = []
    for band in rows:
        if not band:
            out.append(out[-1] if out else (255, 255, 255))
            continue
        band.sort(key=luma)
        out.append(band[int(len(band) * 0.85)])
    return out


def letter_mask(im, box, stops, ink, halo):
    """Whatever is clearly lighter than the tile it sits on.

    Cut at the midpoint between the letter's own core and the halo around it. A fixed offset
    from the tile is the wrong cut: the letter does not fade into the tile, it fades into its
    halo, and cutting at tile+38 trimmed half a pixel off every edge.

    Resampled up first. A letter twelve pixels tall has more of its form in the antialiasing
    than in the solid pixels, and tracing it at native size broke the W into pieces; at six
    times the size the contour is there to be found, and the path scales back down.
    """
    x0, y0, x1, y1 = box
    big = im.resize((im.size[0] * SUPER, im.size[1] * SUPER), Image.LANCZOS)
    px = big.load()
    mask = Image.new('RGBA', big.size, (0, 0, 0, 0))
    mp = mask.load()
    top, bottom = (y0 + 5) * SUPER, (y1 - 4) * SUPER
    halo_luma = luma(halo) if halo else None
    hit = 0
    for y in range(top, bottom):
        local = tile_at(stops, box, y / SUPER)
        band = ink[min(len(ink) - 1, max(0, (y - top) * len(ink) // max(1, bottom - top)))]
        floor = halo_luma if halo_luma is not None else luma(local)
        cut = (floor + luma(band)) / 2.0
        for x in range((x0 + 5) * SUPER, (x1 - 4) * SUPER):
            p = px[x, y]
            if p[3] > 150 and luma(p) > cut:
                mp[x, y] = (255, 255, 255, 255)
                hit += 1
    return mask if hit else None


def hexc(rgb):
    return '#%02x%02x%02x' % tuple(int(round(v)) for v in rgb)


def grad(ident, stops, y0, y1):
    return ('    <linearGradient id="%s" gradientUnits="userSpaceOnUse" x1="0" y1="%.1f"'
            ' x2="0" y2="%.1f">\n' % (ident, y0, y1)
            + '\n'.join('      <stop offset="%.3f" stop-color="%s"/>'
                         % (i / (len(stops) - 1), hexc(c)) for i, c in enumerate(stops))
            + '\n    </linearGradient>')


HALO_WIDTH = 2.2        # painted under the fill, so half of it lies outside the glyph
RADIUS = 1.8            # the outer corner; each ring inside it is one less
SHADOW_DROP = 1
SHADOW_BLUR = 1.2
SHADOW_OPACITY = 0.4


def build(name, ref):
    im = Image.open(os.path.join(ref, name + '.png')).convert('RGBA')
    w, h = im.size
    box = inner_box(im)
    x0, y0, x1, y1 = box
    tx0, ty0, tx1, ty1 = tile_span(box)
    stops = tile_gradient(im, box)
    outer = ring_gradient(im, box, 0)
    border = ring_gradient(im, box, 1)
    halo = letter_halo(im, box, stops)
    ink = letter_ink(im, box, stops)
    mask = letter_mask(im, box, stops, ink, halo)

    glyph = ''
    letter_grad = ''
    if mask is not None:
        paths = tracer.trace(mask, 0, 0, w * SUPER, h * SUPER, 0.5, 0.6, 0.5)
        if paths:
            edge = ('' if not halo else
                    ' stroke="%s" stroke-width="%.1f" stroke-linejoin="round"'
                    ' paint-order="stroke"' % (hexc(halo), HALO_WIDTH * SUPER))
            letter_grad = ('    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1"'
                           ' gradientUnits="objectBoundingBox">\n'
                           + '\n'.join('      <stop offset="%.3f" stop-color="%s"/>'
                                        % (i / (len(ink) - 1), hexc(c))
                                        for i, c in enumerate(ink))
                           + '\n    </linearGradient>')
            glyph = ('  <g transform="scale(%.6f)" fill="url(#ink)" fill-rule="evenodd">'
                     '<path d="%s"%s/></g>'
                     % (1.0 / SUPER, ' '.join(paths), edge))

    # Three nested rounded rectangles rather than two stroked ones. A stroke puts half its
    # width outside the path, so at the corners the dark ring's arc and the bright ring's run
    # at different radii and bleed into each other: the original's corner pixel is 0.45 covered
    # and a bright cyan, ours came out 0.27 and muddy. Filled rings each own their pixel.
    #
    # The drop shadow is a blur, not a hard offset rectangle. Measured off attach-doc it is the
    # tile dropped one pixel, black at 0.40, sigma 1.2 - that is what puts 0x44 under the bottom
    # edge, 0x22 beside it and 0x0b a pixel further out, all of which a hard rectangle misses.
    def round_rect(inset, fill):
        return ('  <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.2f" fill="%s"/>'
                % (x0 + inset, y0 + inset, x1 - x0 + 1 - 2 * inset, y1 - y0 + 1 - 2 * inset,
                   max(0.0, RADIUS - inset), fill))

    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">
  <defs>
    <filter id="cast" x="-25%%" y="-25%%" width="150%%" height="150%%">
      <feGaussianBlur stdDeviation="%.2f"/>
    </filter>
%s
%s
%s
%s
  </defs>
  <rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.2f" fill="#000000"
        fill-opacity="%.2f" filter="url(#cast)"/>
%s
%s
%s
%s
</svg>
''' % (w, h, w, h, SHADOW_BLUR,
       grad('tile', stops, ty0, ty1 + 1),
       grad('outer', outer, y0, y1 + 1),
       grad('inner', border, y0 + 1, y1),
       letter_grad,
       x0, y0 + SHADOW_DROP, x1 - x0 + 1, y1 - y0 + 1, RADIUS, SHADOW_OPACITY,
       round_rect(0, 'url(#outer)'),
       round_rect(1, 'url(#inner)'),
       round_rect(2, 'url(#tile)'),
       glyph)
    io.open(os.path.join(ASSETS, name + '.svg'), 'w', encoding='utf-8').write(svg)
    return stops[0], stops[-1], border[0], border[-1], ink


if __name__ == '__main__':
    ref = sys.argv[1]
    for n in (sys.argv[2:] or BADGES):
        top, bottom, b0, b1, ink = build(n, ref)
        print('%-14s tile %s -> %s  ring %s -> %s  letter %s -> %s'
              % (n, hexc(top), hexc(bottom), hexc(b0), hexc(b1), ink[0] and hexc(ink[0]),
                 hexc(ink[-1])))
