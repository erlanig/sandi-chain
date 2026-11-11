"""Buang latar langit putih/abu polos dari foto -> WebP transparan.

Pakai (butuh Pillow + numpy):
  python3 scripts/cutout-hero.py foto.jpg src/assets/hero.webp 1920
Langit = piksel terang & tidak berwarna yang tersambung ke tepi atas/samping (flood fill),
jadi bagian putih di dalam objek (mis. pantulan) tidak ikut terhapus.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
max_w = int(sys.argv[3]) if len(sys.argv) > 3 else 2000

im = Image.open(src).convert('RGB')
if im.width > max_w:
    im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
lo, hi = a.min(axis=2), a.max(axis=2)

# perkiraan warna langit dari baris paling atas
sky = np.median(a[:4].reshape(-1, 3), axis=0)
dist = np.abs(a - sky).max(axis=2)
cand = (lo > sky.min() - 40) & (hi - lo < 26) & (dist < 34)

mask = Image.fromarray((cand * 255).astype(np.uint8), 'L').copy()  # copy: floodfill butuh buffer milik PIL
h, w = cand.shape
seeds = [(x, 0) for x in range(0, w, 6)] + [(0, y) for y in range(0, h // 2, 6)] + [(w - 1, y) for y in range(0, h // 2, 6)]
for x, y in seeds:
    if mask.getpixel((x, y)) == 255:
        ImageDraw.floodfill(mask, (x, y), 128)
skyMask = np.asarray(mask) == 128

# tepi: perluas sedikit area langit (hapus halo putih), lalu haluskan
m = Image.fromarray((skyMask * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.1))
alpha = 1 - np.asarray(m).astype(np.float32) / 255

# buang campuran warna langit di piksel tepi yang semi-transparan
edge = (alpha > 0.02) & (alpha < 0.98)
al = alpha[..., None]
fixed = np.clip((a - (1 - al) * sky) / np.maximum(al, 0.02), 0, 255)
a = np.where(edge[..., None], fixed, a)

out = np.dstack([a, alpha * 255]).astype(np.uint8)
Image.fromarray(out, 'RGBA').save(dst, 'WEBP', quality=82, method=6)
print(f'{w}x{h} langit={skyMask.mean():.0%} -> {dst}')
