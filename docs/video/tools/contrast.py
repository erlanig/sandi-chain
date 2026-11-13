"""Rasio kontras pasangan warna teks/latar yang dipakai film (WCAG). Pakai: python3 -I tools/contrast.py"""
def hx(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def blend(fg, a, bg): return tuple(f * a + b * (1 - a) for f, b in zip(fg, bg))
def lum(c):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, c); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
BG, LAYER, LAYER2, PAPER, PLATE = hx('#0d170f'), hx('#161b14'), hx('#1d2419'), hx('#f3f4f0'), blend(hx('#0a100b'), 0.86, hx('#0d170f'))
INK = hx('#ecebe0')
pairs = [
    ('teks terang / latar', INK, BG), ('teks redup 60% / latar', blend(INK, .6, BG), BG), ('teks redup 60% / panel', blend(INK, .6, LAYER), LAYER),
    ('teks redup 60% / baris ledger', blend(INK, .6, LAYER2), LAYER2), ('khaki / latar', hx('#a9b665'), BG), ('khaki / panel', hx('#a9b665'), LAYER),
    ('emas terang / latar', hx('#f1cf6a'), BG), ('emas / latar', hx('#d4a72c'), BG), ('merah muda #e8605a / panel', hx('#e8605a'), LAYER2),
    ('merah #d9382f (cap) / kertas', hx('#d9382f'), PAPER), ('teks kertas / kertas', hx('#1b2016'), PAPER), ('subtitel / pelat', INK, PLATE),
    ('putih / pil merah', hx('#ffffff'), hx('#d9382f')), ('hitam-hijau / pil khaki', hx('#141a10'), hx('#a9b665')),
    ('aturan non-aktif 60% / latar', blend(INK, .6, BG), BG),
]
for n, a, b in pairs: print(f'{ratio(a, b):5.2f}  {"OK " if ratio(a, b) >= 4.5 else "LOW"}  {n}')
