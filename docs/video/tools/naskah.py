"""Naskah narasi untuk pengisi suara: tulis NASKAH-NARASI.md dan out/naskah-narasi.html (untuk PDF).
Pakai: python3 -I tools/naskah.py   lalu  node tools/pdf.mjs out/naskah-narasi.html NASKAH-NARASI.pdf"""
import html, json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent

# Perkiraan durasi = trek panduan Damayanti x (158/150) x 1,18 + 0,35 detik (rumus slot brief v2).
try:
    D = json.loads((ROOT / 'out/audio/durations.json').read_text())['durations']
    EST = {k: round(v * 158 / 150 * 1.18 + 0.35, 1) for k, v in D.items()}
except FileNotFoundError:
    EST = {}

SCENES = [
    ('1', 'Pembuka: kebocoran', 'Layar gelap, selembar dokumen rahasia, cap SANGAT RAHASIA jatuh, tulisan besar "SIAPA?".',
     'Pelan dan berat, seperti membuka cerita. Banyak ruang kosong.', [
        ('S01', 'Sebuah dokumen **rahasia** / bocor.', 'Pelan. Beri jeda kecil sebelum "bocor".'),
        ('S02', 'Banyak orang pernah membukanya. // **Siapa** pelakunya?', 'Nada "Siapa" turun, bukan naik. Ini pertanyaan serius, bukan heran.'),
        ('S03', 'Sekarang bayangkan, / dokumen itu **sendiri** / yang mencatat siapa saja yang membukanya.', 'Sedikit lebih terang, ada harapan.'),
    ]),
    ('2', 'Masalah', 'Log server; satu baris dihapus, nama pelaku diganti, lalu tersisa "0 BUKTI".',
     'Datar dan faktual. Biarkan gambarnya yang dramatis.', [
        ('S04', 'Di banyak sistem, / jejak akses disimpan di server / yang bisa **diubah** administratornya.', ''),
        ('S05', 'Log bisa dihapus. / Akun bisa dipinjam. // Dan setelah bocor, / penyelidikan dimulai dari **nol**.', 'Tiga pukulan pendek. Yang terakhir paling pelan.'),
    ]),
    ('3', 'Perkenalan', 'Lambang SANDI-Chain digambar garis demi garis, lalu judul dan PASUKAN BIMA.',
     'Tegak dan percaya diri. Bangga, tapi tidak keras.', [
        ('S06', 'Kami **Pasukan Bima**. // Ini **SANDI-Chain**: / integritas dan jejak akses dokumen klasifikasi, / di atas blockchain.', 'Senyum tipis di "Kami Pasukan Bima" boleh, tetap tenang.'),
    ]),
    ('4', '01 Cegah', 'Dokumen dienkripsi, hanya hash yang masuk ledger; sertifikat diperiksa chaincode; dua cap organisasi; kunci di perangkat; KeyGuard melepas kunci; penolakan jadi peringatan.',
     'Menjelaskan dengan yakin. Tempo stabil, tidak terburu-buru.', [
        ('S07', 'Pertama, **mencegah**. // File tidak pernah masuk ke blockchain. / File dienkripsi, / dan yang dicatat di ledger / hanya **sidik jarinya**.', '"Pertama, mencegah" seperti judul bab.'),
        ('S08', 'Siapa boleh membuka apa / diputuskan oleh chaincode, / berdasarkan atribut di sertifikat personel. // **Bukan** oleh aplikasi. / Dan **bukan** oleh administrator.', 'Dua "bukan" sama beratnya.'),
        ('S09', 'Setiap transaksi harus disepakati **dua** organisasi: / Mabesad atau Kodam, / dan Satuan.', ''),
        ('S10', 'Dalam mode perangkat, / tanda tangan dibuat di perangkat personel. / Kunci pribadinya / **tidak pernah** berada di server.', ''),
        ('S11', 'Kunci dokumen pun tidak dilepas begitu saja. / Ia hanya keluar jika ledger memuat catatan akses / yang **sah**, / **baru**, / dan **belum pernah** dipakai.', 'Tiga syarat diucapkan dengan ketukan rata.'),
        ('S12', 'Percobaan yang ditolak / tetap tercatat, / dan langsung menjadi peringatan / untuk unit pengamanan.', ''),
    ]),
    ('5', '02 Deteksi', 'Layar Pusat Pengamanan: skor risiko personel, tujuh aturan muncul satu per satu, bukti disorot.',
     'Analitis dan tenang, seperti analis yang yakin pada datanya.', [
        ('S13', 'Kedua, **mendeteksi**. // Sentinel membaca setiap kejadian di ledger, / lalu menghitung skor risiko tiap personel.', ''),
        ('S14', 'Ada **tujuh** aturan yang bisa dijelaskan: / penolakan beruntun, / menyisir banyak dokumen, / membuka dokumen secara massal, / akses di luar jam dinas, / dan lainnya.', 'Daftar: jangan dipercepat, setiap butir punya jeda.'),
        ('S15', 'Tidak ada kotak hitam. // Setiap skor datang bersama **buktinya**, / yang bisa diperiksa ulang di ledger.', '"Tidak ada kotak hitam" tegas, lalu berhenti penuh.'),
    ]),
    ('6', '03 Telusuri', 'Halaman PDF ber-watermark, kamera turun ke kode transaksi; kode diketik di halaman Telusuri; pembaca dan rantai aksesnya muncul.',
     'Sedikit lebih bertenaga, seperti detektif menemukan jejak.', [
        ('S16', 'Ketiga, **menelusuri**. // Setiap dokumen yang dibuka diberi watermark: / nama, / NRP, / waktu, / dan kode transaksi.', ''),
        ('S17', 'Kalau salinannya bocor, / masukkan kode itu, / atau unggah PDF-nya.', ''),
        ('S18', 'Sistem langsung menunjukkan **siapa** yang membukanya, / kapan, / lewat disposisi siapa, / dan siapa lagi yang pernah membuka dokumen yang sama.', 'Naik pelan sampai akhir kalimat.'),
    ]),
    ('7', '04 Buktikan', 'Rantai empat blok; isi satu blok diubah, hash setelahnya berubah merah; dua hash berbeda karena satu bit.',
     'Pasti dan dingin. Ini bagian "tidak bisa dibantah".', [
        ('S19', 'Keempat, **membuktikan**. // Karena jejaknya ada di ledger, / ia tidak bisa dihapus, / bahkan oleh administrator.', ''),
        ('S20', 'Dan perubahan **satu bit** saja pada sebuah salinan / akan langsung terdeteksi.', ''),
    ]),
    ('8', 'Kelayakan', 'Diagram jaringan sendiri tanpa cloud, lalu tiga langkah menuju produksi.',
     'Matang dan realistis, seperti presentasi ke pimpinan.', [
        ('S21', 'Semua komponennya dirancang berjalan di jaringan sendiri, / tanpa cloud, / termasuk di jaringan tertutup.', ''),
        ('S22', 'Jalan menuju produksi sudah kami petakan: / kunci di perangkat personel, / Vault tingkat produksi, / serta integrasi ke direktori pengguna dan SIEM yang sudah ada.', ''),
    ]),
    ('9', 'Bukti', 'Angka hasil uji naik satu per satu: 44 tes backend, 11 tes chaincode, CI 3/3 hijau.',
     'Ringan dan meyakinkan.', [
        ('S23', 'Semuanya diuji: / tes otomatis di backend dan chaincode, / dan tiga pipeline CI yang **hijau**.', ''),
    ]),
    ('10', 'Penutup', 'Empat kata besar jatuh satu per satu, lalu lambang, PASUKAN BIMA, dan nama anggota.',
     'Empat kata seperti ketukan palu. Penutup hangat.', [
        ('S24a', 'Cegah.', 'Rekam sebagai berkas sendiri. Tegas, satu kata.'),
        ('S24b', 'Deteksi.', 'Berkas sendiri.'),
        ('S24c', 'Telusuri.', 'Berkas sendiri.'),
        ('S24d', 'Buktikan.', 'Berkas sendiri. Paling final.'),
        ('S25', 'Kami **Pasukan Bima**. // Terima kasih.', '"Terima kasih" lebih lembut, tutup dengan tenang.'),
    ]),
]
PRON = [('SANDI-Chain', 'san-di cheyn'), ('blockchain', 'blok-cheyn'), ('chaincode', 'cheyn-kod'), ('ledger', 'le-jer'),
        ('watermark', 'wo-ter-mark'), ('NRP', 'en-er-pe'), ('PDF', 'pe-de-ef'), ('CI', 'si-ai'), ('SIEM', 'sim'), ('Vault', 'volt'),
        ('Sentinel', 'sen-ti-nel'), ('KeyGuard', 'ki-gard'), ('backend', 'bek-en'), ('pipeline', 'paip-lain'), ('Mabesad', 'ma-be-sad')]
TIPS = [
    'Ruangan kecil yang banyak kain: lemari baju, atau kamar dengan kasur dan gorden. Matikan kipas dan AC. Ponsel mode pesawat.',
    'Mikrofon USB atau ponsel (aplikasi perekam dengan format WAV atau lossless). Jarak mulut 15 sampai 20 cm, sedikit menyamping agar huruf "p" dan "b" tidak meletup.',
    'Format 48 kHz, 24 bit, mono. Suara paling keras sekitar -12 dBFS (indikator jangan sampai merah).',
    'Minum air putih, jangan susu atau kopi sebelum rekaman. Berdiri lebih baik daripada duduk.',
    'Rekam 2 sampai 3 take per kalimat. Diam 1 detik sebelum dan sesudah bicara.',
    'Nama berkas: S07_t1.wav, S07_t2.wav, dan seterusnya (S24a sampai S24d masing-masing satu berkas). Simpan di docs/video/vo/raw/.',
    'Kalau salah di tengah kalimat, ulangi dari awal kalimat itu saja. Tidak perlu mengulang dari awal naskah.',
    'Durasi di naskah hanya perkiraan. Bicara dengan tempo yang nyaman; film akan menyesuaikan panjang suaramu.',
]
STYLE = ('Gaya: narator film dokumenter, bukan pembaca berita. Suara rendah, tenang, tempo sedang. '
         'Jeda adalah tenaga: berhenti penuh setelah kalimat pendek. Tidak berteriak, tidak berlebihan.')
LEGEND = '`/` = jeda pendek (napas kecil) · `//` = jeda panjang (sekitar 1 detik) · **tebal** = kata yang ditekankan'

plain = lambda s: re.sub(r'\*\*(.+?)\*\*', r'\1', s)
md = ['# Naskah narasi: SANDI-Chain, PASUKAN BIMA', '',
      'Untuk pengisi suara film presentasi Kartika Cyber Hackathon 2026. Suara laki-laki.', '',
      f'**{STYLE}**', '', f'Tanda: {LEGEND}', '']
total = sum(EST.values()) if EST else 0
if total: md += [f'Perkiraan total suara: sekitar {int(total // 60)} menit {int(total % 60)} detik (film sekitar 4 menit, sisanya gambar dan efek suara).', '']
for no, name, screen, mood, lines in SCENES:
    md += [f'## Adegan {no}: {name}', '', f'*Di layar:* {screen}  ', f'*Suasana:* {mood}', '',
           '| ID | Kalimat | Durasi | Catatan |', '|---|---|---|---|']
    for sid, text, note in lines:
        md.append(f'| {sid} | {text} | ±{EST.get(sid, "?")} s | {note} |')
    md.append('')
md += ['## Cara melafalkan', '', '| Tertulis | Ucapkan |', '|---|---|'] + [f'| {a} | {b} |' for a, b in PRON] + ['']
md += ['## Cara merekam', ''] + [f'{i}. {t}' for i, t in enumerate(TIPS, 1)] + ['']
(ROOT / 'NASKAH-NARASI.md').write_text('\n'.join(md))

# HTML untuk dicetak (A4)
b = lambda s: re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', html.escape(s)).replace('//', '<span class="p2">//</span>').replace(' / ', ' <span class="p1">/</span> ')
fonts = (ROOT / 'film/fonts.css').read_text()
H = [f'<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Naskah narasi SANDI-Chain</title><style>{fonts}',
     '''@page { size: A4; margin: 16mm 15mm 16mm; }
body { font-family: 'Plus Jakarta Sans'; color: #1b2016; font-size: 10.5pt; line-height: 1.5; margin: 0; }
h1 { font-family: 'Barlow Condensed'; font-weight: 700; font-size: 30pt; letter-spacing: .02em; text-transform: uppercase; margin: 0 0 2mm; line-height: 1; }
h1 span { color: #46562a; }
.sub { color: #555d4c; margin-bottom: 5mm; }
.box { border: 1px solid #d6d9cf; border-left: 4px solid #46562a; border-radius: 6px; padding: 3mm 4mm; margin-bottom: 3mm; background: #f6f7f2; }
h2 { font-family: 'Barlow Condensed'; font-weight: 700; font-size: 17pt; text-transform: uppercase; letter-spacing: .03em; margin: 7mm 0 1mm; border-bottom: 2px solid #1b2016; padding-bottom: 1mm; break-after: avoid; }
h2 i { font-style: normal; color: #a07a12; margin-right: 3mm; }
.meta { color: #555d4c; font-size: 9.5pt; margin-bottom: 2mm; break-after: avoid; }
table { width: 100%; border-collapse: collapse; }
tr { break-inside: avoid; }
td { vertical-align: top; padding: 2.4mm 2mm; border-bottom: 1px solid #e2e4dc; }
td.id { font-family: 'IBM Plex Mono'; font-weight: 500; width: 13mm; color: #46562a; }
td.tx { font-size: 13pt; line-height: 1.55; }
td.tx b { font-weight: 700; text-decoration: underline; text-decoration-color: #a9b665; text-underline-offset: 3px; text-decoration-thickness: 2px; }
td.du { font-family: 'IBM Plex Mono'; width: 15mm; color: #555d4c; white-space: nowrap; }
td.no { width: 48mm; color: #555d4c; font-size: 9.5pt; }
.p1 { color: #a07a12; font-weight: 700; } .p2 { color: #c0392b; font-weight: 700; }
.two { display: grid; grid-template-columns: 1fr 1.4fr; gap: 6mm; break-inside: avoid; }
.two table td { padding: 1.2mm 2mm; } ol { margin: 0; padding-left: 5mm; } li { margin-bottom: 1.5mm; }
.mono { font-family: 'IBM Plex Mono'; }
</style></head><body>''',
     '<h1>Naskah narasi <span>· SANDI-Chain</span></h1>',
     '<div class="sub">PASUKAN BIMA · Kartika Cyber Hackathon 2026 · untuk pengisi suara (laki-laki)</div>',
     f'<div class="box"><b>Gaya.</b> {html.escape(STYLE[6:])}</div>',
     '<div class="box"><span class="p1">/</span> jeda pendek (napas kecil) &nbsp;·&nbsp; <span class="p2">//</span> jeda panjang (±1 detik) &nbsp;·&nbsp; <b style="text-decoration:underline;text-decoration-color:#a9b665;text-decoration-thickness:2px">tebal</b> kata yang ditekankan'
     + (f' &nbsp;·&nbsp; total suara ±{int(total // 60)}:{int(total % 60):02d}' if total else '') + '</div>']
for no, name, screen, mood, lines in SCENES:
    H.append(f'<h2><i>{no.zfill(2)}</i>{html.escape(name)}</h2><div class="meta"><b>Di layar:</b> {html.escape(screen)}<br><b>Suasana:</b> {html.escape(mood)}</div><table>')
    for sid, text, note in lines:
        H.append(f'<tr><td class="id">{sid}</td><td class="tx">{b(text)}</td><td class="du">±{EST.get(sid, "?")} s</td><td class="no">{html.escape(note)}</td></tr>')
    H.append('</table>')
H.append('<h2><i>··</i>Lafal dan cara merekam</h2><div class="two"><table>' + ''.join(f'<tr><td>{a}</td><td class="mono">{c}</td></tr>' for a, c in PRON)
         + '</table><ol>' + ''.join(f'<li>{html.escape(t)}</li>' for t in TIPS) + '</ol></div></body></html>')
(ROOT / 'out').mkdir(exist_ok=True)
(ROOT / 'out/naskah-narasi.html').write_text('\n'.join(H))
print('ok', len(sum((s[4] for s in SCENES), [])), 'kalimat, total', round(total, 1), 's')
