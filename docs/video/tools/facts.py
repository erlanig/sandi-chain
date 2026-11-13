"""Hitung hash asli dan timeline. Pakai: python3 -I tools/facts.py"""
import json, hashlib, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'assets/R-001-XI-2026.txt').read_bytes()
flip = bytearray(src); flip[200] ^= 0x01            # balik satu bit pada byte ke-200
(ROOT / 'out').mkdir(exist_ok=True)
(ROOT / 'out/R-001-XI-2026-salinan.txt').write_bytes(bytes(flip))
h = lambda b: hashlib.sha256(b).hexdigest()
shasum = subprocess.run(['shasum', '-a', '256', str(ROOT / 'assets/R-001-XI-2026.txt')], capture_output=True, text=True).stdout.split()[0]
assert shasum == h(src)
# rantai 4 blok: hash_i = sha256(prev + isi)
def chain(items):
    prev, out = '0' * 64, []
    for it in items:
        prev = h((prev + it).encode()); out.append(prev)
    return out
blocks = ['DOC_CREATED R/001/XI/2026 v1', 'DISPOSITION kepada kapten.andi', 'ACCESS_GRANTED kapten.andi', 'ACCESS_DENIED serka.budi']
tampered = list(blocks); tampered[1] = 'DISPOSITION kepada serka.budi'
facts = {
  'docSha256': {'value': h(src), 'cmd': 'shasum -a 256 docs/video/assets/R-001-XI-2026.txt'},
  'copySha256': {'value': h(bytes(flip)), 'cmd': 'byte 200 XOR 0x01, lalu sha256', 'byte': 200,
                 'char': [chr(src[200]), chr(flip[200])]},
  'chain': {'blocks': blocks, 'hashes': chain(blocks), 'tampered': tampered, 'tamperedHashes': chain(tampered),
            'cmd': 'hash_i = sha256(hash_{i-1} + isi_i), hash_0 = 0x00..'},
  'backendTests': {'value': 44, 'cmd': 'cd backend && npm test', 'result': 'tests 44, pass 44, fail 0'},
  'chaincodeTests': {'value': 11, 'cmd': "cd chaincode/sandichain && go test ./... -v | grep -c '--- PASS'", 'result': '11 PASS, 0 FAIL'},
  'ciJobs': {'value': 3, 'cmd': 'gh pr checks 2', 'result': 'backend pass, chaincode pass, frontend pass'},
  'grantTx': {'value': 'e4bc38b0d391f3966a6a3dae6ad17a71aca12874a4292282c9d5ae3e00af5c66', 'source': 'docs/video/tools/mock-api.mjs (DATA SIMULASI)'},
  'risk': {'serka.budi': [84, 'kritis'], 'kapten.andi': [56, 'tinggi'], 'source': 'backend/src/forensics/behavior.ts atas data mock'},
  'keyguardWindowSec': {'value': 120, 'source': 'README'},
  'rules': {'value': 7, 'source': 'backend/src/forensics/behavior.ts'},
}
(ROOT / 'facts.json').write_text(json.dumps(facts, indent=1, ensure_ascii=False))

# ---- timeline ----
lines = json.loads((ROOT / 'tools/narration.json').read_text())
dur = json.loads((ROOT / 'out/audio/durations.json').read_text())['durations']
MIN = [16, 22, 14, 44, 30, 44, 20, 22, 12, 16]
HOLD = [1.5, 1.0, 2.5, 3.0, 3.0, 4.0, 2.5, 2.0, 2.5, 5.0]
LEAD = [1.2, 0.8, 1.6, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8]   # waktu sebelum kalimat pertama
# jeda khusus (beat visual tanpa narasi) sebelum kalimat tertentu; diperbesar bila adegan di bawah minimum
EXTRA = {'S08': 1.0, 'S09': 1.0, 'S10': 1.0, 'S11': 1.2, 'S12': 1.0, 'S14': 1.0, 'S15': 1.4, 'S17': 1.6, 'S18': 2.4,
         'S20': 1.0, 'S22': 1.2, 'S24b': 0.1, 'S24c': 0.1, 'S24d': 0.1, 'S25': 1.6, 'S02': 0.6, 'S03': 0.8, 'S05': 0.8}
scenes, t = [], 0.0
for n in range(1, 11):
    ls = [l for l in lines if l[1] == n]
    gaps = [LEAD[n-1]] + [0.45 + EXTRA.get(l[0], 0) for l in ls[1:]]
    if n == 10: gaps = [LEAD[9]] + [0.32 + EXTRA.get(l[0], 0) for l in ls[1:]]
    need = sum(gaps) + sum(dur[l[0]] for l in ls) + HOLD[n-1]
    if need < MIN[n-1]:                 # sebar sisa waktu ke jeda (beat visual), bukan ke hold kosong
        spare = MIN[n-1] - need
        k = len(gaps)
        gaps = [g + spare * (0.4 if i == 0 else 0.6 / max(1, k - 1)) if k > 1 else g + spare for i, g in enumerate(gaps)]
        need = MIN[n-1]
    start, cur, sents = t, t, []
    for g, l in zip(gaps, ls):
        cur += g
        sents.append({'id': l[0], 'text': l[2], 'start': round(cur, 3), 'end': round(cur + dur[l[0]], 3), 'rel': round(cur - start, 3)})
        cur += dur[l[0]]
    t = start + need
    scenes.append({'scene': n, 'start': round(start, 3), 'end': round(t, 3), 'duration': round(need, 3), 'sentences': sents})
(ROOT / 'timeline.json').write_text(json.dumps({'fps': 30, 'total': round(t, 3), 'scenes': scenes}, indent=1, ensure_ascii=False))
for s in scenes: print(s['scene'], s['duration'], [(x['id'], x['rel']) for x in s['sentences']])
print('total', round(t, 2), 'detik =', f'{int(t//60)}:{t%60:04.1f}')
print(facts['docSha256']['value']); print(facts['copySha256']['value'])

# ---- onset frasa (dari jeda [[slnc]] di tiap klip) untuk sinkronisasi visual ----
import re as _re
tl = json.loads((ROOT / 'timeline.json').read_text())
for sc in tl['scenes']:
    for s in sc['sentences']:
        wav = ROOT / f"out/audio/sent/{s['id']}.wav"
        err = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(wav), '-af', 'silencedetect=noise=-38dB:d=0.1', '-f', 'null', '-'], capture_output=True, text=True).stderr
        ends = [float(x) for x in _re.findall(r'silence_end: ([\d.]+)', err)]
        s['phr'] = [s['rel']] + [round(s['rel'] + e, 3) for e in ends if e < (s['end'] - s['start']) - 0.15]
(ROOT / 'timeline.json').write_text(json.dumps(tl, indent=1, ensure_ascii=False))
for sc in tl['scenes']:
    for s in sc['sentences']: print(s['id'], s['phr'])
