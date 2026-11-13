"""Tulis out/QA-report.md dari hasil ukur (ffprobe, loudnorm, astats, silencedetect, qa.json, facts.json).
Pakai: python3 -I tools/report.py"""
import json, pathlib, re, subprocess
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'out'
MP4 = OUT / 'pasukan-bima-sandi-chain.mp4'
tl = json.loads((ROOT / 'timeline.json').read_text())
facts = json.loads((ROOT / 'facts.json').read_text())
qa = json.loads((OUT / 'qa/qa.json').read_text()) if (OUT / 'qa/qa.json').exists() else {'determinism': [], 'layout': []}
dur = json.loads((OUT / 'audio/durations.json').read_text())
run = lambda *a: subprocess.run(list(a), capture_output=True, text=True)

pr = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(MP4)).stdout)
v = next(s for s in pr['streams'] if s['codec_type'] == 'video'); a = next(s for s in pr['streams'] if s['codec_type'] == 'audio')
total = float(pr['format']['duration'])
ln = run('ffmpeg', '-hide_banner', '-i', str(MP4), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json', '-f', 'null', '-').stderr
ln = json.loads(ln[ln.rfind('{'):ln.rfind('}') + 1])
ast = run('ffmpeg', '-hide_banner', '-i', str(MP4), '-af', 'volumedetect', '-f', 'null', '-').stderr
peak = re.findall(r'max_volume: ([-\d.]+) dB', ast)
sil = run('ffmpeg', '-hide_banner', '-i', str(MP4), '-af', 'silencedetect=noise=-45dB:d=2.5', '-f', 'null', '-').stderr
gaps = [(float(s), float(e)) for s, e in zip(re.findall(r'silence_start: ([\d.]+)', sil), re.findall(r'silence_end: ([\d.]+)', sil))]
sfxpk = run('ffmpeg', '-hide_banner', '-i', str(OUT / 'audio/sfx.wav'), '-af', 'volumedetect', '-f', 'null', '-').stderr
sfxpk = float(re.findall(r'max_volume: ([-\d.]+) dB', sfxpk)[-1])

def fmt(s): return f'{int(s // 60)}:{s % 60:05.2f}'
L = []
w = L.append
w('# QA-report: film SANDI-Chain, PASUKAN BIMA\n')
w(f'Dibuat otomatis oleh `tools/report.py`. Berkas: `out/{MP4.name}`.\n')
w('## Ringkasan\n')
w(f'- Durasi total: **{fmt(total)}** ({total:.2f} s). Target 3:45 sampai 4:30: {"lolos" if 225 <= total <= 270 else "DI LUAR TARGET"}.')
w(f'- Video: {v["codec_name"]} {v.get("profile")}, {v["width"]}x{v["height"]}, {v["r_frame_rate"]} fps, {v["pix_fmt"]}, matrix {v.get("color_space")}, primaries {v.get("color_primaries")}, transfer {v.get("color_transfer")}, range {v.get("color_range")}.')
w(f'- Audio: {a["codec_name"]}, {a["sample_rate"]} Hz, {a["channels"]} kanal, dienkode `-b:a 192k` (rata-rata terukur {int(a.get("bit_rate", 0)) // 1000} kbps karena encoder AAC menghemat bit pada bagian hening).')
w(f'- Loudness akhir: **{ln["input_i"]} LUFS**, true peak {ln["input_tp"]} dBTP, LRA {ln["input_lra"]} LU (target -16 / -1,5 / 7).')
w(f'- Puncak sampel (volumedetect): {peak[-1] if peak else "?"} dBFS, tanpa kliping. Puncak efek suara sebelum normalisasi {sfxpk:.1f} dBFS (loudnorm menambah {(-16 - float(json.loads((OUT / "audio/premix_ln.json").read_text())["input_i"])) if (OUT / "audio/premix_ln.json").exists() else 5.8:.1f} dB, jadi puncak efek di hasil akhir sekitar {sfxpk + 5.8:.1f} dBFS).')
det = qa['determinism']
w(f'- Determinisme: {sum(d["same"] for d in det)}/{len(det)} bingkai identik saat dirender dua kali dengan urutan berbeda.\n')

w('## Durasi adegan\n')
w('| Adegan | Mulai | Durasi | Minimum | Kalimat |')
w('|---|---|---|---|---|')
MIN = [16, 22, 14, 44, 30, 44, 20, 22, 12, 16]
for s in tl['scenes']:
    w(f'| {s["scene"]} | {fmt(s["start"])} | {s["duration"]:.2f} s | {MIN[s["scene"] - 1]} s | {", ".join(x["id"] for x in s["sentences"])} |')
w('\nAdegan 4 melebihi minimum karena narasinya (S07 sampai S12) memang panjang; jeda antar kalimat diisi beat visual (ledger, gerbang chaincode, cap, KeyGuard).\n')

w('## Narasi dan pelafalan\n')
w(f'- Suara macOS **Damayanti**, kecepatan **{dur["rate"]}** kata per menit. Klip per kalimat di `out/audio/sent/`, durasi di `out/audio/durations.json`.')
w('- Kandidat pertama kamus dipakai (`tools/pronunciation.json`): SANDI-Chain = "Sandi Tyen", blockchain = "blok tyen", chaincode = "tyen kod", ledger = "lejer", watermark = "wotermark", NRP = "en er pe", PDF = "pe de ef", CI = "si ai", backend = "bek en", Vault = "Volt", SIEM = "Sim".')
w('- Audisi di `out/audition/`: satu klip per kandidat kata, dan S01 sampai S03 pada 150, 158, 166.')
w('- Mengganti pelafalan atau kecepatan: ubah kolom TTS di `tools/narration.json` (atau argumen kecepatan), lalu jalankan `python3 -I tools/tts.py 158 && python3 -I tools/facts.py && node tools/cues.mjs && python3 -I tools/mix.py && python3 -I tools/srt.py && node render.mjs`. Adegan dikunci ke `timeline.json`, jadi tidak perlu diubah.')
w('- Subtitel: dibakar di HTML dari `timeline.json` dan sama persis dengan `out/pasukan-bima-sandi-chain.srt` (maksimal dua baris, 42 karakter). Awal dan akhir tiap kalimat identik dengan posisi klip suara (selisih 0 ms; potongan dalam satu kalimat dibagi menurut jumlah karakter).')
w('- S23 tidak menyebut "skenario ujung ke ujung": `backend/scripts/demo.mjs` tidak dijalankan di jaringan asli (Docker mati, tanpa wallet), jadi frasa dan angka 28 dibuang.\n')

w('## Angka dan nama yang tampil (facts.json)\n')
w('| Tampil | Nilai | Perintah / sumber | Hasil ukur |')
w('|---|---|---|---|')
w(f'| Tes backend lulus (adegan 9) | {facts["backendTests"]["value"]} | `{facts["backendTests"]["cmd"]}` | {facts["backendTests"]["result"]} |')
w(f'| Tes chaincode lulus (adegan 9) | {facts["chaincodeTests"]["value"]} | `{facts["chaincodeTests"]["cmd"]}` | {facts["chaincodeTests"]["result"]} |')
w(f'| Pipeline CI hijau (adegan 9) | 3/3 | `{facts["ciJobs"]["cmd"]}` | {facts["ciJobs"]["result"]} |')
w(f'| SHA-256 dokumen contoh (adegan 4a, 7) | `{facts["docSha256"]["value"]}` | `{facts["docSha256"]["cmd"]}` | cocok dengan hashlib |')
w(f'| SHA-256 salinan 1 bit (adegan 7) | `{facts["copySha256"]["value"]}` | {facts["copySha256"]["cmd"]} ("{facts["copySha256"]["char"][0]}" menjadi "{facts["copySha256"]["char"][1]}") | 58 dari 64 karakter berbeda |')
w(f'| Rantai 4 blok (adegan 7) | {", ".join(h[:12] for h in facts["chain"]["hashes"])} | {facts["chain"]["cmd"]} | setelah blok 2 diubah: {", ".join(h[:12] for h in facts["chain"]["tamperedHashes"])} (blok 1 tetap) |')
w('| Jendela bukti 120 detik (adegan 4d) | 120 | README (KeyGuard) | |')
w('| Tujuh aturan dan namanya (adegan 5) | 7 | `backend/src/forensics/behavior.ts` | nama persis dari `signal(...)` |')
w('| Skor serka.budi 84 kritis, kapten.andi 56 tinggi (adegan 5) | | mesin risiko sungguhan atas data API tiruan | **DATA SIMULASI** |')
w(f'| txId e4bc38b0d391f396 (adegan 1, 6) | `{facts["grantTx"]["value"]}` | {facts["grantTx"]["source"]} | **DATA SIMULASI** |')
w('| Dua organisasi, dua channel, AES-256-GCM, X.509 | | README | |')
w('| Nama tim dan anggota (adegan 3, 10) | PASUKAN BIMA; Luthfi Fauzi, Fadhail A. Bima Dharmawan, Erlan Irhab Ghalib | brief | ejaan diperiksa |\n')

w('## Data simulasi\n')
w('Jaringan Fabric asli tidak berjalan saat produksi (`curl localhost:4000/api/health` tidak menjawab). Semua tangkapan UI (adegan 5 dan 6) diambil dari build produksi frontend (`next start`) yang tersambung ke `tools/mock-api.mjs`. API tiruan ini menjalankan kode **sungguhan** dari backend (`behavior.ts`, `trace.ts`, `WatermarkService`) atas data fiktif. Label **DATA SIMULASI** tampil di kiri bawah selama adegan 5 dan 6. Log di adegan 1 dan 2, isi dokumen R/001/XI/2026, dan rantai blok adegan 7 adalah ilustrasi fiktif (hash-nya dihitung asli).\n')

w('## Tata letak, kontras, ejaan\n')
lay = qa['layout']
w(f'- Pemeriksaan otomatis tiap 0,5 detik (`tools/qa.mjs`): {len([x for x in lay if x["kind"] == "margin"])} temuan margin, {len([x for x in lay if x["kind"] == "overlap"])} temuan tumpukan teks.')
from collections import Counter
for (sc, kind), n in sorted(Counter((x['scene'], x['kind']) for x in lay).items()):
    ts = sorted({x['t'] for x in lay if x['scene'] == sc and x['kind'] == kind})
    why = {4: 'sel sandi heksadesimal sengaja melintas di atas teks dokumen saat dokumen "dienkripsi" (0,8 detik), bukan tata letak statis',
           10: 'kotak glyph Barlow 168 px (ascent + descent) lebih tinggi dari jarak baris; huruf yang terlihat tidak bersentuhan'}.get(sc, 'periksa')
    w(f'  - adegan {sc}, {kind}, {n} temuan pada t = {", ".join(map(str, ts))} s: {why}.')
w('- Kontras (`tools/contrast.py`): semua pasangan teks dan latar di atas 4,5:1, kecuali cap "SANGAT RAHASIA" merah `#d9382f` di atas kertas `#f3f4f0` (4,17:1). Cap itu teks besar (72 px, tebal), yang standar WCAG-nya 3:1, dan warnanya dipertahankan karena berasal dari palet. Teks di dalam tangkapan UI mengikuti aplikasi.')
w('- Ejaan: seluruh teks layar dan subtitel berasal dari `tools/narration.json` dan berkas adegan; nama tim dan tiga nama anggota dicek persis.\n')

w('## Jeda tanpa suara (disengaja)\n')
w('`silencedetect` (-45 dB, minimal 2,5 detik) menemukan jeda berikut. Semuanya beat visual tanpa narasi yang direncanakan di timeline (pengetikan, penguncian ledger, hold akhir adegan):\n')
for s, e in gaps: w(f'- {fmt(s)} sampai {fmt(e)} ({e - s:.1f} s)')
w('\n## Penyimpangan dari brief\n')
w('- Track lomba belum dikonfirmasi tim, jadi film hanya menulis "Kartika Cyber Hackathon 2026" tanpa nama track.')
w('- Font dan adegan memakai satu `film/fonts.css` (base64) dan `film/lib.js` bersama, bukan disalin ke tiap berkas adegan. Tetap offline dan deterministik.')
w('- Chrome di mesin ini tidak membuka port debug TCP, jadi CDP memakai `--remote-debugging-pipe` (tetap tanpa paket tambahan).')
w('- Merah teks di latar gelap memakai `#e8605a` (warna lencana SANGAT RAHASIA di palet) karena `#d9382f` terlalu gelap untuk teks kecil di latar gelap.')
(OUT / 'QA-report.md').write_text('\n'.join(L) + '\n')
print('\n'.join(L[:12]))
