#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Rasterises the app's SVGs.

app/assets holds the artwork as SVG and the app loads it as SVG - WAM is
Chromium, so it is resolution independent on the device and there is nothing to
rebuild for a denser screen. This script is for the cases that are not a web
view: the launcher icon and the notification marks that sam and notificationmgr
read out of appinfo.json, and looking at the artwork off-device.

Chromium is the rasteriser because it is the same engine that will draw these
on the phone, so what comes out here is what the device shows. rsvg-convert
would do as well if it is installed; ImageMagick's own SVG renderer will not -
it drops colour entirely.

    python3 graphics/render.py                 # 1x into graphics/render
    python3 graphics/render.py --scale 4       # 4x, for checking a glyph holds up
    python3 graphics/render.py --out DIR       # somewhere else
    python3 graphics/render.py --rasters       # refresh the PNGs that ship beside the SVG
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SVG_DIR = os.path.normpath(os.path.join(HERE, '..', 'app', 'assets'))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'app', 'assets'))

CHROMIUM = ['chromium', 'chromium-browser', 'google-chrome', '/snap/bin/chromium']

# The app's own artwork is SVG, but four of these marks are handed to sam and notificationmgr
# as file paths out of appinfo.json and DashboardManager, and those are not web views. The SVG
# is still the source; --rasters re-renders these four beside it at the size each is used at.
RASTERS = ('messaging-48x48', 'notification-small',
           'notification-large-messaging', 'notification-large-failed')


def find_chromium():
    for candidate in CHROMIUM:
        found = shutil.which(candidate) or (candidate if os.path.exists(candidate) else None)
        if found:
            return found
    return None


def svg_size(path):
    """The declared width/height - the raster has to come out at exactly that."""
    head = open(path, encoding='utf-8').read(800)
    w = re.search(r'\bwidth="([0-9.]+)"', head)
    h = re.search(r'\bheight="([0-9.]+)"', head)
    if not (w and h):
        raise SystemExit('%s: no width/height on the root element' % path)
    return float(w.group(1)), float(h.group(1))


def staging_root():
    """Where the throwaway page goes.

    Next to the sources, and deliberately not /tmp or a dot-directory. A snap-confined chromium
    can read neither: it is granted non-hidden paths under $HOME and nothing else, and when it
    is refused it writes no screenshot and still exits 0, which looks exactly like success. The
    existence check after the run is there for the same reason.
    """
    return HERE


def render_rsvg(rsvg, svg, out, scale):
    width, height = svg_size(svg)
    subprocess.run([rsvg, '-w', str(int(round(width * scale))),
                    '-h', str(int(round(height * scale))), '-o', out, svg],
                   check=True, capture_output=True, timeout=120)


def render(chromium, svg, out, scale):
    width, height = svg_size(svg)
    with tempfile.TemporaryDirectory(dir=staging_root()) as work:
        shutil.copy(svg, os.path.join(work, 'art.svg'))
        # A bare <img> at the declared size, on nothing. --default-background-color=00000000
        # is what keeps the page transparent rather than white.
        open(os.path.join(work, 'page.html'), 'w', encoding='utf-8').write(
            '<!doctype html><meta charset="utf-8">'
            '<style>html,body{margin:0;padding:0;background:transparent}'
            'img{display:block;width:%gpx;height:%gpx}</style>'
            '<img src="art.svg">' % (width, height))
        # Chromium exits 0 whether or not it wrote the screenshot, so a render that fails
        # silently looks exactly like a successful render of whatever was there before.
        # Removing the target first turns that into the missing-file error below.
        if os.path.exists(out):
            os.unlink(out)
        subprocess.run(
            [chromium, '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
             '--default-background-color=00000000',
             '--force-device-scale-factor=%g' % scale,
             '--window-size=%g,%g' % (width, height),
             '--screenshot=' + os.path.abspath(out),
             'file://' + os.path.join(work, 'page.html')],
            check=True, capture_output=True, timeout=120)
    if not os.path.exists(out):
        raise SystemExit('render.py: chromium wrote no screenshot for %s' % svg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--out', default=None)
    ap.add_argument('--rasters', action='store_true',
                    help='re-render the PNGs that ship beside the SVG, into app/assets')
    ap.add_argument('names', nargs='*', help='stems to render; default is all of them')
    args = ap.parse_args()

    rsvg = shutil.which('rsvg-convert')
    chromium = None if rsvg else find_chromium()
    if not (rsvg or chromium):
        print('render.py: need rsvg-convert or chromium to rasterise', file=sys.stderr)
        return 1

    out_dir = args.out or (ASSETS if args.rasters else os.path.join(HERE, 'render'))
    os.makedirs(out_dir, exist_ok=True)
    stems = args.names or (list(RASTERS) if args.rasters else sorted(
        os.path.splitext(f)[0] for f in os.listdir(SVG_DIR) if f.endswith('.svg')))
    for stem in stems:
        svg = os.path.join(SVG_DIR, stem + '.svg')
        suffix = '' if args.scale == 1 else '@%gx' % args.scale
        png = os.path.join(out_dir, stem + suffix + '.png')
        if rsvg:
            render_rsvg(rsvg, svg, png, args.scale)
        else:
            render(chromium, svg, png, args.scale)
        print('%s -> %s' % (os.path.basename(svg), os.path.relpath(png)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
