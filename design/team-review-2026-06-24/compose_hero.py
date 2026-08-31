#!/usr/bin/env python3
"""Composite an on-brand Sophiie hero: Sky Glow gradient + navy headline + rounded photo.
Matches the house promo-hero template. Usage: compose_hero.py <photo> <out> "Headline"
"""
import sys
from PIL import Image, ImageDraw, ImageFont

photo_path, out_path = sys.argv[1], sys.argv[2]
headline = sys.argv[3] if len(sys.argv) > 3 else "Sophiie's been busy"

W, H = 1200, 1400
NAVY = (11, 23, 56)

# --- Sky Glow gradient background (pale blue, soft white-centre glow) ---
top = (234, 247, 255)      # #EAF7FF
bottom = (176, 219, 248)   # ~#B0DBF8
bg = Image.new("RGB", (W, H), top)
px = bg.load()
for y in range(H):
    t = y / (H - 1)
    r = int(top[0] + (bottom[0]-top[0]) * t)
    g = int(top[1] + (bottom[1]-top[1]) * t)
    b = int(top[2] + (bottom[2]-top[2]) * t)
    for x in range(W):
        px[x, y] = (r, g, b)
# soft centre glow near the headline
glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse([W*0.1, -H*0.15, W*0.9, H*0.45], fill=70)
glow = glow.filter_blur if False else glow
white = Image.new("RGB", (W, H), (255, 255, 255))
from PIL import ImageFilter
glow = glow.filter(ImageFilter.GaussianBlur(120))
bg = Image.composite(white, bg, glow)

draw = ImageDraw.Draw(bg)

# --- Headline (bold navy, sentence case, brand-correct) ---
def load_font(size):
    for p in ["/System/Library/Fonts/HelveticaNeue.ttc",
              "/System/Library/Fonts/Helvetica.ttc",
              "/System/Library/Fonts/Avenir Next.ttc",
              "/System/Library/Fonts/SFNS.ttf"]:
        try:
            return ImageFont.truetype(p, size, index=0)
        except Exception:
            continue
    return ImageFont.load_default()

# wrap headline to fit width
def wrap(text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) <= maxw:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

fsize = 116
font = load_font(fsize)
margin = 90
lines = wrap(headline, font, W - 2*margin)
line_h = int(fsize * 1.12)
y = 110
for ln in lines:
    tw = draw.textlength(ln, font=font)
    draw.text(((W - tw)/2, y), ln, font=font, fill=NAVY)
    y += line_h
y += 34

# --- Rounded photo below the headline ---
photo = Image.open(photo_path).convert("RGB")
pad = 80
pw = W - 2*pad
ph = H - y - pad
# cover-crop the photo to pw x ph
src_ratio = photo.width / photo.height
dst_ratio = pw / ph
if src_ratio > dst_ratio:
    nh = photo.height; nw = int(nh * dst_ratio)
    left = (photo.width - nw)//2; photo = photo.crop((left, 0, left+nw, nh))
else:
    nw = photo.width; nh = int(nw / dst_ratio)
    top_c = (photo.height - nh)//2; photo = photo.crop((0, top_c, nw, top_c+nh))
photo = photo.resize((pw, ph), Image.LANCZOS)
# rounded mask
radius = 56
mask = Image.new("L", (pw, ph), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, ph], radius=radius, fill=255)
bg.paste(photo, (pad, y), mask)

bg.save(out_path, "JPEG", quality=86)
print("saved", out_path, bg.size)
