#!/usr/bin/env python3
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Turns an image's alpha into SVG outlines.

Drawing a glyph from its alpha mask by eye gets the idea right and the shape
wrong - a paperclip comes out an oval, a person comes out a blob. This reads
the edge out of the image instead.

The edge is not where the pixels are, it is where the coverage crosses a half:
an antialiased pixel at 0.37 says the true edge runs 37% of the way into it.
Marching squares at that level recovers the outline to a fraction of a pixel,
so a 32px glyph yields a contour that is still smooth at 4x. Douglas-Peucker
then drops the points that lie on a line anyway, and the corners that survive
are rounded off, because a shape drawn with a brush has no sharp corners.

    python3 graphics/trace.py IMAGE [--frame N] [--height H] [--tolerance T]

Prints the path data. The caller decides what to do with it.
"""

import argparse
import math
import sys

from PIL import Image


def alpha_field(image, x0, y0, width, height):
    """Alpha as a float grid with a zero border, so a shape touching the edge still closes."""
    px = image.load()
    grid = [[0.0] * (width + 2) for _ in range(height + 2)]
    for y in range(height):
        for x in range(width):
            grid[y + 1][x + 1] = px[x0 + x, y0 + y][3] / 255.0
    return grid


def plateau(grid):
    """The alpha the glyph settles at, so the trace level can be half of it.

    Not a percentile of everything with ink in it: these glyphs carry a soft shadow, and its
    many faint pixels drag a percentile down until the trace level sits inside the shadow
    rather than at the glyph's edge - which is what merged the two figures of the buddies icon
    into one blob. Otsu's threshold splits the two populations instead, and the glyph's own
    level is read from the pixels above it.
    """
    values = sorted(v for row in grid for v in row if v > 0.05)
    if not values:
        return 1.0
    counts = [0] * 64
    for v in values:
        counts[min(63, int(v * 64))] += 1
    total = len(values)
    best, cut = -1.0, 32
    running = 0
    weighted = 0.0
    overall = sum(i * c for i, c in enumerate(counts))
    for i, c in enumerate(counts):
        running += c
        if running == 0 or running == total:
            continue
        weighted += i * c
        m1 = weighted / running
        m2 = (overall - weighted) / (total - running)
        between = running * (total - running) * (m1 - m2) ** 2
        if between > best:
            best, cut = between, i
    floor = cut / 64.0
    glyph = [v for v in values if v >= floor]
    if not glyph:
        return values[int(total * 0.80)]
    glyph.sort()
    return glyph[int(len(glyph) * 0.60)]


def march(grid, level):
    """Marching squares - returns closed contours in image coordinates."""
    height = len(grid) - 1
    width = len(grid[0]) - 1

    def interp(ax, ay, bx, by):
        a, b = grid[ay][ax], grid[by][bx]
        t = 0.5 if abs(b - a) < 1e-9 else (level - a) / (b - a)
        t = max(0.0, min(1.0, t))
        return (ax + (bx - ax) * t - 1, ay + (by - ay) * t - 1)

    segments = {}
    for y in range(height):
        for x in range(width):
            tl = grid[y][x] >= level
            tr = grid[y][x + 1] >= level
            br = grid[y + 1][x + 1] >= level
            bl = grid[y + 1][x] >= level
            case = (tl << 3) | (tr << 2) | (br << 1) | bl
            if case in (0, 15):
                continue
            top = interp(x, y, x + 1, y)
            right = interp(x + 1, y, x + 1, y + 1)
            bottom = interp(x, y + 1, x + 1, y + 1)
            left = interp(x, y, x, y + 1)
            # edges are oriented so the inside stays on the left
            table = {1: [(left, bottom)], 2: [(bottom, right)], 3: [(left, right)],
                     4: [(right, top)], 5: [(left, top), (bottom, right)],
                     6: [(bottom, top)], 7: [(left, top)], 8: [(top, left)],
                     9: [(top, bottom)], 10: [(top, right), (bottom, left)],
                     11: [(top, right)], 12: [(right, left)], 13: [(right, bottom)],
                     14: [(bottom, left)]}
            for a, b in table[case]:
                segments.setdefault(_key(a), []).append((a, b))

    contours = []
    while segments:
        start_key = next(iter(segments))
        a, b = segments[start_key].pop()
        if not segments[start_key]:
            del segments[start_key]
        contour = [a, b]
        while True:
            key = _key(contour[-1])
            if key not in segments:
                break
            nxt = segments[key].pop()
            if not segments[key]:
                del segments[key]
            contour.append(nxt[1])
            if _key(contour[-1]) == _key(contour[0]):
                break
        if len(contour) > 3:
            contours.append(contour)
    return contours


def _key(point):
    return (round(point[0], 4), round(point[1], 4))


def simplify(points, tolerance):
    """Douglas-Peucker."""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    span = math.hypot(dx, dy)
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if span < 1e-9:
            d = math.hypot(px - ax, py - ay)
        else:
            d = abs(dy * px - dx * py + bx * ay - by * ax) / span
        if d > worst:
            worst, index = d, i
    if worst <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def round_corners(points, radius):
    """Replaces each corner with a quadratic, which is what keeps a traced outline from
    looking faceted once it is scaled up."""
    n = len(points)
    out = []
    for i in range(n):
        prev = points[(i - 1) % n]
        here = points[i]
        nxt = points[(i + 1) % n]
        for other, store in ((prev, 'in'), (nxt, 'out')):
            vx, vy = other[0] - here[0], other[1] - here[1]
            length = math.hypot(vx, vy) or 1.0
            cut = min(radius, length / 2)
            point = (here[0] + vx / length * cut, here[1] + vy / length * cut)
            if store == 'in':
                entry = point
            else:
                exit_point = point
        out.append((entry, here, exit_point))
    parts = ['M%.2f,%.2f' % out[0][0]]
    for i in range(n):
        entry, corner, exit_point = out[i]
        parts.append('L%.2f,%.2f' % entry)
        parts.append('Q%.2f,%.2f %.2f,%.2f' % (corner[0], corner[1], exit_point[0], exit_point[1]))
    parts.append('Z')
    return ' '.join(parts)


def trace(image, x0, y0, width, height, tolerance=0.18, radius=0.45,
          level_fraction=0.5):
    """level_fraction picks where in the coverage the outline is taken.

    Half is the true edge of a solid shape. A glyph whose detail is a gap only a
    pixel wide - the loops of a paperclip - needs a higher one, or the gap sits
    astride the level and gets swallowed.
    """
    grid = alpha_field(image, x0, y0, width, height)
    level = plateau(grid) * level_fraction
    paths = []
    for contour in march(grid, level):
        pts = simplify(contour, tolerance)
        if len(pts) > 2 and _key(pts[0]) == _key(pts[-1]):
            pts = pts[:-1]
        if len(pts) < 3:
            continue
        area = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] -
                       pts[(i + 1) % len(pts)][0] * pts[i][1]
                       for i in range(len(pts)))) / 2
        if area < 1.0:
            continue
        paths.append(round_corners(pts, radius))
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--height', type=int, default=None)
    ap.add_argument('--tolerance', type=float, default=0.18)
    ap.add_argument('--radius', type=float, default=0.45)
    ap.add_argument('--level', type=float, default=0.5)
    args = ap.parse_args()
    im = Image.open(args.image).convert('RGBA')
    h = args.height or im.size[1]
    for d in trace(im, 0, args.frame * h, im.size[0], h, args.tolerance,
                   args.radius, args.level):
        print('<path d="%s"/>' % d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
