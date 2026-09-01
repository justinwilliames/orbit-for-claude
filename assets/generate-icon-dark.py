#!/usr/bin/env python3
"""
Derives icon-dark.png from icon.png (== icon-light.png at the time this
script was written) by a mechanical, transparency-aware recolour — NOT a
re-export, NOT a redraw.

Why this exists: icon.png, icon-light.png and icon-dark.png were found
byte-identical (Finding 1, Nova's half of #14/#23). BRANDING_ASSETS in
server/orbit-branding.js composites "dark" onto a near-black panel
(ORBIT_THEME.bg.dark = "#0A0A0B", see server/orbit-branding.js) via
renderOrbitSvgBrandBadge — so a real dark variant needs to exist.

There is no vector master for icon.png's exact glyph anywhere in the repo
(server/ui/brand-mark.js draws a DIFFERENT two-tone rendering of the same
silhouette for a different surface — MCP host icons — and says so in its
own header comment: "The silhouette is icon.png's, deliberately"). Hand-
tracing icon.png's actual paths to build a from-scratch SVG risks shipping
an approximation of Orbit's mark under its own name, which is worse than
not shipping a vector master at all. So this takes the mechanical path
instead of the redraw path.

The recolour: icon.png is two flat colours plus antialiasing —
  bg    (99, 102, 241)  == #6366F1, the Orbit indigo brand fill
  glyph (255, 255, 255) == white
Every pixel's RGB lies on (or very near) the straight line between those
two points — that's what antialiasing between a flat bg and a flat glyph
looks like. For each pixel this script re-projects that same blend factor
t (0 = pure bg, 1 = pure glyph) onto a NEW line from a dark background to
white, so the glyph stays white, the antialiasing stays smooth, and only
the background hue changes. The alpha channel — which carries the
rounded-square silhouette against full transparency — is left untouched,
so the two variants share an identical outline; only their fill colour
differs.

The new background is #0A0A0B — not a colour invented for this fix, it is
ORBIT_THEME.bg.dark, already declared in server/orbit-branding.js as the
dark panel colour renderOrbitSvgBrandBadge paints behind a theme="dark"
logo. Matching it means the icon's own background disappears into the
panel it is designed to sit on, leaving the white glyph doing the work —
exactly the effect a hand-drawn "dark" mark would be going for, produced
here without redrawing anything.

Usage: python3 assets/generate-icon-dark.py
Rewrites icon-dark.png in the repo root from icon.png. Idempotent.
"""

import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "icon.png"
TARGET = ROOT / "icon-dark.png"

BG_OLD = (99, 102, 241)   # #6366F1 — Orbit indigo, icon.png's flat background
GLYPH = (255, 255, 255)   # icon.png's flat glyph colour
BG_NEW = (10, 10, 11)     # #0A0A0B — ORBIT_THEME.bg.dark (server/orbit-branding.js)


def project_t(rgb):
    """Blend factor of `rgb` along the BG_OLD -> GLYPH line, clamped to [0, 1].

    Uses a least-squares projection across all three channels rather than a
    single channel, so it is stable even where one channel's delta is small.
    """
    d = [GLYPH[c] - BG_OLD[c] for c in range(3)]
    denom = sum(dc * dc for dc in d)
    if denom == 0:
        return 0.0
    num = sum((rgb[c] - BG_OLD[c]) * d[c] for c in range(3))
    t = num / denom
    return max(0.0, min(1.0, t))


def recolour(pixel):
    r, g, b, a = pixel
    if a == 0:
        # Fully transparent — outside the rounded square. Nothing to
        # recolour; keep the pixel exactly as-is so the silhouette's
        # outline is bit-for-bit identical between variants.
        return pixel
    t = project_t((r, g, b))
    new_rgb = tuple(round(BG_NEW[c] + t * (GLYPH[c] - BG_NEW[c])) for c in range(3))
    return (*new_rgb, a)


def main():
    src = Image.open(SOURCE).convert("RGBA")
    pixels = src.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            pixels[x, y] = recolour(pixels[x, y])
    src.save(TARGET, "PNG")
    print(f"wrote {TARGET} ({w}x{h})")


if __name__ == "__main__":
    main()
