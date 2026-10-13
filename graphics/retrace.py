#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Rebuilds the two-frame toolbar icons from traced outlines.

The glyph comes out of trace.py, the weight out of the image itself: the
resting frame is black at a little under half, falling off down the glyph, and
each icon's falloff is its own. Both are read from the image being replaced
rather than guessed.
"""

import io
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trace as tracer   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'app', 'assets'))

TEMPLATE = '''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="64" viewBox="0 0 {w} 64">
  <defs>
{gradients}
    <filter id="sdn" x="-35%" y="-35%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.5" flood-color="#000000" flood-opacity="0.26"/>
    </filter>
    <filter id="sup" x="-35%" y="-35%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.6" flood-color="#000000" flood-opacity="0.40"/>
    </filter>
  </defs>
  <g fill="url(#fdn)" fill-rule="evenodd" filter="url(#sdn)">
{glyph0}
  </g>
{mark0}
  <g fill="url(#fup)" fill-rule="evenodd" filter="url(#sup)"
     transform="translate(0,32)">
{glyph1}
  </g>
{mark1}
</svg>
'''


def band(img, y0, y1, slices=5):
    """The glyph's colour and opacity sampled down a frame.

    Two numbers cannot describe these. A glyph's alpha is flat across its face and falls off at
    its edge, so averaging the two lands between them: every icon came out washed out and soft,
    with peaks of 180 where the originals reach 211-249. Take the plateau - the 85th percentile
    - in each of several slices instead, and emit the whole profile as gradient stops.
    """
    px = img.load()
    stops = []
    height = y1 - y0
    for i in range(slices):
        a = y0 + height * i // slices
        b = y0 + height * (i + 1) // slices
        weight = 0.0
        rgb = [0.0, 0.0, 0.0]
        alphas = []
        for y in range(a, b):
            for x in range(img.size[0]):
                r, g, bl, alpha = px[x, y]
                if alpha > 60:          # the glyph, not its shadow
                    rgb[0] += r * alpha; rgb[1] += g * alpha; rgb[2] += bl * alpha
                    weight += alpha
                    alphas.append(alpha)
        if not alphas:
            stops.append(None)
            continue
        alphas.sort()
        colour = '#%02x%02x%02x' % tuple(int(round(c / weight)) for c in rgb)
        stops.append((colour, round(alphas[int(len(alphas) * 0.85)] / 255, 3)))
    for i, v in enumerate(stops):
        if v is None:
            stops[i] = next((w for w in stops[i:] if w), None) or \
                       next((w for w in reversed(stops[:i]) if w), ('#808080', 0.5))
    return stops


def gradient(stops, name):
    # userSpaceOnUse over the 32px frame, not the default objectBoundingBox: on a bounding box
    # every path gets its own copy of the ramp, so a balloon and the plus beside it were shaded
    # as if each were the whole glyph, and a two-part icon came out banded.
    parts = ['    <linearGradient id="%s" gradientUnits="userSpaceOnUse"'
             ' x1="0" y1="0" x2="0" y2="32">' % name]
    for i, (colour, alpha) in enumerate(stops):
        parts.append('      <stop offset="%.3f" stop-color="%s" stop-opacity="%s"/>'
                     % (i / (len(stops) - 1), colour, alpha))
    parts.append('    </linearGradient>')
    return '\n'.join(parts)


def core_fill(im, frame, width, fraction):
    """Colour and opacity of the pixels at or above a coverage level."""
    px = im.load()
    vals = sorted(px[x, frame * 32 + y][3]
                  for y in range(32) for x in range(width) if px[x, frame * 32 + y][3] > 8)
    if not vals:
        return '#808080', 0.5
    cut = vals[int(len(vals) * 0.80)] * fraction
    weight = 0.0
    rgb = [0.0, 0.0, 0.0]
    picked = []
    for y in range(32):
        for x in range(width):
            r, g, b, a = px[x, frame * 32 + y]
            if a >= cut:
                rgb[0] += r * a; rgb[1] += g * a; rgb[2] += b * a
                weight += a
                picked.append(a)
    if not picked:
        return '#808080', 0.5
    picked.sort()
    return ('#%02x%02x%02x' % tuple(int(round(c / weight)) for c in rgb),
            round(picked[int(len(picked) * 0.85)] / 255, 3))


def contrast_mark(im, frame, width):
    """Some glyphs carry a mark in a second colour - the plus on each server bar. The alpha
    trace cannot see it, because it is opaque like the rest of the bar; it shows up as a jump in
    luminance instead."""
    px = im.load()
    inside = [(px[x, frame * 32 + y][3] > 200) for y in range(32) for x in range(width)]
    if not any(inside):
        return '', None
    lum = [0.3 * px[x, frame * 32 + y][0] + 0.6 * px[x, frame * 32 + y][1] +
           0.1 * px[x, frame * 32 + y][2]
           for y in range(32) for x in range(width) if px[x, frame * 32 + y][3] > 200]
    lo, hi = min(lum), max(lum)
    if hi - lo < 90:
        return '', None
    cut = (lo + hi) / 2
    mark = Image.new('RGBA', (width, 32), (0, 0, 0, 0))
    mp = mark.load()
    bright = []
    for y in range(32):
        for x in range(width):
            r, g, b, a = px[x, frame * 32 + y]
            if a > 200 and (0.3 * r + 0.6 * g + 0.1 * b) > cut:
                mp[x, y] = (r, g, b, 255)
                bright.append((r, g, b))
    if len(bright) < 6:
        return '', None
    colour = '#%02x%02x%02x' % tuple(int(round(sum(c[i] for c in bright) / len(bright)))
                                     for i in range(3))
    paths = tracer.trace(mark, 0, 0, width, 32, 0.12, 0.2)
    if not paths:
        return '', None
    body = '    <path d="%s"/>' % ' '.join(paths)
    offset = '' if frame == 0 else ' transform="translate(0,32)"'
    return '  <g fill="%s"%s>\n%s\n  </g>' % (colour, offset, body), colour


def tone_regions(im, frame, width, tolerance, radius, bands=2):
    """Splits a frame into tonal regions and traces each.

    Some of these glyphs are two faces of one object at the same opacity but different
    brightness - the two wings of the folded paper plane either side of its crease, the lit and
    shaded sides of a handset. Tracing the silhouette and filling it with one colour flattens
    them into a single shape, which is why the fold disappeared.
    """
    px = im.load()
    lit = [(x, y) for y in range(32) for x in range(width)
           if px[x, frame * 32 + y][3] > 150]
    if len(lit) < 40:
        return None
    def luma(p):
        return 0.3 * p[0] + 0.6 * p[1] + 0.1 * p[2]
    values = sorted(luma(px[x, frame * 32 + y]) for x, y in lit)
    lo, hi = values[int(len(values) * 0.08)], values[int(len(values) * 0.92)]
    if hi - lo < 70:
        return None                      # one tone; the ordinary path is fine
    out = []
    edges = [lo + (hi - lo) * i / bands for i in range(bands + 1)]
    edges[0], edges[-1] = -1, 1e9
    for i in range(bands):
        mask = Image.new('RGBA', (width, 32), (0, 0, 0, 0))
        mp = mask.load()
        picked = []
        for x, y in lit:
            p = px[x, frame * 32 + y]
            if edges[i] <= luma(p) < edges[i + 1]:
                mp[x, y] = (255, 255, 255, 255)
                picked.append(p)
        if len(picked) < 12:
            continue
        paths = tracer.trace(mask, 0, 0, width, 32, tolerance, radius, 0.5)
        if not paths:
            continue
        weight = sum(p[3] for p in picked)
        colour = '#%02x%02x%02x' % tuple(
            int(round(sum(p[k] * p[3] for p in picked) / weight)) for k in range(3))
        alpha = round(sorted(p[3] for p in picked)[len(picked) // 2] / 255.0, 3)
        out.append('    <g fill="%s" fill-opacity="%s" fill-rule="evenodd">'
                   '<path d="%s"/></g>' % (colour, alpha, ' '.join(paths)))
    return '\n'.join(out) if out else None


def alpha_layers(im, frame, width, tolerance, radius, levels):
    """Rebuilds a frame's alpha surface as nested layers.

    A glyph is not one flat shape: in the original, the buddies' body is lighter than their
    heads and the paper plane's crease is lighter than the wing. Fitting one opacity to the
    whole of it leaves the middle too heavy whichever percentile is used - the mean comes out
    washed, the plateau comes out solid.

    So trace at several coverage levels and paint them outside in. Each layer sits on what is
    already there, so its own opacity is the increment that takes the composite to the alpha
    measured in that band: a2 = (target - a1) / (1 - a1).
    """
    px = im.load()
    vals = sorted(px[x, frame * 32 + y][3]
                  for y in range(32) for x in range(width) if px[x, frame * 32 + y][3] > 8)
    if not vals:
        return ''
    top = vals[int(len(vals) * 0.80)]
    out = []
    composite = 0.0
    for fraction in levels:
        cut = top * fraction
        paths = tracer.trace(im, 0, frame * 32, width, 32, tolerance, radius, fraction)
        if not paths:
            continue
        band = [px[x, frame * 32 + y] for y in range(32) for x in range(width)
                if px[x, frame * 32 + y][3] >= cut]
        if not band:
            continue
        weight = sum(p[3] for p in band)
        colour = '#%02x%02x%02x' % tuple(
            int(round(sum(p[i] * p[3] for p in band) / weight)) for i in range(3))
        target = sorted(p[3] for p in band)[len(band) // 2] / 255.0
        step = 1.0 if composite >= 0.999 else max(0.0, (target - composite) / (1 - composite))
        if step < 0.02:
            continue
        out.append('    <g fill="%s" fill-opacity="%.3f" fill-rule="evenodd">'
                   '<path d="%s"/></g>' % (colour, min(1.0, step), ' '.join(paths)))
        composite = composite + step * (1 - composite)
    return '\n'.join(out)


def rebuild(name, rest=None, press=None, tolerance=0.16, radius=0.4, ref=None,
            level=0.5, inner=None, levels=None, tones=None):
    src = os.path.join(ref, name + '.png')
    im = Image.open(src).convert('RGBA')
    width = im.size[0]
    glyphs = []
    marks = []
    for frame in (0, 1):
        if tones:
            body = tone_regions(im, frame, width, tolerance, radius, tones)
            if body:
                glyphs.append(body)
                marks.append('')
                continue
        if levels:
            glyphs.append(alpha_layers(im, frame, width, tolerance, radius, levels))
            marks.append(contrast_mark(im, frame, width)[0])
            continue
        paths = tracer.trace(im, 0, frame * 32, width, 32, tolerance, radius, level)
        # One path, not one per contour: even-odd subtracts a hole from the shape it sits in,
        # and it only does that within a single path. Emitted separately, the loops of the
        # paperclip were traced correctly and then painted over by the body around them.
        body = '    <path d="%s"/>' % ' '.join(paths) if paths else ''
        if inner:
            # Some of these are a light fill inside dark edges - a paperclip, the server bars,
            # the decline X. One outline turns that into a solid blob, so trace the denser
            # core as well and lay it over the silhouette in its own colour.
            core = tracer.trace(im, 0, frame * 32, width, 32, tolerance, radius, inner)
            colour, alpha = core_fill(im, frame, width, inner)
            if core:
                body += ('\n    <g fill="%s" fill-opacity="%s">'
                         '<path d="%s"/></g>' % (colour, alpha, ' '.join(core)))
        glyphs.append(body)
        marks.append(contrast_mark(im, frame, width)[0])
    dn = band(im, 0, 32)
    up = band(im, 32, 64)
    io.open(os.path.join(ASSETS, name + '.svg'), 'w', encoding='utf-8').write(
        TEMPLATE.format(w=width, glyph0=glyphs[0], glyph1=glyphs[1],
                        gradients=('' if (levels or tones) else
                                   gradient(dn, 'fdn') + '\n' + gradient(up, 'fup')),
                        fdn='' if (levels or tones) else ' fill="url(#fdn)"',
                        fup='' if (levels or tones) else ' fill="url(#fup)"',
                        mark0=marks[0], mark1=marks[1]))
    return len(glyphs[0].splitlines()), len(glyphs[1].splitlines())


if __name__ == '__main__':
    ref = sys.argv[1]
    colours = {}   # every colour is measured off the image now
    names = sys.argv[2:] or [f[:-4] for f in sorted(os.listdir(ASSETS))
                             if f.endswith('.svg') and (f.startswith('menu-icon-') or
                             f[:-4] in ('phone-icon', 'video-call-icon', 'icon-decline'))]
    for n in names:
        rest, press = colours.get(n, (None, None))
        a, b = rebuild(n, rest, press, ref=ref)
        print('%-34s %d + %d contours' % (n, a, b))
