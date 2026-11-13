"""Rekam narasi Damayanti per kalimat, ukur durasinya. Pakai: python3 -I tools/tts.py [rate]"""
import json, subprocess, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
rate = sys.argv[1] if len(sys.argv) > 1 else '158'
out = ROOT / 'out/audio/sent'
out.mkdir(parents=True, exist_ok=True)
lines = json.loads((ROOT / 'tools/narration.json').read_text())
dur = {}
for sid, scene, shown, tts in lines:
    aiff, wav = out / f'{sid}.aiff', out / f'{sid}.wav'
    subprocess.run(['say', '-v', 'Damayanti', '-r', rate, '-o', str(aiff), tts], check=True)
    # pangkas hening di awal/akhir supaya sinkronisasi presisi
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(aiff), '-ar', '48000', '-ac', '1',
                    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
                    str(wav)], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(wav)],
                             capture_output=True, text=True, check=True).stdout)
    dur[sid] = round(d, 3)
    aiff.unlink()
(ROOT / 'out/audio/durations.json').write_text(json.dumps({'rate': int(rate), 'durations': dur}, indent=1))
print(f'rate {rate}: {len(dur)} klip, total {sum(dur.values()):.1f} s')
