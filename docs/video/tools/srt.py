"""SRT dari timeline.json; potongan sama dengan subtitel yang dibakar (film/lib.js). Pakai: python3 -I tools/srt.py"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
tl = json.loads((ROOT / 'timeline.json').read_text())
def chunks(text):
    if len(text) <= 78: return [text]
    mid = len(text) / 2; best = -1
    for i, c in enumerate(text):
        if c in ',.:?' and i + 1 < len(text) and text[i + 1] == ' ' and (best < 0 or abs(i - mid) < abs(best - mid)): best = i
    if best < 0: best = text.rfind(' ', 0, int(mid))
    return chunks(text[:best + 1].strip()) + chunks(text[best + 1:].strip())
def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'
def wrap(c, n=42):
    if len(c) <= n: return c
    w = c.split(' ')
    cands = [(max(len(' '.join(w[:i])), len(' '.join(w[i:]))), ' '.join(w[:i]) + '\n' + ' '.join(w[i:])) for i in range(1, len(w))]
    return min(cands)[1]
out, k = [], 1
for sc in tl['scenes']:
    for s in sc['sentences']:
        cs = chunks(s['text']); tot = sum(map(len, cs)); a = s['start']; d = s['end'] - s['start']
        for c in cs:
            L = d * len(c) / tot
            out.append(f'{k}\n{ts(a)} --> {ts(a + L)}\n{wrap(c)}\n'); k += 1; a += L
(ROOT / 'out/pasukan-bima-sandi-chain.srt').write_text('\n'.join(out))
print(k - 1, 'subtitel, baris terpanjang', max(len(l) for b in out for l in b.split('\n')[2:]))
