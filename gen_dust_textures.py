"""Generate asteroid dust billboard textures.

Outputs:
  client/public/textures/dust_billboard.png      – 128x128, mid-LOD (500m–2km)
  client/public/textures/dust_billboard_far.png   – 16x16,  far-LOD (>2km)
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)

def gen_dust(size: int) -> Image.Image:
    """Create a rough rocky blob on transparent background."""
    # Work at 4x then downscale for antialiasing
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = s // 2, s // 2
    base_r = s * 0.36  # base radius

    # Draw several overlapping irregular blobs to create rocky shape
    for _ in range(6):
        points = []
        n_pts = 12
        offset_x = random.uniform(-s * 0.05, s * 0.05)
        offset_y = random.uniform(-s * 0.05, s * 0.05)
        r_var = random.uniform(0.7, 1.0) * base_r
        for j in range(n_pts):
            angle = (j / n_pts) * math.pi * 2
            r = r_var * (0.6 + random.uniform(0, 0.55))
            px = cx + offset_x + math.cos(angle) * r
            py = cy + offset_y + math.sin(angle) * r
            points.append((px, py))
        # Random gray-brown tone
        base_val = random.randint(70, 120)
        r_col = base_val + random.randint(-10, 20)
        g_col = base_val + random.randint(-15, 10)
        b_col = base_val + random.randint(-20, 5)
        draw.polygon(points, fill=(r_col, g_col, b_col, 180))

    # Add some bright mineral specks
    for _ in range(int(size * 0.8)):
        sx = random.gauss(cx, base_r * 0.5)
        sy = random.gauss(cy, base_r * 0.5)
        dist = math.hypot(sx - cx, sy - cy)
        if dist < base_r * 0.9:
            v = random.randint(150, 220)
            sr = max(1, scale)
            draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr],
                         fill=(v, v - 10, v - 20, random.randint(100, 200)))

    # Add darker crevice spots
    for _ in range(int(size * 0.5)):
        sx = random.gauss(cx, base_r * 0.4)
        sy = random.gauss(cy, base_r * 0.4)
        dist = math.hypot(sx - cx, sy - cy)
        if dist < base_r * 0.85:
            v = random.randint(30, 60)
            sr = max(1, scale * 2)
            draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr],
                         fill=(v, v, v, random.randint(80, 160)))

    # Gaussian blur for softness
    img = img.filter(ImageFilter.GaussianBlur(radius=scale * 1.5))

    # Radial alpha falloff to make edges blend to transparent
    pixels = img.load()
    for y in range(s):
        for x in range(s):
            dx = (x - cx) / base_r
            dy = (y - cy) / base_r
            d = math.sqrt(dx * dx + dy * dy)
            if d > 1.0:
                pixels[x, y] = (0, 0, 0, 0)
            elif d > 0.65:
                r, g, b, a = pixels[x, y]
                fade = 1.0 - ((d - 0.65) / 0.35)
                fade = max(0, min(1, fade))
                pixels[x, y] = (r, g, b, int(a * fade * fade))

    # Downscale to target size
    img = img.resize((size, size), Image.LANCZOS)
    return img


if __name__ == "__main__":
    # Mid-LOD: 128x128
    mid = gen_dust(128)
    mid.save("client/public/textures/dust_billboard.png")
    print("Saved dust_billboard.png (128x128)")

    # Far-LOD: 16x16 — heavily downscaled version
    far = mid.resize((16, 16), Image.LANCZOS)
    far.save("client/public/textures/dust_billboard_far.png")
    print("Saved dust_billboard_far.png (16x16)")
