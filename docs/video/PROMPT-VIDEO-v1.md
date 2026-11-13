Buat film presentasi untuk Kartika Cyber Hackathon 2026. Ikuti brief ini persis. Langsung kerjakan tanpa meminta konfirmasi. Berhenti hanya jika (a) ada alat yang harus dipasang, atau (b) sebuah fakta wajib tidak bisa diverifikasi.

# Brief film: SANDI-Chain, oleh PASUKAN BIMA

## 0. Aturan kerja

- Semua berkas kerja ada di `docs/video/`. Hasil render ke `docs/video/out/` (sudah di-gitignore, jangan di-commit).
- Jangan ubah kode aplikasi (`frontend/`, `backend/`, `chaincode/`) dan jangan jalankan `brand-intake` atau mengubah `CLAUDE.md`. Brand dan aturan gerak sudah ada di bagian 4 dan 5.
- Pakai hanya alat yang sudah ada: ffmpeg 7.1 (libx264, aac), Google Chrome, Node 23 (WebSocket bawaan, tanpa paket tambahan), Python dengan Pillow dan numpy, `pdftoppm`, dan perintah `say` macOS. Jika butuh paket lain, berhenti dan tulis apa yang diperlukan sebelum memasang apa pun.
- Jangan kirim naskah atau aset ke layanan luar, dan jangan unduh aset. Semua berjalan offline.
- Konvensi teknis diambil dari skill `motion-effects`: satu jam deterministik `window.seek(detik)`, mode `?render`, font dimuat eksplisit sebelum frame pertama. Baca `~/.claude/skills/motion-effects/SKILL.md` bagian "Build it" sebelum membangun.

## 1. The bar

Film profil lembaga yang tenang, presisi, dan mahal, setara materi presentasi pameran teknologi pertahanan yang dikerjakan studio sungguhan. Jika tidak layak diputar di ruang rapat pimpinan, belum selesai.

## 2. Format

- 1920 x 1080, 30 fps konstan. Durasi target 3:45 sampai 4:30 (batas keras 3:15 sampai 4:50). Jumlah durasi minimum adegan di bagian 9 sudah 4:00.
- Bukan loop. Setiap adegan berhenti (hold) di keadaan akhirnya, tidak mereset.
- H.264 High, yuv420p, bt709, rentang terbatas, `-crf 16`, `-movflags +faststart`. Audio AAC 192 kbps, 48 kHz, stereo.
- Subtitel Bahasa Indonesia: dibakar ke video, dan juga berkas `.srt` terpisah. Tanpa musik latar.

## 3. The one rule

Satu adegan, satu benda utama, satu perubahan. Benda utama mengisi 60 sampai 70% bingkai. Tidak ada dua fokus sekaligus. Kata pertama kalimat narasi harus jatuh bersamaan dengan perubahan visual pertamanya (selisih maksimal 0,3 detik).

## 4. Look

**Warna** (semua hex berasal dari `frontend/src/app/globals.css` dan `frontend/src/components/kit.tsx`, jangan menebak hex lain):

| Peran | Hex |
|---|---|
| Latar utama (hijau tua) | `#0d170f`, lapisan `#161b14` |
| Teks terang | `#ecebe0`, redup `rgba(236,235,224,0.6)`, garis tipis `rgba(236,235,224,0.12)` |
| Kertas dokumen | `#f3f4f0`, teks di atasnya `#1b2016` |
| Aksen utama (khaki) | `#a9b665`, olive `#46562a` |
| Merah | `#d9382f`, merah lambang `#e04a3f` |
| Emas (hanya garis, nomor, detail) | `#d4a72c`, terang `#f1cf6a` |
| Lencana klasifikasi (hanya untuk lencana) | BIASA `#74b57f`, TERBATAS `#6fa8dc`, RAHASIA `#e29245`, SANGAT RAHASIA `#e8605a` dengan teks putih |

Maksimal dua aksen per adegan (khaki ditambah satu warna lain).

**Font** (berkas ada di `frontend/src/fonts/`, sematkan sebagai base64 ke HTML): Barlow Condensed 700 untuk judul huruf kapital dengan tracking 0,02em, Plus Jakarta Sans 400/500/600/700 untuk teks, IBM Plex Mono 400/500 untuk log, hash, dan txId. Hanya tiga keluarga ini. Muat dengan `document.fonts.load` sebelum `seek(0)`.

**Ukuran:** judul adegan 96 sampai 140 px, kata besar 160 px ke atas, teks sekunder minimal 34 px, label mono minimal 28 px, subtitel 38 px. Margin aman 120 px kiri-kanan dan 80 px atas-bawah. Subtitel di zona y 940 sampai 1040. Komposisi tenang dan simetris, ruang kosong disengaja tetapi benda utama selalu besar.

**Logo:** `docs/video/assets/sandi-logo.svg` (variabel CSS `--logo-red`, `--logo-wing`, `--logo-gold`, sudah diset untuk latar gelap). Muncul hanya di adegan 3 dan 10. Tidak ada logo permanen di pojok.

**Benda dan bahan:** selembar dokumen A4 dengan isi teks fiktif yang nyata (bukan bar abu-abu), cap karet bergaris ganda, baris log mono, rantai blok persegi panjang berisi hash, kartu sertifikat. UI memakai tangkapan **aplikasi sungguhan** (tema gelap, sudut 16 px, bayangan lembut, tanpa bingkai jendela palsu).

**Data UI:** jika jaringan asli berjalan (`curl localhost:4000/api/health` menjawab ok), rekam dari sana. Jika tidak, jalankan API tiruan `docs/video/tools/mock-api.mjs` (petunjuk di kepala berkasnya) dan tampilkan label **"DATA SIMULASI"** (mono 28 px, kiri bawah, selama adegan UI tampil). Jangan pernah menyamarkan data tiruan sebagai data asli.

## 5. Motion

- **Satu jam.** Setiap frame dihitung dari waktu saja lewat `window.seek(detik)`. Tanpa CSS animation yang jalan sendiri, tanpa `setTimeout`, tanpa `Math.random` yang tidak di-seed. URL berakhiran `?render` menghentikan jam.
- **Gerak fisik, bukan efek.** Cap jatuh dengan overshoot 3 sampai 4% dan bayangan menegang (6 frame). Garis tinta ditarik dengan `stroke-dashoffset`. Blok ledger masuk dari kanan, lalu mengunci (snap 2 px dan garis kunci). Kamera hanya dolly lambat, maksimal 4% skala per adegan, tanpa goyangan.
- **Easing.** Spring berpegas kecil untuk benda, easeOutCubic atau easeInOutCubic untuk garis. Linear hanya untuk kamera dan progress bar.
- **Transisi antar adegan:** match-cut atau benda yang berubah bentuk (misalnya kursor berkedip menjadi garis pertama sayap lambang). Crossfade polos dilarang, kecuali fade ke hitam di akhir film.
- **Hold dan hidup kecil.** Tiap beat menahan keadaan akhir minimal 1,2 detik, dengan satu elemen kecil tetap hidup (kursor berkedip atau garis tipis berjalan) tanpa mengambil fokus.
- **Stagger** 4 sampai 6 frame untuk elemen berderet. **Ghost** jejak samar posisi awal pada setiap transformasi.
- **Teks masuk** kata demi kata dengan mask-slide naik 12 px, bukan fade satu kalimat.
- **Ritme berganti:** adegan padat (diagram, UI) diselingi adegan lega (satu kalimat besar) supaya tidak monoton.

## 6. Never

Gradien blob, bokeh, orb bercahaya, partikel, lens flare, hujan kode, nuansa neon siberpunk, kisi heksagon. Gambar gembok, perisai, bola dunia, otak, robot, atau peretas berkerudung. Ikon stok, emoji, clip art. Wajah atau orang hasil AI, orang sungguhan, dan rekaman stok. Logo merek lain (Hyperledger, Docker, Vault, dan sebagainya): tulis namanya sebagai teks saja. Lambang, seragam, atau atribut TNI, TNI AD, atau Pussiberad. Angka yang tidak ada di bagian 8, atau UI yang tidak ada di aplikasi. Bar abu-abu pengganti teks. Teks di bawah ukuran minimal, atau teks di atas latar ramai tanpa panel padat. Lebih dari dua aksen. Easing memantul, whip pan, goyangan kamera, crossfade polos. Whoosh, riser, atau musik stok. Efek pada suara narasi (reverb, pitch). Klaim mutlak seperti "tidak bisa ditembus". Kata "AI" (mesin risikonya berbasis aturan, bukan AI).

## 7. Narasi dan audio

**Suara: macOS `Damayanti` (id_ID).** Ini suara kompak, jadi naskah ditulis untuknya: kalimat maksimal 20 kata, angka dan singkatan dieja, tanda baca dipakai untuk irama.

Pipeline per kalimat:

```bash
say -v Damayanti -r 158 -o s01.aiff "<teks TTS>"      # sisipkan [[slnc 180]] setelah koma pada kalimat panjang
ffmpeg -i s01.aiff -ar 48000 -ac 1 s01.wav
```

Gabungkan semua kalimat dengan jeda 0,45 detik antar kalimat dan 0,8 detik antar adegan, lalu satu kali: `highpass=f=70`, `lowpass=f=9500`, `acompressor=threshold=-20dB:ratio=2.2:attack=8:release=120`, lalu `loudnorm` dua-pass ke **-16 LUFS, TP -1,5 dBTP, LRA 7**. Jangan beri reverb atau pitch.

Durasi tiap kalimat diukur dengan `ffprobe`. Hasilnya ditulis ke `timeline.json` (mulai dan selesai tiap kalimat dan adegan). **Semua animasi dikunci ke `timeline.json`**, bukan ke angka detik yang dikarang: durasi adegan = durasi narasinya + jeda hold adegan itu (bagian 9).

**Kamus pelafalan** (tulis ulang hanya di teks TTS, layar tetap memakai ejaan asli). Simpan di `pronunciation.json`:

| Tertulis | Teks TTS (kandidat pertama, lalu cadangan) |
|---|---|
| SANDI-Chain | "Sandi Tyen"; cadangan "Sandi Cheyn", "Sandi Chain" |
| blockchain | "blok tyen"; cadangan "blokcheyn" |
| chaincode | "tyen kod" |
| SHA-256 | "es ha dua lima enam" |
| AES-256-GCM | "a e es dua lima enam ji si em" |
| X.509 | "iks lima nol sembilan" |
| NRP | "en er pe" |
| PDF | "pe de ef" |
| CI | "si ai" |
| Fabric | "Fébrik" |
| Vault | "Volt" |
| SIEM | "Sim" |
| ledger | "lejer" |
| watermark | "wotermark" |
| backend | "bek en" |
| PASUKAN BIMA | "Pasukan Bima" |

Karena yang menilai pelafalan adalah telinga manusia, buat folder `out/audition/` berisi satu klip pendek untuk setiap kata kamus dengan tiap kandidat, dan satu klip kalimat S01 sampai S03 pada tiga kecepatan (150, 158, 166). Lanjutkan membangun dengan kandidat pertama dan kecepatan 158, lalu daftarkan pilihan itu di `QA-report.md` agar bisa diganti dan dirender ulang tanpa mengubah adegan.

**Efek suara** (sintesis sendiri dengan numpy atau ffmpeg `lavfi`, tanpa berkas unduhan), puncaknya paling keras -22 dBFS dan selalu di bawah narasi:

| Cue | Suara |
|---|---|
| Cap jatuh | dentum sinus 70 Hz meluruh ditambah semburan noise lolos-rendah 400 Hz, 0,25 detik |
| Baris ledger masuk | klik 12 ms, 2,4 kHz, meluruh cepat |
| Blok mengunci | dentum rendah pendek |
| Kunci dilepas | klik ganda tipis |
| Peringatan | dua nada lembut 880 Hz lalu 660 Hz, masing-masing 120 ms |

**Gaya bahasa naskah:** "kami", kalimat aktif, tidak terlalu formal tetapi tidak gaul, tanpa istilah teknis yang tidak dijelaskan. Kalimat pendek yang tegas diselingi satu kalimat yang lebih panjang untuk ritme.

## 8. Fakta yang boleh tampil

Hanya ini. Angka dalam kurung **diukur ulang saat render** dan ditulis beserta perintahnya di `QA-report.md`. Jika tidak bisa diverifikasi, buang elemennya.

| Fakta | Sumber |
|---|---|
| Empat tingkat klasifikasi: BIASA, TERBATAS, RAHASIA, SANGAT RAHASIA | README |
| Dua channel: `ch-umum` (BIASA, TERBATAS), `ch-rahasia` (RAHASIA, SANGAT RAHASIA) | README |
| Dua organisasi: Org1 (Mabesad/Kodam), Org2 (Satuan), keduanya harus menyetujui transaksi | README |
| File tidak masuk blockchain; ledger hanya menyimpan sidik jari SHA-256, versi, disposisi, dan setiap aksi yang ditandatangani sertifikat X.509 | README |
| Kunci dokumen hanya dilepas KeyGuard jika ledger memuat `ACCESS_GRANTED` yang baru (≤ 120 detik) dan belum pernah dipakai | README |
| Penolakan tetap tercatat (`ACCESS_DENIED`) dan memicu alert | README |
| Mode tanda tangan di perangkat: kunci pribadi tidak ada di server | README |
| Watermark memuat nama, NRP, waktu, dan txId; txId juga ada di metadata PDF | `backend/src/watermark/watermark.service.ts` |
| Tujuh aturan risiko: penolakan beruntun, menyisir banyak dokumen, membuka dokumen massal, membuka dokumen berulang, di luar jam dinas, salinan tidak cocok, penolakan berulang | `backend/src/forensics/behavior.ts` |
| Perubahan satu bit pada salinan menghasilkan SHA-256 yang berbeda | hitung sendiri (adegan 7) |
| (Jumlah tes backend lulus) | `cd backend && npm test` |
| (Jumlah tes chaincode lulus) | `cd chaincode/sandichain && go test ./... -v` |
| (Status CI: tiga pekerjaan hijau) | `gh pr checks 2` |
| (28 pengecekan ujung ke ujung) | hanya jika `node backend/scripts/demo.mjs` benar-benar dijalankan di jaringan asli; jika tidak, buang |

Konteks lomba boleh muncul sebagai teks kecil di adegan 1 dan 10: "Kartika Cyber Hackathon 2026 · Track Penangkalan". **Konfirmasi track sebelum render akhir** (pilihan ini belum dikonfirmasi tim).

## 9. Storyboard

Narasi saja hanya sekitar 2 menit 10 detik pada kecepatan 158 kata per menit, jadi film ini dibentuk oleh **gerak visual yang bermakna**, bukan oleh panjang naskah. Setiap adegan punya durasi minimum:

| Adegan | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Minimum (detik) | 16 | 22 | 14 | 44 | 30 | 44 | 20 | 22 | 12 | 16 |

**Durasi adegan = yang terbesar antara (durasi narasi + jeda + hold) dan durasi minimumnya.** Waktu tambahan diisi beat visual yang punya arti (animasi diagram yang selesai, pengetikan, gulir, sorotan), dengan narasi berhenti dan hanya efek suara yang berbunyi. Jangan menambal dengan frame kosong atau gerak berulang. Total minimum 240 detik (4:00). Jika hasil akhir di bawah 3:45 atau di atas 4:30, periksa kembali beat visualnya, bukan kecepatan bicaranya. Jangan mempercepat atau memperlambat suara di luar rentang 150 sampai 166 kata per menit.

### Kalimat narasi (ID tetap, dipakai untuk subtitel dan sinkronisasi)

| ID | Teks |
|---|---|
| S01 | Bayangkan sebuah dokumen rahasia bocor. |
| S02 | Banyak orang pernah membukanya. Siapa pelakunya? |
| S03 | Sekarang bayangkan, dokumen itu sendiri yang mencatat siapa saja yang membukanya. |
| S04 | Pada banyak sistem, jejak akses disimpan di server yang bisa diubah administratornya. |
| S05 | Log bisa dihapus. Akun bisa dipinjam. Dan setelah bocor, penyelidikan dimulai dari nol. |
| S06 | Kami Pasukan Bima. Ini SANDI-Chain: sistem integritas dan jejak akses dokumen klasifikasi, di atas blockchain. |
| S07 | Pertama, mencegah. File tidak pernah masuk ke blockchain. File dienkripsi, dan yang dicatat di ledger hanya sidik jarinya. |
| S08 | Siapa boleh membuka apa, diputuskan oleh chaincode berdasarkan atribut di sertifikat personel. Bukan oleh aplikasi, dan bukan oleh administrator. |
| S09 | Setiap transaksi harus disepakati dua organisasi: Mabesad atau Kodam, dan Satuan. |
| S10 | Dalam mode perangkat, tanda tangan dibuat di perangkat personel. Kunci pribadinya tidak pernah berada di server. |
| S11 | Kunci dokumen pun tidak dilepas begitu saja. Ia hanya keluar jika ledger memuat catatan akses yang sah, baru, dan belum pernah dipakai. |
| S12 | Percobaan yang ditolak tetap tercatat, dan langsung menjadi peringatan untuk unit pengamanan. |
| S13 | Kedua, mendeteksi. Sentinel membaca setiap kejadian di ledger, lalu menghitung skor risiko tiap personel. |
| S14 | Ada tujuh aturan yang bisa dijelaskan: penolakan beruntun, menyisir banyak dokumen, membuka dokumen secara massal, akses di luar jam dinas, dan lainnya. |
| S15 | Tidak ada kotak hitam. Setiap skor datang bersama buktinya, yang bisa diperiksa ulang di ledger. |
| S16 | Ketiga, menelusuri. Setiap dokumen yang dibuka diberi watermark berisi nama, NRP, waktu, dan kode transaksi. |
| S17 | Kalau salinannya bocor, masukkan kode itu, atau unggah PDF-nya. |
| S18 | Sistem langsung menunjukkan siapa yang membukanya, kapan, lewat disposisi siapa, dan siapa lagi yang pernah membuka dokumen yang sama. |
| S19 | Keempat, membuktikan. Karena jejaknya ada di ledger, ia tidak bisa dihapus, bahkan oleh administrator. |
| S20 | Dan perubahan satu bit saja pada sebuah salinan akan langsung terdeteksi. |
| S21 | Semua komponennya dirancang berjalan di jaringan sendiri, tanpa cloud, termasuk di jaringan tertutup. |
| S22 | Jalan menuju produksi sudah kami petakan: kunci di perangkat personel, Vault tingkat produksi, serta integrasi ke direktori pengguna dan SIEM yang sudah ada. |
| S23 | Semuanya diuji: tes otomatis di backend dan chaincode, tiga pipeline CI yang hijau, dan skenario ujung ke ujung. |
| S24 | Cegah. Deteksi. Telusuri. Buktikan. |
| S25 | Kami Pasukan Bima. Terima kasih. |

Untuk S24, rekam tiap kata sebagai klip terpisah supaya jatuh tepat pada beat visualnya. Jika S23 menyebut "skenario ujung ke ujung" tetapi pengecekan itu tidak dijalankan, buang frasanya dari narasi dan subtitel.

### Adegan

**1. Pertanyaan** (S01 sampai S03, hold 1,5 detik). Benda utama: selembar dokumen A4 `#f3f4f0` di tengah, dengan kepala "R/001/XI/2026, Rencana Operasi Latihan Gabungan" (fiktif) dan satu paragraf isi fiktif yang terbaca. S01: cap "SANGAT RAHASIA" jatuh di kepala dokumen (cue cap). S02: di samping dokumen muncul daftar enam nama yang disamarkan (blok redaksi sengaja, bukan placeholder) dan satu kata "Siapa?" (Barlow, 140 px). S03: baris-baris mono muncul satu per satu di tepi kanan dokumen seolah dokumen itu menulis sendiri ("19.53 · kapten.andi · DIBUKA", "tx e4bc38b0…") dengan cue baris ledger. Teks kecil mono di kiri atas: konteks lomba (lihat bagian 8).

**2. Masalah** (S04, S05, hold 1,0 detik). Benda utama: jendela berkas log (mono) di 65% layar, delapan baris log fiktif ("2026-11-07 19:51 ACCESS_DENIED serka.budi …"). S04: label "SERVER · administrator" masuk di atas log. S05: kursor menghapus satu baris, baris di bawahnya naik merapat tanpa bekas (sorotan merah satu kali sebelum hilang). Lalu kolom aktor satu baris berganti huruf demi huruf dari "kapten.andi" menjadi "mayor.dewi". Lalu semua baris memudar menyisakan kursor berkedip dan penghitung "0 bukti". Teks layar maksimal tiga kata.

**3. Perkenalan** (S06, hold 2,5 detik). Match-cut: kursor berkedip menjadi garis pertama sayap lambang. Lambang digambar dengan stroke-reveal berurutan: sayap merah, dua sayap bawah, ruang kosong bintang terbentuk, chevron emas. Lalu tulisan "SANDI-CHAIN" (Barlow 700, 120 px, tracking 0,14em), subjudul "Integritas dan jejak akses dokumen klasifikasi" (Plus Jakarta 38 px), garis merah-putih setebal 4 px di bawahnya, dan "PASUKAN BIMA" (mono 32 px) di dasar.

**4. Cegah** (S07 sampai S12, hold 3,0 detik). Empat beat, satu benda utama tiap beat, saling terhubung oleh garis tinta.
- 4a (S07): dokumen kiri, kotak "Penyimpanan terenkripsi" tengah (label "AES-256-GCM"), ledger kanan. Dokumen terurai menjadi blok sandi ke kotak tengah. Di ledger muncul satu blok baru berisi **hanya hash**: nilai `sha256` **asli** dari berkas contoh yang sama (hitung dengan `shasum -a 256`), dengan keterangan "bukan filenya".
- 4b (S08): kartu sertifikat dengan tiga atribut (clearance, jabatan, role) bergeser ke gerbang berlabel "chaincode". Dua hasil berdampingan, DIIZINKAN dan DITOLAK. Keduanya **menarik garis tinta menulis baris ke ledger**.
- 4c (S09, S10): dua cap (Org1 dan Org2) jatuh bergantian pada satu transaksi. Lalu kunci pribadi digambarkan sebagai bentuk takik di dalam persegi panjang perangkat (gambar sendiri, bukan ikon stok) yang tidak pernah bergerak ke kotak "Server".
- 4d (S11, S12): bar "jendela bukti" 120 detik menyusut; KeyGuard hanya membuka kunci saat baris ACCESS_GRANTED baru muncul dan menandainya terpakai (cue kunci dilepas). Penolakan menghasilkan baris merah yang bergeser menjadi notifikasi di panel unit pengamanan (cue peringatan).

**5. Deteksi** (S13 sampai S15, hold 3,0 detik). Tangkapan UI sungguhan: halaman Pengamanan, tab "Risiko personel" (tema gelap). Kamera dolly lambat. Beat: daftar skor tampil (serka.budi 84 kritis, kapten.andi 56 tinggi), baris serka.budi terbuka menampilkan sinyal dan chip bukti. Di kanan, tujuh nama aturan masuk berurutan sebagai kolom teks bergaya sistem ini (nama aturan persis seperti di aplikasi). Akhiri dengan cincin sorot di satu chip bukti txId, yang menjadi match-cut ke adegan 6.

**6. Telusuri** (S16 sampai S18, hold 4,0 detik). Tiga beat UI sungguhan.
- 6a (S16): satu halaman PDF ber-watermark (render keluaran `WatermarkService` kelas RAHASIA lewat `pdftoppm`, mock menyediakannya di `/api/__sample-leak.pdf`). Zoom ke footer "Diakses oleh … | tx e4bc38b0d391f396" dan beri cincin pada kode transaksi.
- 6b (S17, S18): halaman Telusuri. txId diketik karakter demi karakter (satu tangkapan per karakter, 16 tangkapan), klik Telusuri, hasil muncul. Kamera mendekat ke kartu pembaca, lalu ke baris "Disposisi oleh letkol.arya".
- 6c (S18): rantai akses dokumen bergulir dengan entri yang cocok tersorot. Sisipan kecil: PDF dijatuhkan dan muncul "Jejak terbaca dari metadata PDF".

**7. Buktikan** (S19, S20, hold 2,5 detik). Rantai empat blok persegi panjang berisi isi singkat dan hash **hitung asli** (SHA-256 berantai dengan Python). S19: usaha mengubah isi blok 2, lalu hash blok 2, 3, dan 4 berubah dan tersorot merah satu per satu (nilai nyata hasil hitung ulang). S20: dua hash SHA-256 dari berkas contoh dan salinan dengan **satu bit** dibalik (hitung asli); karakter yang berbeda disorot emas. Kedua hash ditulis penuh 64 karakter dalam mono.

**8. Kelayakan** (S21, S22, hold 2,0 detik). Diagram topologi bergaya garis: kotak "Mabesad / Kodam (Org1)" dan "Satuan (Org2)" masing-masing dengan peer, "Orderer (Raft)" di tengah, serta Vault, KeyGuard, dan penyimpanan, semuanya di dalam batas putus-putus berlabel "Jaringan sendiri". Di luar batas hanya teks mono "tanpa cloud · tanpa internet". Lalu tiga chip "Jalan ke produksi": "Kunci di perangkat", "Vault produksi", "LDAP · SIEM".

**9. Bukti** (S23, hold 2,5 detik). Tiga sampai empat ubin angka berhitung naik ke **nilai ukur nyata** (bagian 8). Setelah selesai, angka diam dan satu garis tipis berjalan di bawahnya.

**10. Penutup** (S24, S25, hold 4,0 detik lalu fade hitam 1,0 detik). S24: empat kata CEGAH, DETEKSI, TELUSURI, BUKTIKAN (Barlow 700, 160 px) masing-masing jatuh tepat pada kata yang diucapkan, dengan nomor emas 01 sampai 04. Lalu susunan itu bergeser menjadi kartu penutup: lambang, "SANDI-CHAIN", **"PASUKAN BIMA"** (Barlow 700, 140 px), tiga nama dalam Plus Jakarta 600 44 px, **tanpa peran**: **Luthfi Fauzi**, **Fadhail A. Bima Dharmawan**, **Erlan Irhab Ghalib** (ejaan persis), dan baris kecil "Kartika Cyber Hackathon 2026".

## 10. Pipeline produksi

1. Siapkan `docs/video/` dengan `scenes/sNN.html` (satu berkas per adegan, mandiri, font tersemat), `timeline.json`, `pronunciation.json`, `facts.json` (setiap angka dan sumbernya), dan `render.mjs`.
2. Buat audio dulu (bagian 7). Ukur durasi, tulis `timeline.json`, hitung durasi adegan.
3. Tangkap bahan UI: jalankan aplikasi, lalu rekam tangkapan layar dengan Chrome melalui Chrome DevTools Protocol pada **DPR 2** (3840 x 2160) agar zoom tetap tajam. Daftar tangkapan: Pengamanan tab Risiko (daftar, serka.budi terbuka, chip bukti disorot), Telusuri (kosong, 16 tangkapan pengetikan txId, hasil, rantai akses, notifikasi metadata PDF), dan halaman PDF ber-watermark. Gerak antar tangkapan (kursor, zoom, gulir, pengetikan) dianimasikan di HTML, **bukan** direkam waktu nyata, supaya deterministik.
4. Bangun adegan sesuai storyboard. Setiap adegan: `window.seek(t)`, `window.__duration`, mode `?render`.
5. Render dengan `render.mjs`: Node 23 + Chrome lewat WebSocket CDP bawaan (tanpa paket), empat instance Chrome paralel, tiap frame `Runtime.evaluate("window.seek(t)")` lalu `Page.captureScreenshot` (PNG), dialirkan ke ffmpeg (`-f image2pipe`) menjadi `out/scenes/sNN.mp4`. Lewati adegan yang berkas HTML dan timeline-nya tidak berubah.
6. Sambung adegan dengan demuxer `concat`, mux dengan audio akhir, hasilkan `out/pasukan-bima-sandi-chain.mp4`. Buat subtitel `.srt` dari `timeline.json` (maksimal dua baris, 42 karakter per baris) dan bakar ke video.

## 11. Sebelum selesai

Lakukan semuanya, dan perbaiki sebelum melapor:

- **Deterministik:** render frame yang sama dua kali, hash PNG-nya harus identik, untuk lima frame acak per adegan.
- **Contact sheet:** satu tangkapan tiap 1 detik, dinilai sebagai art director, lalu lagi pada lebar 200 px. Perbaiki yang generik, murahan, terlalu kecil, atau kosong.
- **Tata letak otomatis:** untuk setiap teks, cek kotak batasnya terhadap margin aman dan terhadap teks lain. Tidak boleh ada yang terpotong atau bertumpuk.
- **Kontras:** rasio kontras teks minimal 4,5:1 terhadap latarnya.
- **Fakta:** setiap angka dan nama di layar ada di `facts.json` beserta perintah dan hasil ukurnya. Tuliskan semuanya di `QA-report.md`.
- **Ejaan:** periksa ejaan seluruh teks layar dan subtitel. Nama tim dan tiga nama anggota harus persis sesuai bagian 9 adegan 10.
- **Audio:** ukur `loudnorm` akhir (target -16 LUFS), `astats` untuk kliping, `silencedetect` untuk jeda yang tidak dimaksudkan. Subtitel harus selaras dengan audio dalam ±100 ms.
- **Berkas:** `ffprobe` memastikan 1920x1080, 30 fps, H.264, yuv420p, bt709, AAC 48 kHz, dan durasi dalam batas.

## 12. Originality

Setiap elemen dibuat sendiri. Jangan menyalin UI, ikon, atau logo produk nyata. Jangan menggambar lambang institusi. Langsung bangun tanpa meminta konfirmasi.

## 13. Serah terima

Hasilkan di `docs/video/out/`: `pasukan-bima-sandi-chain.mp4`, `pasukan-bima-sandi-chain.srt`, `contact-sheet.png`, `QA-report.md`, dan folder `audition/`. Di akhir, laporkan: durasi total, durasi tiap adegan, angka terukur yang tampil beserta sumbernya, pilihan pelafalan dan kecepatan yang dipakai, apa saja yang berasal dari data simulasi, dan hal apa pun yang tidak bisa diverifikasi lalu dibuang.
