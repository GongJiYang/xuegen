#!/usr/bin/env python3
"""Build "BearDiagramMono": a half-width font for character diagrams in the Bear skin.

The diagram skill counts Chinese and full-width punctuation as 2 columns and
everything else (ASCII, box drawing U+2500-259F, braille, and the listed arrows
and shapes) as 1 column. Bear renders diagrams in a smooth face, so it needs a
font whose every non-CJK glyph is exactly half an em; Chinese then falls back to
PingFang SC, whose ideographs are a full em.

Source: Iosevka (SIL OFL 1.1) from the @fontsource/iosevka npm package. Iosevka's
default arrows and geometric shapes are full-width (".WWID"); this script points
those code points at Iosevka's own half-width variants (".NWID"), subsets to the
characters diagrams use, and checks that every mapped glyph is 0.5 em.

Usage:
  npm pack @fontsource/iosevka@5.3.0 && tar xzf fontsource-iosevka-5.3.0.tgz
  python3 make-bear-diagram-font.py package/files/iosevka-latin-400-normal.woff2 \
      ../src/renderer/skins/bear/assets/bear-diagram-mono.woff2
"""
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# Symbols the diagram skill allows besides ASCII, box drawing and braille.
SYMBOLS = "←→↑↓↔↕⇐⇒⇔■□▪▫●○◆◇▲△▼▽▶▷◀◁▸▾•·…✓✗★☆"


def wanted_codepoints() -> list[int]:
    points = set(range(0x20, 0x7F))  # ASCII
    points.update(range(0x2500, 0x25A0))  # box drawing + block elements
    points.update(range(0x2800, 0x2900))  # braille
    points.update(ord(ch) for ch in SYMBOLS)
    return sorted(points)


def main(source: str, target: str) -> None:
    font = TTFont(source)
    upm = font["head"].unitsPerEm
    half = upm // 2
    names = set(font.getGlyphOrder())
    hmtx = font["hmtx"]

    # Remap full-width variants to their half-width twins in every Unicode cmap.
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for code, glyph in list(table.cmap.items()):
            if glyph.endswith(".WWID"):
                narrow = glyph[: -len(".WWID")] + ".NWID"
                if narrow in names:
                    table.cmap[code] = narrow

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = []  # no ligatures: diagrams are column-exact
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=wanted_codepoints())
    subsetter.subset(font)

    # Rename so it can never shadow a real Iosevka install.
    for record in font["name"].names:
        if record.nameID in (1, 4, 16):
            record.string = "BearDiagramMono"
        elif record.nameID == 6:
            record.string = "BearDiagramMono-Regular"

    cmap = font.getBestCmap()
    wrong = [
        (chr(code), glyph, font["hmtx"][glyph][0])
        for code, glyph in cmap.items()
        if code >= 0x20 and font["hmtx"][glyph][0] != half
    ]
    if wrong:
        sys.exit(f"not half-width: {wrong[:10]}")
    missing = [chr(code) for code in wanted_codepoints() if code not in cmap and code < 0x2800]
    font.save(target)
    print(f"wrote {target}: {len(cmap)} code points, all {half}/{upm} em; missing (non-braille): {''.join(missing) or 'none'}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
