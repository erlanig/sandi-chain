"""Susun narasi menurut timeline.json, sintesis efek suara (numpy), lalu filter + loudnorm dua-pass.
Pakai: python3 -I tools/mix.py   -> out/audio/mix.wav (48 kHz stereo)"""
import json, pathlib, subprocess, wave
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
SR = 48000
tl = json.loads((ROOT / 'timeline.json').read_text())
cues = json.loads((ROOT / 'out/audio/cues.json').read_text())
N = int(round(tl['total'] * SR)) + SR
voice = np.zeros(N); sfx = np.zeros(N)

def read(p):
    with wave.open(str(p)) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        return a if w.getnchannels() == 1 else a.reshape(-1, w.getnchannels()).mean(1)

for sc in tl['scenes']:
    for s in sc['sentences']:
        a = read(ROOT / f"out/audio/sent/{s['id']}.wav")
        i = int(round(s['start'] * SR)); voice[i:i + len(a)] += a

rng = np.random.default_rng(7)
t_ = lambda d: np.arange(int(d * SR)) / SR
def lp(x, fc):  # satu-kutub, cukup untuk semburan noise
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); acc = 0.0
    for k in range(len(x)): acc = (1 - a) * x[k] + a * acc; y[k] = acc
    return y
def env(n, att=0.002, dec=0.1):
    tt = np.arange(n) / SR
    return np.minimum(1, tt / att) * np.exp(-tt / dec)
def stamp(soft=False):
    tt = t_(0.25)
    thud = np.sin(2 * np.pi * 70 * tt) * env(len(tt), 0.003, 0.07)
    nz = lp(rng.standard_normal(len(tt)), 400) * env(len(tt), 0.001, 0.035) * 3
    x = thud + nz
    return x * (0.6 if soft else 1)
def tick():
    tt = t_(0.012); return np.sin(2 * np.pi * 2400 * tt) * env(len(tt), 0.0005, 0.003)
def key():
    tt = t_(0.02); return (np.sin(2 * np.pi * 3200 * tt) * env(len(tt), 0.0004, 0.002)) * 0.45
def lock():
    tt = t_(0.12); return np.sin(2 * np.pi * 95 * tt) * env(len(tt), 0.002, 0.03) + 0.3 * np.sin(2 * np.pi * 190 * tt) * env(len(tt), 0.001, 0.015)
def release():
    a = tick() * 0.8; g = np.zeros(int(0.07 * SR)); return np.concatenate([a, g[:len(g) - len(a)], tick() * 0.6])
def tone(f, d=0.12):
    tt = t_(d); e = np.minimum(1, tt / 0.01) * np.minimum(1, (d - tt) / 0.03); return np.sin(2 * np.pi * f * tt) * e
def alert():
    return np.concatenate([tone(880), np.zeros(int(0.04 * SR)), tone(660)])
def alert1():
    return tone(660, 0.1) * 0.8
GEN = {'stamp': stamp, 'stamp_soft': lambda: stamp(True), 'tick': tick, 'key': key, 'lock': lock, 'release': release, 'alert': alert, 'alert1': alert1}
LEVEL = {'stamp': -29, 'stamp_soft': -33, 'tick': -37, 'key': -41, 'lock': -33, 'release': -35, 'alert': -31, 'alert1': -35}  # -6 dB: loudnorm menaikkan ~+5,8 dB
for q in cues:
    x = GEN[q['type']]()
    x = x / (np.abs(x).max() + 1e-9) * 10 ** (LEVEL[q['type']] / 20)
    i = int(round(q['t'] * SR)); sfx[i:i + len(x)] += x[: max(0, N - i)]

def write(p, x, ch=1):
    x = np.clip(x, -1, 1); d = (x * 32767).astype(np.int16)
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes())
out = ROOT / 'out/audio'
write(out / 'voice.wav', voice)
write(out / 'sfx.wav', sfx)

# narasi: highpass, lowpass, kompresor; tambah SFX (puncak <= -22 dBFS setelah normalisasi relatif); loudnorm dua-pass
chain = 'highpass=f=70,lowpass=f=9500,acompressor=threshold=-20dB:ratio=2.2:attack=8:release=120'
pre = out / 'premix.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(out / 'voice.wav'), '-i', str(out / 'sfx.wav'), '-filter_complex',
                f'[0:a]{chain}[v];[v][1:a]amix=inputs=2:normalize=0:duration=longest,atrim=0:{tl["total"]:.3f}', str(pre)], check=True)
LN = 'loudnorm=I=-16:TP=-1.5:LRA=7'
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(pre), '-af', LN + ':print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
m = json.loads(r[r.rfind('{'):r.rfind('}') + 1])
ln2 = f"{LN}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(pre), '-af', ln2 + ',aresample=48000', '-ac', '2', '-ar', '48000', str(out / 'mix.wav')], check=True)
print('pass1', m['input_i'], m['input_tp'])
