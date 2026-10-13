#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Draws the app's artwork into app/assets.

Open webOS shipped its UI as flat PNGs and never opened the sources, and those
images are Palm's. These are drawn from scratch instead. The script IS the
source: re-run it and every asset is rebuilt, and a change to a shape is a
readable diff rather than a new binary.

    python3 graphics/build.py            # write app/assets
    python3 graphics/build.py --check    # report what would change, write nothing
    python3 graphics/build.py --list     # what this script covers so far

Sizes and sprite layouts are fixed by the stylesheets - .sent-received is a
17x17 window onto a 17x34 sheet, the presence sheet is stepped every 16px by
palm-app.less - so each asset declares its size and the frames it holds.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from canvas import Canvas            # noqa: E402
import palette as p                  # noqa: E402

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'assets')
REGISTRY = []


def asset(name, width, height, mode='RGBA'):
    """Registers a drawing function as the source for one file in app/assets."""
    def wrap(fn):
        REGISTRY.append((name, width, height, mode, fn))
        return fn
    return wrap


# -- chrome --------------------------------------------------------------------------------

@asset('defaultview-panel-tile.png', 1, 528, mode='RGB')
def panel_tile(c):
    """The list background: a long, barely-there ramp the panels sit on."""
    c.vertical_gradient(p.PANEL_TOP, p.PANEL_BOTTOM)


@asset('light_chrome_drop_shadow_header.png', 1, 3)
def header_shadow(c):
    c.alpha_ramp(p.CHROME_SHADOW, [134, 74, 25])


@asset('light_chrome_drop_shadow_footer.png', 1, 3)
def footer_shadow(c):
    c.alpha_ramp(p.CHROME_SHADOW, [9, 28, 56])


# -- chat balloon tails --------------------------------------------------------------------
#
# 8x14, hung off the side of a balloon at top: 18px. The fill and the edge are the balloon's
# own, so the tail reads as part of it rather than as a separate shape.

def _tail(c, colours, pointing_left):
    fill, edge = colours
    if pointing_left:
        points = [(8, 0), (0, 7), (8, 14)]
    else:
        points = [(0, 0), (8, 7), (0, 14)]
    c.polygon(points, fill=fill + (255,))
    c.line([points[0], points[1], points[2]], fill=edge + (255,), width=1)


@asset('chat-balloon-received-shape.png', 8, 14)
def tail_received(c):
    _tail(c, p.BALLOON_RECEIVED, True)


@asset('chat-balloon-received-error-shape.png', 8, 14)
def tail_received_error(c):
    _tail(c, p.BALLOON_ERROR, True)


@asset('chat-balloon-sent-shape.png', 8, 14)
def tail_sent(c):
    _tail(c, p.BALLOON_SENT, False)


@asset('chat-balloon-error-shape.png', 8, 14)
def tail_error(c):
    _tail(c, p.BALLOON_ERROR, False)


# -- presence ------------------------------------------------------------------------------

@asset('online-status.png', 16, 96)
def presence_sheet(c):
    """Six 16px frames, stepped by palm-app.less: available, available-partial, away,
    away-partial, invisible, offline."""
    frames = [
        (p.PRESENCE_AVAILABLE, False),
        (p.PRESENCE_PARTIAL, False),
        (p.PRESENCE_AWAY, False),
        (p.PRESENCE_AWAY, True),
        (p.PRESENCE_INVISIBLE, True),
        (p.PRESENCE_OFFLINE, True),
    ]
    for i, (colour, hollow) in enumerate(frames):
        cy = i * 16 + 8
        c.dot(8, cy, 6.5, fill=p.PRESENCE_RIM + (255,))
        if hollow:
            c.dot(8, cy, 5.0, fill=colour + (255,))
            c.dot(8, cy, 2.6, fill=(255, 255, 255, 255))
        else:
            c.dot(8, cy, 5.0, fill=colour + (255,))


# -- list glyphs ---------------------------------------------------------------------------

@asset('incoming-outgoing.png', 17, 34)
def direction_sheet(c):
    """Two 17px frames: incoming on top, outgoing below (.message-outgoing steps to bottom).
    A bar with a head. The platform's own direction is kept: an arriving message points right,
    into the list, and a sent one points left, away from it. Light on purpose - it sits beside
    the summary text on every row and should not compete with it."""
    ink = p.ARROW + (p.ARROW_ALPHA,)
    for i, outgoing in enumerate((False, True)):
        top = i * 17
        if outgoing:
            c.rect(7, top + 7, 17, top + 11, fill=ink)
            c.polygon([(8, top + 3), (0.5, top + 9), (8, top + 15)], fill=ink)
        else:
            c.rect(0, top + 7, 10, top + 11, fill=ink)
            c.polygon([(9, top + 3), (16.5, top + 9), (9, top + 15)], fill=ink)


@asset('list-unread.png', 25, 24)
def unread_badge(c):
    """The disc an unread count is drawn over. A scrim rather than a colour: the row behind it
    varies, and .server-unread swaps in a flat grey of its own for the counts that run long."""
    c.dot(12.5, 12, 11.5, fill=p.UNREAD + (p.UNREAD_ALPHA,))


@asset('favorites-star-blue.png', 24, 24)
def favorite_star(c):
    import math
    points = []
    for i in range(10):
        angle = math.pi / 2 + i * math.pi / 5
        r = 11.0 if i % 2 == 0 else 4.6
        points.append((12 + r * math.cos(angle), 12 - r * math.sin(angle)))
    c.polygon(points, fill=p.FAVORITE + (255,))


@asset('search-input.png', 20, 20)
def search_glyph(c):
    c.dot(8.0, 8.0, 5.8, outline=p.INK_LIGHT + (255,), width=2.2)
    c.line([(12.2, 12.2), (18.0, 18.0)], fill=p.INK_LIGHT + (255,), width=2.8)


@asset('menuitem-arrow-dark.png', 24, 48)
def menu_arrow(c):
    """Two 24px frames: closed on top, open below. A menu item that can expand points right at
    its submenu and turns to point down once it is showing, so the two frames are not the same
    glyph in two shades - they are two different directions."""
    ink = (0, 0, 0, 176)
    c.polygon([(9, 6), (17, 11.5), (9, 17)], fill=ink)            # closed: points right
    c.polygon([(6, 30), (17.5, 30), (11.75, 38)], fill=ink)       # open: points down


# -- inline media player -------------------------------------------------------------------

@asset('mini-player-icon-play.png', 32, 32)
def play_glyph(c):
    c.polygon([(11, 8), (24, 16), (11, 24)], fill=(255, 255, 255, 235))


@asset('mini-player-icon-pause.png', 32, 32)
def pause_glyph(c):
    c.rect(10, 8, 15, 24, fill=(255, 255, 255, 235))
    c.rect(18, 8, 23, 24, fill=(255, 255, 255, 235))


# -- delivery receipts ---------------------------------------------------------------------

def _tick(c, x, colour):
    c.line([(x, 12), (x + 6, 18), (x + 16, 4)], fill=colour + (255,), width=3)


@asset('msg-delivered.png', 31, 23)
def delivered(c):
    _tick(c, 7, p.RECEIPT)


@asset('msg-read.png', 45, 23)
def read(c):
    _tick(c, 7, p.RECEIPT)
    _tick(c, 21, p.RECEIPT)


# -- warnings and avatars ------------------------------------------------------------------

@asset('header-warning-icon.png', 21, 19)
def warning(c):
    c.polygon([(10.5, 1), (20, 18), (1, 18)], fill=p.WARNING + (255,))
    c.line([(10.5, 1), (20, 18), (1, 18), (10.5, 1)], fill=p.WARNING_EDGE + (255,), width=1)
    c.rect(9.6, 6.5, 11.4, 12.5, fill=(255, 255, 255, 255))
    c.dot(10.5, 15, 1.1, fill=(255, 255, 255, 255))


@asset('list-avatar-default.png', 50, 50, mode='RGB')
def default_avatar(c):
    """The silhouette shown for a person with no photo."""
    c.rect(0, 0, 50, 50, fill=p.AVATAR_BG + (255,))
    c.dot(25, 18, 9, fill=p.AVATAR_FG + (255,))
    c.ellipse(8, 30, 42, 64, fill=p.AVATAR_FG + (255,))


@asset('list-view-avatar-frame.png', 52, 52)
def avatar_frame(c):
    """A 1px frame drawn over the 50px avatar it surrounds."""
    c.rounded(0, 0, 52, 52, 4, outline=p.FRAME_EDGE + (120,), width=1)
    c.rounded(1, 1, 51, 51, 3, outline=p.FRAME + (255,), width=1)


# -- driver --------------------------------------------------------------------------------

def build(check_only=False):
    changed, written = [], 0
    for name, width, height, mode, fn in REGISTRY:
        c = Canvas(width, height)
        fn(c)
        image = c.finish()
        if mode == 'RGB':
            flat = image.convert('RGBA')
            from PIL import Image
            backdrop = Image.new('RGBA', flat.size, (255, 255, 255, 255))
            image = Image.alpha_composite(backdrop, flat).convert('RGB')
        path = os.path.normpath(os.path.join(ASSETS, name))
        if check_only:
            if not os.path.exists(path):
                changed.append(name + ' (missing)')
                continue
            from PIL import Image
            existing = Image.open(path)
            if existing.size != (width, height):
                changed.append('%s (%dx%d, want %dx%d)' %
                               ((name,) + existing.size + (width, height)))
            elif existing.convert('RGBA').tobytes() != image.convert('RGBA').tobytes():
                changed.append(name + ' (differs)')
        else:
            image.save(path)
            written += 1
    if check_only:
        for line in changed:
            print('CHANGED ' + line)
        print('%d of %d assets differ' % (len(changed), len(REGISTRY)))
        return 1 if changed else 0
    print('wrote %d assets to app/assets' % written)
    return 0


if __name__ == '__main__':
    if '--list' in sys.argv:
        for name, w, h, mode, _ in REGISTRY:
            print('%-40s %dx%-4d %s' % (name, w, h, mode))
        print('%d assets' % len(REGISTRY))
        sys.exit(0)
    sys.exit(build(check_only='--check' in sys.argv))
