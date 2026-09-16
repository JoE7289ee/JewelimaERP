# Copyright (c) 2026, efeone and contributors
"""The Jewelima brand in one place — the palette and the artwork paths.

Everything that prints, exports or paints in brand colours reads from here, so a
colour is changed once rather than hunted through thirty files. The values come
from the brand kit's own swatches (Jewellima_Brand_Kit_01/swatches/palette.json).
"""

# the palette, as the kit names it
EMERALD = "0D2B1E"
FOREST = "1B4332"
GREEN = "2E7D5B"
SAGE = "6F8F7B"
GOLD = "D4AF37"
CHAMPAGNE = "E6C778"
SOFT_GOLD = "F2E6C1"
IVORY = "FAF7EF"
BLACK = "111111"
WHITE = "FFFFFF"

# what the sheets and letters use, by job rather than by colour name
HEAD_FILL = FOREST          # a table's heading band
HEAD_TEXT = WHITE
RULE = GOLD                 # the line under a letterhead
INK = "1F2328"
MUTED = "6B6F76"
ZEBRA = "F5F8F6"            # every other row
FOOT_FILL = SOFT_GOLD       # a totals row
LINE = "D8E3DB"

def hex_(name):
	"""'#0D2B1E' for CSS; openpyxl wants the bare six characters."""
	return "#" + name

# the artwork, served from /assets/jewelima/images/brand/
ASSETS = "/assets/jewelima/images/brand/"
LOGO_SQUARE = ASSETS + "logo-square.svg"    # vector — the login, navbar and favicon mark
EMBLEM_GOLD = ASSETS + "emblem-gold-gradient.svg"   # the apps screen
LOGO_WIDE = ASSETS + "logo-horizontal-black.png"    # print header
LETTERHEAD = ASSETS + "letterhead-header.png"       # full-page letter top
LETTERHEAD_FOOT = ASSETS + "letterhead-footer.png"
