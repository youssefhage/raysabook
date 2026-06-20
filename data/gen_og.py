#!/usr/bin/env python3
"""Compose the RaysABook social share image (1200x630) -> site/og.png"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
W, H = 1200, 630

def font(path, size, fallback=None):
    for p in ([path] + ([fallback] if fallback else [])):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

SERIF = "/System/Library/Fonts/NewYork.ttf"
SERIF_FB = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SANS_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"

f_word = font(SANS_B, 46)
f_eye = font(SANS_B, 22)
f_h = font(SERIF, 86, SERIF_FB)
f_meta = font(SANS, 27)
f_meta_b = font(SANS_B, 27)
f_pill = font(SANS_B, 26)

# ---- background: diagonal navy gradient ----
top = (16, 58, 87)      # #103a57
bot = (9, 31, 46)       # #091f2e
bg = Image.new("RGB", (W, H), bot)
px = bg.load()
for y in range(H):
    for x in range(0, W, 1):
        t = (x / W * 0.45 + y / H * 0.75)
        t = min(1.0, t)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        px[x, y] = (r, g, b)

# cyan glow top-right
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([W - 520, -260, W + 200, 360], fill=(94, 187, 232, 120))
glow = glow.filter(ImageFilter.GaussianBlur(110))
bg = Image.alpha_composite(bg.convert("RGBA"), glow)
d = ImageDraw.Draw(bg)

CYAN = (94, 187, 232)
CYAN2 = (58, 160, 216)
WHITE = (255, 255, 255)
MUTE = (199, 222, 236)
GREEN = (37, 211, 102)

PADX = 96

# ---- logo mark (book + pixels), top-right ----
s = 4.3
ox = 1150 - 34 * s
oy = 70
def P(x, y):
    return (ox + x * s, oy + y * s)
mark = Image.new("RGBA", (W, H), (0, 0, 0, 0))
md = ImageDraw.Draw(mark)
right = [P(22, 13), P(28, 11.1), P(34, 10.4), P(34, 31.4), P(28, 29.4), P(22, 33)]
left = [P(22, 13), P(16, 11.1), P(10, 10.4), P(10, 31.4), P(16, 29.4), P(22, 33)]
md.polygon(right, fill=(79, 176, 226, 255))
md.polygon(left, fill=(79, 176, 226, 150))
md.rectangle([P(21, 12.6)[0], P(21, 12.6)[1], P(23, 34.4)[0], P(23, 34.4)[1]], fill=(10, 35, 51, 255))
for (bx, by, bs, col) in [(3.5, 31, 4.2, (94, 187, 232, 255)), (2, 36.2, 3, (154, 214, 243, 255)), (7.2, 36.6, 2.4, (58, 160, 216, 255))]:
    x0, y0 = P(bx, by); md.rectangle([x0, y0, x0 + bs * s, y0 + bs * s], fill=col)
bg = Image.alpha_composite(bg, mark)
d = ImageDraw.Draw(bg)

# ---- wordmark: Rays A Book (A in cyan) ----
wy = 150
x = PADX
for seg, col in [("Rays", WHITE), ("A", CYAN), ("Book", WHITE)]:
    d.text((x, wy), seg, font=f_word, fill=col)
    x += d.textlength(seg, font=f_word)

# ---- eyebrow (letter-spaced) ----
ey = 232
x = PADX
for ch in "THE COMPLETE CATALOG":
    d.text((x, ey), ch, font=f_eye, fill=(127, 196, 234))
    x += d.textlength(ch, font=f_eye) + 6

# ---- headline ----
d.text((PADX, 286), "Thousands of books, one", font=f_h, fill=WHITE)
d.text((PADX, 388), "quiet shelf.", font=f_h, fill=WHITE)

# ---- meta row ----
my = 530
x = PADX
def chunk(text, fnt, col):
    global x
    d.text((x, my), text, font=fnt, fill=col)
    x += d.textlength(text, font=fnt)
chunk("7,566", f_meta_b, WHITE)
chunk(" titles", f_meta, MUTE)
for label in ["Decades & languages", "All formats"]:
    cx = x + 18
    d.ellipse([cx, my + 14, cx + 6, my + 20], fill=(60, 108, 137))
    x = cx + 24
    chunk(label, f_meta, MUTE)

# ---- WhatsApp pill, bottom-right ----
ptxt = "Enquire on WhatsApp"
pw = d.textlength(ptxt, font=f_pill) + 52
ph = 60
px1, py1 = W - PADX - pw, H - 64 - ph
d.rounded_rectangle([px1, py1, px1 + pw, py1 + ph], radius=ph // 2, fill=GREEN)
d.text((px1 + 26, py1 + (ph - 34) // 2), ptxt, font=f_pill, fill=WHITE)

out = os.path.join(ROOT, "site", "og.png")
bg.convert("RGB").save(out, "PNG", optimize=True)
print("wrote", out, bg.size)
