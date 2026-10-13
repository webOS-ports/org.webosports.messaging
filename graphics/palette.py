# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
"""Every colour the generated artwork uses, in one place.

The values that also appear in the stylesheets are named after the rule they
belong to, so a change there has an obvious counterpart here: a balloon tail
that does not match the balloon it hangs off is immediately visible.
"""

# Chrome -------------------------------------------------------------------------------------
PANEL_TOP = (249, 249, 249)      # .default-view background, top of the tile
PANEL_BOTTOM = (228, 228, 228)   # ... and the bottom it settles on
CHROME_SHADOW = (132, 132, 132)  # header/footer drop shadow

# Chat balloons - these four pairs are the fill and border in palm-conversation.less ----------
BALLOON_RECEIVED = ((214, 237, 255), (179, 217, 242))
BALLOON_SENT = ((220, 255, 209), (208, 225, 203))
BALLOON_ERROR = ((244, 244, 244), (212, 212, 212))

# Presence -----------------------------------------------------------------------------------
PRESENCE_AVAILABLE = (108, 198, 62)
PRESENCE_PARTIAL = (166, 212, 96)
PRESENCE_AWAY = (230, 138, 60)
PRESENCE_INVISIBLE = (150, 150, 150)
PRESENCE_OFFLINE = (138, 138, 138)
PRESENCE_RIM = (255, 255, 255)

# Glyphs -------------------------------------------------------------------------------------
INK = (90, 90, 90)               # dark glyph on light chrome
INK_LIGHT = (170, 170, 170)      # placeholder/secondary glyph
RECEIPT = (92, 180, 220)         # delivered/read ticks
WARNING = (230, 183, 0)
WARNING_EDGE = (194, 150, 0)
FAVORITE = (143, 187, 223)
UNREAD = (74, 144, 206)
AVATAR_BG = (198, 198, 198)
AVATAR_FG = (238, 238, 238)
FRAME = (255, 255, 255)
FRAME_EDGE = (160, 160, 160)
