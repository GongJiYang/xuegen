#!/usr/bin/env python3
"""Build "Fusion12Diagram": half-width (6x12 px) pixel glyphs for box drawing,
block elements, arrows and common geometric shapes, so terminal-style diagrams
align with 6px Latin in Fusion Pixel 12px Monospaced.

Metrics match Fusion Pixel 12px: UPM 1200, 100 units per pixel,
ascent 1000, descent -200 (cell = 12 px tall), advance 600 (6 px).
"""
import sys
import unicodedata
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

W, H, PX, ASC = 6, 12, 100, 1000
CX = 2                      # light vertical column
CY = 6                      # light horizontal row
EXT = 2                     # vertical strokes overshoot the cell so rows join at line-height 16px
glyphs = {}                 # codepoint -> set of (x, y) pixels, y=0 is top row


def put(cp, pixels):
    glyphs[cp] = {(x, y) for x, y in pixels if 0 <= x < W and -EXT <= y < H + EXT}


def hline(y, x0, x1):
    return {(x, y) for x in range(x0, x1 + 1)}


def vline(x, y0, y1):
    return {(x, y) for y in range(y0, y1 + 1)}


# ── box drawing U+2500–257F ────────────────────────────────────────────────
DIRS = {"UP": ["up"], "DOWN": ["down"], "LEFT": ["left"], "RIGHT": ["right"],
        "HORIZONTAL": ["left", "right"], "VERTICAL": ["up", "down"]}
WEIGHTS = {"LIGHT": "light", "SINGLE": "light", "HEAVY": "heavy", "DOUBLE": "double"}


def parse_arms(words):
    arms, pending, current = {}, [], None
    for w in words:
        if w in WEIGHTS:
            if pending:
                for d in pending:
                    arms[d] = WEIGHTS[w]
                pending, current = [], None
            else:
                current = WEIGHTS[w]
        elif w in DIRS:
            for d in DIRS[w]:
                if current:
                    arms[d] = current
                else:
                    pending.append(d)
    for d in pending:
        arms[d] = current or "light"
    return arms


def arm_pixels(d, weight):
    if weight == "light":
        return {"left": hline(CY, 0, CX), "right": hline(CY, CX, W - 1),
                "up": vline(CX, -EXT, CY), "down": vline(CX, CY, H - 1 + EXT)}[d]
    if weight == "heavy":
        return {"left": hline(CY - 1, 0, CX + 1) | hline(CY, 0, CX + 1),
                "right": hline(CY - 1, CX, W - 1) | hline(CY, CX, W - 1),
                "up": vline(CX, -EXT, CY) | vline(CX + 1, -EXT, CY),
                "down": vline(CX, CY - 1, H - 1 + EXT) | vline(CX + 1, CY - 1, H - 1 + EXT)}[d]
    # double: rows CY-1 / CY+1, columns CX-1 / CX+1
    return {"left": hline(CY - 1, 0, CX + 1) | hline(CY + 1, 0, CX + 1),
            "right": hline(CY - 1, CX - 1, W - 1) | hline(CY + 1, CX - 1, W - 1),
            "up": vline(CX - 1, -EXT, CY + 1) | vline(CX + 1, -EXT, CY + 1),
            "down": vline(CX - 1, CY - 1, H - 1 + EXT) | vline(CX + 1, CY - 1, H - 1 + EXT)}[d]


# Pure double-line glyphs drawn explicitly so corners and joints are clean.
a, b, r1, r2 = CX - 1, CX + 1, CY - 1, CY + 1
DOUBLE = {
    0x2550: hline(r1, 0, W - 1) | hline(r2, 0, W - 1),                                   # ═
    0x2551: vline(a, -EXT, H - 1 + EXT) | vline(b, -EXT, H - 1 + EXT),                                     # ║
    0x2554: hline(r1, a, W - 1) | vline(a, r1, H - 1 + EXT) | hline(r2, b, W - 1) | vline(b, r2, H - 1 + EXT),   # ╔
    0x2557: hline(r1, 0, b) | vline(b, r1, H - 1 + EXT) | hline(r2, 0, a) | vline(a, r2, H - 1 + EXT),           # ╗
    0x255A: hline(r2, a, W - 1) | vline(a, -EXT, r2) | hline(r1, b, W - 1) | vline(b, -EXT, r1),           # ╚
    0x255D: hline(r2, 0, b) | vline(b, -EXT, r2) | hline(r1, 0, a) | vline(a, -EXT, r1),                   # ╝
    0x2560: vline(a, -EXT, H - 1 + EXT) | vline(b, -EXT, r1) | vline(b, r2, H - 1 + EXT) | hline(r1, b, W - 1) | hline(r2, b, W - 1),  # ╠
    0x2563: vline(b, -EXT, H - 1 + EXT) | vline(a, -EXT, r1) | vline(a, r2, H - 1 + EXT) | hline(r1, 0, a) | hline(r2, 0, a),          # ╣
    0x2566: hline(r1, 0, W - 1) | hline(r2, 0, a) | hline(r2, b, W - 1) | vline(a, r2, H - 1 + EXT) | vline(b, r2, H - 1 + EXT),  # ╦
    0x2569: hline(r2, 0, W - 1) | hline(r1, 0, a) | hline(r1, b, W - 1) | vline(a, -EXT, r1) | vline(b, -EXT, r1),          # ╩
    0x256C: hline(r1, 0, a) | hline(r1, b, W - 1) | hline(r2, 0, a) | hline(r2, b, W - 1)
            | vline(a, -EXT, r1) | vline(b, -EXT, r1) | vline(a, r2, H - 1 + EXT) | vline(b, r2, H - 1 + EXT),             # ╬
}

for cp in range(0x2500, 0x2580):
    name = unicodedata.name(chr(cp), "")
    words = name.replace("BOX DRAWINGS ", "").split()
    if cp in DOUBLE:
        put(cp, DOUBLE[cp]); continue
    if "DIAGONAL" in words:
        up_right = {(x, H - 1 - y) for y in range(H) for x in [y // 2]}
        down_right = {(y // 2, y) for y in range(H)}
        if "CROSS" in words: put(cp, up_right | down_right)
        elif "UPPER RIGHT TO LOWER LEFT" in name: put(cp, up_right)
        else: put(cp, down_right)
        continue
    if "DASH" in words:
        heavy = "HEAVY" in words
        if "HORIZONTAL" in words:
            px = {(x, y) for x in range(0, W, 2) for y in ([CY - 1, CY] if heavy else [CY])}
        else:
            px = {(x, y) for y in range(0, H, 3) for x in ([CX, CX + 1] if heavy else [CX])} | \
                 {(x, y + 1) for y in range(0, H, 3) for x in ([CX, CX + 1] if heavy else [CX])}
        put(cp, px); continue
    arms = parse_arms(words)
    if not arms:
        continue
    px = set()
    for d, wgt in arms.items():
        px |= arm_pixels(d, wgt)
    if "ARC" in words:      # rounded corner: drop the corner pixel, add a diagonal step
        px.discard((CX, CY))
    put(cp, px)

# ── block elements U+2580–259F ─────────────────────────────────────────────
full = {(x, y) for x in range(W) for y in range(H)}
rows = lambda y0, y1: {(x, y) for x in range(W) for y in range(y0, y1)}
cols = lambda x0, x1: {(x, y) for x in range(x0, x1) for y in range(-EXT, H + EXT)}
put(0x2580, rows(0, H // 2))                                     # ▀
for n in range(1, 9):                                            # ▁..█ lower eighths
    put(0x2580 + n, rows(H - round(H * n / 8), H))
for n in range(1, 8):                                            # ▉..▏ left 7/8..1/8
    put(0x2588 + n, cols(0, max(1, round(W * (8 - n) / 8))))
put(0x2590, cols(W // 2, W))                                     # ▐
put(0x2591, {(x, y) for x, y in full if x % 2 == 0 and y % 2 == 0})          # ░ 25%
put(0x2592, {(x, y) for x, y in full if (x + y) % 2 == 0})                    # ▒ 50%
put(0x2593, {(x, y) for x, y in full if not (x % 2 == 1 and y % 2 == 1)})     # ▓ 75%
put(0x2594, rows(0, 2))                                          # ▔
put(0x2595, cols(W - 1, W))                                      # ▕
q = {"ul": {(x, y) for x in range(3) for y in range(6)}, "ur": {(x, y) for x in range(3, 6) for y in range(6)},
     "ll": {(x, y) for x in range(3) for y in range(6, 12)}, "lr": {(x, y) for x in range(3, 6) for y in range(6, 12)}}
for cp, parts in {0x2596: "ll", 0x2597: "lr", 0x2598: "ul", 0x2599: "ul ll lr", 0x259A: "ul lr", 0x259B: "ul ur ll",
                  0x259C: "ul ur lr", 0x259D: "ur", 0x259E: "ur ll", 0x259F: "ur ll lr"}.items():
    put(cp, set().union(*(q[p] for p in parts.split())))


# ── hand-drawn arrows & shapes (6x12, '#' = ink) ───────────────────────────
def art(cp, *lines):
    pad = (H - len(lines)) // 2 + (1 if (H - len(lines)) % 2 else 0)
    put(cp, {(x, y + pad) for y, ln in enumerate(lines) for x, c in enumerate(ln) if c == "#"})


ART = {
    0x2190: ["......", "..#...", ".#....", "######", ".#....", "..#..."],                 # ←
    0x2192: ["......", "...#..", "....#.", "######", "....#.", "...#.."],                 # →
    0x2191: ["..#...", ".###..", "#.#.#.", "..#...", "..#...", "..#...", "..#...", "..#..."],   # ↑
    0x2193: ["..#...", "..#...", "..#...", "..#...", "..#...", "#.#.#.", ".###..", "..#..."],   # ↓
    0x2194: ["......", ".#..#.", "#....#", "######", "#....#", ".#..#."],                 # ↔
    0x2195: ["..#...", ".###..", "#.#.#.", "..#...", "..#...", "#.#.#.", ".###..", "..#..."],   # ↕
    0x21D0: ["..#...", ".#####", "#.....", ".#####", "..#..."],                           # ⇐
    0x21D2: ["...#..", "#####.", ".....#", "#####.", "...#.."],                           # ⇒
    0x21D4: [".#..#.", "######", "#....#", "######", ".#..#."],                           # ⇔
    0x25A0: ["#####.", "#####.", "#####.", "#####.", "#####."],                           # ■
    0x25A1: ["#####.", "#...#.", "#...#.", "#...#.", "#####."],                           # □
    0x25AA: ["###...", "###...", "###..."],                                               # ▪
    0x25AB: ["###...", "#.#...", "###..."],                                               # ▫
    0x25CF: [".###..", "#####.", "#####.", "#####.", ".###.."],                           # ●
    0x25CB: [".###..", "#...#.", "#...#.", "#...#.", ".###.."],                           # ○
    0x25C6: ["..#...", ".###..", "#####.", ".###..", "..#..."],                           # ◆
    0x25C7: ["..#...", ".#.#..", "#...#.", ".#.#..", "..#..."],                           # ◇
    0x25B2: ["..#...", "..#...", ".###..", ".###..", "#####."],                           # ▲
    0x25B3: ["..#...", "..#...", ".#.#..", ".#.#..", "#####."],                           # △
    0x25BC: ["#####.", ".###..", ".###..", "..#...", "..#..."],                           # ▼
    0x25BD: ["#####.", ".#.#..", ".#.#..", "..#...", "..#..."],                           # ▽
    0x25B6: ["#.....", "##....", "###...", "####..", "###...", "##....", "#....."],       # ▶
    0x25B7: ["#.....", "##....", "#.#...", "#..#..", "#.#...", "##....", "#....."],       # ▷
    0x25C0: ["...#..", "..##..", ".###..", "####..", ".###..", "..##..", "...#.."],       # ◀
    0x25C1: ["...#..", "..##..", ".#.#..", "#..#..", ".#.#..", "..##..", "...#.."],       # ◁
    0x25B8: ["#.....", "##....", "###...", "##....", "#....."],                           # ▸
    0x25BE: ["#####.", ".###..", "..#..."],                                               # ▾
    0x2022: [".##...", "####..", "####..", ".##..."],                                     # •
    0x00B7: ["##", "##"],                                                                 # ·
    0x2026: ["......", "#.#.#."],                                                         # … (half-width)
    0x2713: [".....#", "....#.", "#..#..", ".##...", "..#..."],                           # ✓
    0x2717: ["#...#.", ".#.#..", "..#...", ".#.#..", "#...#."],                           # ✗
    0x2605: ["..#...", "..#...", "#####.", ".###..", ".#.#..", "#...#."],                 # ★
    0x2606: ["..#...", "..#...", "##.##.", ".#.#..", ".#.#..", "#...#."],                 # ☆
}
for cp, lines in ART.items():
    art(cp, *lines)
# middle dot / ellipsis sit on their own rows, not centred
put(0x00B7, {(2, 6), (3, 6), (2, 7), (3, 7)})
put(0x2026, {(0, 10), (2, 10), (4, 10)})


# ── build font ─────────────────────────────────────────────────────────────
def build(out):
    order = [".notdef", "space"] + [f"u{cp:04X}" for cp in sorted(glyphs)]
    fb = FontBuilder(1200, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: "space", **{cp: f"u{cp:04X}" for cp in glyphs}})
    drawn = {".notdef": TTGlyphPen(None).glyph(), "space": TTGlyphPen(None).glyph()}
    for cp, pixels in glyphs.items():
        pen = TTGlyphPen(None)
        for x, y in sorted(pixels):
            x0, x1 = x * PX, (x + 1) * PX
            y1 = ASC - y * PX
            y0 = y1 - PX
            pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
        drawn[f"u{cp:04X}"] = pen.glyph()
    fb.setupGlyf(drawn)
    lsb = {f"u{cp:04X}": min(x for x, _ in px) * PX for cp, px in glyphs.items() if px}  # lsb must equal xMin
    fb.setupHorizontalMetrics({g: (600, lsb.get(g, 0)) for g in order})
    fb.setupHorizontalHeader(ascent=1000, descent=-200)
    fb.setupNameTable({"familyName": "Fusion12Diagram", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=1000, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=1000, usWinDescent=200)
    fb.setupPost(isFixedPitch=1)
    fb.font.flavor = "woff2"
    fb.save(out)
    print(f"{out}: {len(glyphs)} glyphs")


build(sys.argv[1] if len(sys.argv) > 1 else "fusion-12-diagram.woff2")
