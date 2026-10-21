"""
By The Zeitgeist brand images: the wordmark (as on the site) and the icon
(a Fraunces Z with the red dot tucked between its top bar and diagonal).

  python make.py      (needs Pillow; font: ../remotion/public/fonts/Fraunces-var.ttf)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONT = HERE.parent / "remotion/public/fonts/Fraunces-var.ttf"
INK, RED, PAPER = (18, 18, 18), (176, 0, 32), (255, 255, 255)


def font(size, weight, opsz):
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_axes([opsz, weight, 0, 1])  # opsz, wght, SOFT, WONK
    return f


def ink_mask(text, f):
    l, t, r, b = f.getbbox(text)
    im = Image.new("L", (r - l, b - t), 0)
    ImageDraw.Draw(im).text((-l, -t), text, font=f, fill=255)
    return im


def icon(px=1024, bg=PAPER, fg=INK):
    f = font(int(px * 0.78), 600, 144)
    z = ink_mask("Z", f)
    a = np.asarray(z) > 127
    h, w = a.shape
    # The wedge's corner: where the top bar's underside meets the diagonal.
    # Measured mid-bar, clear of the curled serif on the left.
    mid = int(w * 0.55)
    col = a[:, mid]
    top = next(y for y in range(h) if col[y])
    bar_bottom = next(y for y in range(top, h) if not col[y])
    corner = (mid + np.flatnonzero(a[bar_bottom + 2, mid:])[0], bar_bottom)
    # Distance from every free pixel near the corner to the nearest ink.
    ys, xs = np.nonzero(a)
    edge = (a[ys, np.clip(xs - 1, 0, w - 1)] == 0) | (a[np.clip(ys + 1, 0, h - 1), xs] == 0)
    ink = np.stack([xs[edge], ys[edge]], 1).astype(float)
    gx, gy = np.meshgrid(np.arange(int(w * 0.25), corner[0]), np.arange(bar_bottom, int(h * 0.55)))
    free = ~a[gy, gx]
    pts = np.stack([gx[free], gy[free]], 1).astype(float)
    dist = np.min(np.linalg.norm(pts[:, None, :] - ink[None, ::3, :], axis=2), axis=1)
    r = f.size * 0.052
    clear = r * 1.7  # dot radius + gap
    # Of the spots that clear both strokes, the one nearest the corner sits on
    # the bisector: the same gap to the bar and to the diagonal.
    ok = pts[dist >= clear]
    cx, cy = ok[np.argmin(np.linalg.norm(ok - np.array(corner, float), axis=1))]
    im = Image.new("RGB", (px, px), bg)
    ox, oy = (px - w) // 2, (px - h) // 2
    im.paste(Image.new("RGB", z.size, fg), (ox, oy), z)
    d = ImageDraw.Draw(im)
    d.ellipse([ox + cx - r, oy + cy - r, ox + cx + r, oy + cy + r], fill=RED)
    return im


def wordmark(height=400, bg=PAPER, fg=INK, pad=0.35):
    name_size = height
    by = font(int(name_size * 0.606), 600, 72)
    nm = font(name_size, 600, 60)
    parts = [("By the", by, -0.02), (" ", by, 0), ("Zeitge", nm, -0.035), ("ı", nm, -0.035), ("st", nm, -0.035)]
    # Lay out on a shared baseline.
    x, pieces = 0.0, []
    for text, f, track in parts:
        for ch in text:
            adv = f.getlength(ch) + track * f.size
            if text == " ":
                adv = 0.28 * by.size  # the site's 0.28em gap
            pieces.append((x, ch, f))
            x += adv
    width = int(x)
    asc = nm.getmetrics()[0]
    desc = nm.getmetrics()[1]
    P = int(name_size * pad)
    W, H = width + 2 * P, asc + desc + 2 * P
    im = Image.new("RGBA", (W, H), bg if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base = P + asc
    for px_, ch, f in pieces:
        if ch == " ":
            continue
        d.text((P + px_, base), ch, font=f, fill=fg, anchor="ls")
        if ch == "ı":
            w = f.getlength("ı")
            cx = P + px_ + w / 2
            cy = base - f.getmetrics()[0] + 0.32 * f.size + 0.075 * f.size
            r = 0.075 * f.size
            # Put the dot where the site does: 0.32em below the em top.
            top = base - asc
            cy = top + (0.32 + 0.075) * f.size
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED)
    return im.crop(im.getbbox()) if not bg else im


def banner(W=2560, H=1440):
    """YouTube channel art. Everything sits in the 1546x423 middle that every
    device shows; the rest is plain paper that TVs and desktops crop to."""
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    mark = wordmark(height=150, bg=None)
    mx, my = (W - mark.width) // 2, H // 2 - 150
    im.paste(mark, (mx, my), mark)
    # The site's masthead rule: a heavy line over a hairline.
    y = my + mark.height + 22
    d.rectangle([W // 2 - 700, y, W // 2 + 700, y + 5], fill=INK)
    d.rectangle([W // 2 - 700, y + 11, W // 2 + 700, y + 12], fill=INK)
    tag = ImageFont.truetype(str(FONT), 46)
    tag.set_variation_by_axes([36, 400, 0, 0])
    d.text((W // 2, y + 64), "Spirit of the times.", font=tag, fill=INK, anchor="mt")
    return im


if __name__ == "__main__":
    banner().save(HERE / "youtube-banner.png")
    icon().save(HERE / "icon.png")
    icon(bg=INK, fg=PAPER).save(HERE / "icon-dark.png")
    wordmark().convert("RGB").save(HERE / "logo.png")
    wordmark(bg=None).save(HERE / "logo-transparent.png")
    print("wrote icon.png icon-dark.png logo.png logo-transparent.png")
