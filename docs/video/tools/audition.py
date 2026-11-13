"""Klip audisi pelafalan dan kecepatan. Pakai: python3 -I tools/audition.py"""
import json, subprocess, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
out = ROOT / 'out/audition'; out.mkdir(parents=True, exist_ok=True)
def rec(text, name, rate='158'):
    a = out / (name + '.aiff')
    subprocess.run(['say', '-v', 'Damayanti', '-r', rate, '-o', str(a), text], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(a), '-ar', '48000', '-ac', '1', str(out / (name + '.wav'))], check=True)
    a.unlink()
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
for word, cands in json.loads((ROOT / 'tools/pronunciation.json').read_text()).items():
    for i, c in enumerate(cands, 1):
        rec(c, f'kata_{slug(word)}_{i}_{slug(c)}')
lines = {l[0]: l[3] for l in json.loads((ROOT / 'tools/narration.json').read_text())}
for r in ('150', '158', '166'):
    rec(' [[slnc 450]] '.join(lines[k] for k in ('S01', 'S02', 'S03')), f'kalimat_S01-S03_rate{r}', r)
print(len(list(out.glob('*.wav'))), 'klip')
