# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""A small drawing surface for the generated artwork.

Pillow's draw operations are not antialiased, so everything is drawn at SCALE
times the final size and resampled down. That is also why the shape helpers take
plain floats: at 4x a half-pixel stroke is two pixels and stays crisp.
"""

from PIL import Image, ImageDraw

SCALE = 4


class Canvas(object):
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.image = Image.new('RGBA', (width * SCALE, height * SCALE), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.image)

    # -- geometry ----------------------------------------------------------------------------

    def _box(self, x0, y0, x1, y1):
        return [x0 * SCALE, y0 * SCALE, x1 * SCALE - 1, y1 * SCALE - 1]

    def _points(self, points):
        return [(x * SCALE, y * SCALE) for x, y in points]

    # -- shapes ------------------------------------------------------------------------------

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.draw.rectangle(self._box(x0, y0, x1, y1), fill=fill, outline=outline,
                            width=int(width * SCALE))

    def rounded(self, x0, y0, x1, y1, radius, fill=None, outline=None, width=1):
        self.draw.rounded_rectangle(self._box(x0, y0, x1, y1), radius=radius * SCALE,
                                    fill=fill, outline=outline, width=int(width * SCALE))

    def ellipse(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.draw.ellipse(self._box(x0, y0, x1, y1), fill=fill, outline=outline,
                          width=int(width * SCALE))

    def polygon(self, points, fill=None, outline=None):
        self.draw.polygon(self._points(points), fill=fill, outline=outline)

    def line(self, points, fill, width=1, joint='curve'):
        self.draw.line(self._points(points), fill=fill, width=max(1, int(width * SCALE)),
                       joint=joint)

    def dot(self, cx, cy, r, fill=None, outline=None, width=1):
        self.ellipse(cx - r, cy - r, cx + r, cy + r, fill=fill, outline=outline, width=width)

    # -- fills -------------------------------------------------------------------------------

    def vertical_gradient(self, top, bottom, y0=0, y1=None):
        """Linear top-to-bottom ramp over [y0, y1), in final-image rows."""
        y1 = self.height if y1 is None else y1
        span = max(1, (y1 - y0) * SCALE - 1)
        for i in range((y1 - y0) * SCALE):
            t = i / span
            colour = tuple(int(round(a + (b - a) * t)) for a, b in zip(top, bottom)) + (255,)
            y = y0 * SCALE + i
            self.draw.line([(0, y), (self.width * SCALE, y)], fill=colour)

    def alpha_ramp(self, colour, alphas):
        """One row per entry, top to bottom - for the 1px chrome shadows."""
        rows = len(alphas)
        assert rows == self.height, 'alpha_ramp needs one alpha per row'
        for y, alpha in enumerate(alphas):
            self.draw.rectangle([0, y * SCALE, self.width * SCALE, (y + 1) * SCALE - 1],
                                fill=colour + (alpha,))

    # -- output ------------------------------------------------------------------------------

    def finish(self):
        return self.image.resize((self.width, self.height), Image.LANCZOS)
