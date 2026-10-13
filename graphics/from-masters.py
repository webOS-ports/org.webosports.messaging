#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Derives the pictorial assets from the community's source art.

Some of this app's images are not UI glyphs that can be drawn as a few shapes -
they are the app's own mark and the file-type badges, with gradients, bevels
and shadows. Those already exist, redrawn at 1024px, in the webOS-Ports
`graphics` repository (https://github.com/webOS-ports/graphics), which is where
the system assets were rebuilt from. Taking them from there is both less work
and more consistent than drawing another messaging balloon by hand.

The launcher icon in this repo is already that artwork; everything the app
shows with its own mark is derived from the same master rather than from a
separate drawing.

    python3 graphics/from-masters.py [path-to-graphics-repo]

Needs ImageMagick for the PSDs - Pillow cannot read the 16-bit ones - and
Pillow for the resampling.
"""

import os
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..'))
ASSETS = os.path.join(REPO, 'app', 'assets')

# master psd -> [(asset, size)]
FROM_PSD = {
    'Icon-messaging-1024': [('messaging-48x48.png', 48)],
    'Icon-contacts-1024': [('attach-contact.png', 41),
                           ('header-icon-contacts.png', 32)],
    'Icon-calendar-1024': [('attach-event.png', 41)],
    'Icon-pdf-variant1': [('attach-pdf.png', 41)],
}


def tint(shape, size, top, bottom, outline=None):
    """Fills a silhouette with a vertical gradient, optionally over an edge of its own."""
    mask = shape.resize((size, size), Image.LANCZOS)
    fill = Image.new('RGBA', (size, size))
    px = fill.load()
    for y in range(size):
        t = y / max(1, size - 1)
        row = tuple(int(round(a + (b - a) * t)) for a, b in zip(top, bottom))
        for x in range(size):
            px[x, y] = row + (255,)
    fill.putalpha(mask)
    if outline is None:
        return fill
    grown = shape.resize((size + 2, size + 2), Image.LANCZOS)
    edge = Image.new('RGBA', (size + 2, size + 2), outline + (255,))
    edge.putalpha(grown)
    out = Image.new('RGBA', (size, size))
    out.alpha_composite(edge, (-1, -1))
    out.alpha_composite(fill)
    return out


def flatten(psd, out):
    """ImageMagick reads the merged composite; [0] is that rather than a layer."""
    subprocess.run(['convert', psd + '[0]', '-background', 'none', out],
                   check=True, capture_output=True, timeout=300)


def main():
    graphics = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(REPO), 'graphics')
    psd_dir = os.path.join(graphics, 'psd')
    if not os.path.isdir(psd_dir):
        print('from-masters.py: no psd/ under %s - clone webOS-ports/graphics beside this repo,'
              ' or pass its path' % graphics, file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as work:
        masters = {}
        for stem in FROM_PSD:
            src = os.path.join(psd_dir, stem + '.psd')
            if not os.path.exists(src):
                print('from-masters.py: missing %s' % src, file=sys.stderr)
                return 1
            png = os.path.join(work, stem + '.png')
            flatten(src, png)
            masters[stem] = Image.open(png).convert('RGBA')

        for stem, wanted in FROM_PSD.items():
            master = masters[stem]
            for name, size in wanted:
                master.resize((size, size), Image.LANCZOS).save(os.path.join(ASSETS, name))
                print('%-34s <- %s' % (name, stem))

        # The notification marks are one balloon, not the pair the launcher icon shows. The
        # master keeps that balloon as its own layer, but flat - the gloss is a layer effect
        # ImageMagick does not apply - so fill the silhouette with the gradient the composite
        # actually has.
        balloon = os.path.join(work, 'balloon.png')
        subprocess.run(['convert', os.path.join(psd_dir, 'Icon-messaging-1024.psd[5]'),
                        '-background', 'none', balloon],
                       check=True, capture_output=True, timeout=300)
        shape = Image.open(balloon).convert('RGBA').getchannel('A')

        single = tint(shape, 48, (121, 204, 209), (0, 152, 160))
        single.save(os.path.join(ASSETS, 'notification-large-messaging.png'))
        print('%-34s <- %s layer 5' % ('notification-large-messaging.png', 'Icon-messaging-1024'))

        # The small mark sits on the status bar, so it is the same balloon in white with an
        # edge rather than in colour.
        small = tint(shape, 24, (252, 252, 252), (226, 226, 226), outline=(122, 122, 122))
        small.save(os.path.join(ASSETS, 'notification-small.png'))
        print('%-34s <- %s layer 5' % ('notification-small.png', 'Icon-messaging-1024'))

        # The failed-message mark is that same balloon with the warning badge on it, so it
        # follows whatever the warning glyph is rather than being a third drawing of it.
        icon = single.copy()
        # render.py's own output directory, not the temp one: a snap-confined chromium cannot
        # read /tmp, which is where tempfile puts it.
        render_dir = os.path.join(HERE, 'render')
        subprocess.run([sys.executable, os.path.join(HERE, 'render.py'),
                        '--scale', '1', 'header-warning-icon'],
                       check=True, capture_output=True, timeout=300)
        badge = Image.open(os.path.join(render_dir, 'header-warning-icon.png')).convert('RGBA')
        badge = badge.resize((22, 20), Image.LANCZOS)
        icon.alpha_composite(badge, (26, 28))
        icon.save(os.path.join(ASSETS, 'notification-large-failed.png'))
        print('%-34s <- %s + header-warning-icon.svg' % ('notification-large-failed.png',
                                                         'Icon-messaging-1024'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
