#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Lays the whole set out as original, ours, and the difference between them.

`compare.py` gives the numbers and is what the drawing is done against. This is
the other half: once a glyph measures close, somebody still has to look at it,
and looking at one asset at a time hides the thing a sheet shows immediately -
that a whole family is off the same way. The attachment tiles all missing the
same bevel reads as one problem here and as five unrelated scores there.

Rows are ordered worst first, so the sheet always opens on the work left to do,
and the difference column is amplified three times because a five-count error
is invisible at true scale and is still a real error.

    python3 graphics/render.py                      # rasterise first
    python3 graphics/sheets.py REFDIR OUTDIR        # every asset, 8 to a sheet
    python3 graphics/sheets.py REFDIR OUTDIR NAME.. # only these, in that order
    python3 graphics/sheets.py REFDIR OUTDIR 'menu-icon-attach=still a trace'

REFDIR holds the originals, as for `compare.py`. They are not in the tree -
recover them with `git show dc8450b^:app/assets/<name>`.

CELL sets the target long edge of a magnified cell (default 320). Scaling is
nearest-neighbour at whole multiples only: a sheet is for reading pixels off,
and a smooth resample invents edges that neither drawing has.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

# -I (isolated) keeps the script's own directory off sys.path, and these are
# meant to be run that way, so reach for the sibling module explicitly.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compare import diff as measure           # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..'))
RENDER = os.path.join(HERE, 'render')
BG = (118, 118, 118)        # the toolbar grey most of these sit on
PAPER = (40, 40, 40)
PAD, LAB, PER_SHEET = 10, 34, 8


def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F, FS = font(17), font(13)


def ours(name):
    """Where this asset's current form is: a render, or the shipped bitmap.

    Four marks ship as PNG beside the SVG and the launcher icon is a bitmap at
    the app root, so a sheet that only read graphics/render would miss five.
    """
    for p in (os.path.join(RENDER, name + '.png'),
              os.path.join(REPO, 'app', 'assets', name + '.png'),
              os.path.join(REPO, 'app', name + '.png')):
        if os.path.exists(p):
            return p
    return None


def flat(im):
    """Composite over the grey, so a difference in alpha is visible as one."""
    t = Image.new('RGBA', im.size, BG + (255,))
    t.alpha_composite(im)
    return t.convert('RGB')


def difference(a, b):
    pa, pb = flat(a).load(), flat(b).load()
    qa, qb = a.load(), b.load()
    out = Image.new('RGB', a.size)
    po = out.load()
    for y in range(a.height):
        for x in range(a.width):
            d = max(abs(pa[x, y][i] - pb[x, y][i]) for i in range(3))
            d = max(d, abs(qa[x, y][3] - qb[x, y][3]))
            v = min(255, d * 3)
            po[x, y] = (v, v // 3, v // 3) if v else (24, 24, 24)
    return out


def sheet(rows, path, cell):
    scales = [max(1, min(cell // max(a.width, a.height), 16))
              for _, _, a, _, _ in rows]
    widths = [max(a.width, b.width) * s
              for (_, _, a, b, _), s in zip(rows, scales)]
    heights = [max(a.height, b.height) * s
               for (_, _, a, b, _), s in zip(rows, scales)]

    # A column is at least as wide as its own heading, or the narrow glyphs run
    # 'original' into 'ours'; the sheet is at least as wide as its longest label.
    probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    colmin = int(max(probe.textlength(t, font=FS)
                     for t in ('original', 'ours', 'difference x3')) + 8)
    cols = [max(w, colmin) for w in widths]
    labw = max(probe.textlength(n, font=F) + 14 + probe.textlength(note, font=FS)
               for n, note, _, _, _ in rows)
    width = int(max(max(c * 3 + PAD * 4 for c in cols), labw + PAD * 2))

    out = Image.new('RGB', (width, sum(heights) + len(rows) * (LAB + PAD) + PAD), PAPER)
    dr = ImageDraw.Draw(out)
    y = PAD
    for (name, note, a, b, d), s, w, h in zip(rows, scales, cols, heights):
        dr.text((PAD, y), name, fill=(255, 255, 0), font=F)
        dr.text((PAD + probe.textlength(name, font=F) + 14, y + 3), note,
                fill=(190, 190, 190), font=FS)
        for i, t in enumerate(('original', 'ours', 'difference x3')):
            dr.text((PAD + i * (w + PAD), y + 16), t, fill=(150, 200, 255), font=FS)
        y += LAB
        for i, im in enumerate((flat(a), flat(b), d)):
            out.paste(im.resize((im.width * s, im.height * s), Image.NEAREST),
                      (PAD + i * (w + PAD), y))
        y += h + PAD
    out.save(path)
    print('%s  %dx%d' % (path, out.width, out.height))


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    ref_dir, out_dir = sys.argv[1], sys.argv[2]
    cell = int(os.environ.get('CELL', '320'))
    specs = sys.argv[3:] or [f[:-4] for f in sorted(os.listdir(ref_dir))
                             if f.endswith('.png')]
    ordered = not sys.argv[3:]

    rows = []
    for spec in specs:
        name, _, note = spec.partition('=')
        new = ours(name)
        if not new:
            print('no current form for %s, skipped' % name, file=sys.stderr)
            continue
        a = Image.open(os.path.join(ref_dir, name + '.png')).convert('RGBA')
        b = Image.open(new).convert('RGBA')
        if a.size != b.size:
            print('%s is %s against %s, skipped' % (name, b.size, a.size),
                  file=sys.stderr)
            continue
        mean = measure(a, b)[1]
        label = '%.2f%s' % (mean, '  -  ' + note if note else '')
        rows.append((mean, (name, label, a, b, difference(a, b))))

    if ordered:
        rows.sort(key=lambda r: -r[0])
    rows = [r for _, r in rows]

    os.makedirs(out_dir, exist_ok=True)
    for i in range(0, len(rows), PER_SHEET):
        sheet(rows[i:i + PER_SHEET],
              os.path.join(out_dir, 'sheet-%d.png' % (i // PER_SHEET + 1)), cell)
    return 0


if __name__ == '__main__':
    sys.exit(main())
