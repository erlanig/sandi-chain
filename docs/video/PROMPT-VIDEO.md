Buat ulang film presentasi SANDI-Chain untuk Kartika Cyber Hackathon 2026 sebagai **film sinematik tanpa narasi**, dengan desain suara (efek saja) dan paket rekaman agar tim bisa mengisi suara sendiri. Ikuti brief ini persis. Langsung kerjakan tanpa meminta konfirmasi. Berhenti hanya jika (a) ada alat yang harus dipasang, atau (b) sebuah fakta wajib tidak bisa diverifikasi.

Versi sebelumnya ada di `PROMPT-VIDEO-v1.md`. Pertahankan yang sudah bekerja: mesin `window.seek`, `render.mjs`, tangkapan UI asli, fakta terukur, dan QA. Brief ini mengubah tiga hal: **suara** (narasi direkam tim, film tidak memuat suara manusia), **sinematografi** (dari motion graphic rapi menjadi film yang terasa disutradarai), dan **serah terima** (paket rekaman lengkap).

# Brief film v2: SANDI-Chain, oleh PASUKAN BIMA

## 0. Aturan kerja

- Semua berkas kerja di `docs/video/`. Hasil render ke `docs/video/out/` (sudah di-gitignore).
- Jangan ubah kode aplikasi (`frontend/`, `backend/`, `chaincode/`). Jangan jalankan `brand-intake` atau mengubah `CLAUDE.md`.
- Alat yang boleh dipakai: ffmpeg 7.1, Google Chrome (CDP lewat `--remote-debugging-pipe`), Node 23 tanpa paket tambahan, Python dengan Pillow dan numpy, `pdftoppm`, dan `say` macOS (hanya untuk trek panduan, bukan hasil akhir). Butuh paket lain: berhenti dan tulis kebutuhannya.
- Offline penuh. Tidak ada aset unduhan, musik stok, atau suara stok.
- Konvensi `motion-effects`: satu jam `window.seek(detik)`, mode `?render`, font dimuat sebelum frame pertama, tanpa `Math.random` tak ber-seed, tanpa CSS animation yang jalan sendiri.

## 1. The bar

Ini bukan video demo. Ini **film pembuka di panggung final**: lampu ruangan diredupkan, layar besar, juri diam. Patokannya film peluncuran produk pertahanan dan keamanan yang dikerjakan studio sungguhan: tenang, berat, presisi, setiap potongan punya alasan. Kalau satu frame bisa dicetak jadi poster, itu tandanya benar. Kalau terasa seperti slide yang dianimasikan, ulangi.

Tiga kata kunci sutradara: **gelap, dekat, pasti.**
- *Gelap*: dunia hitam-hijau, cahaya hanya jatuh di benda yang penting.
- *Dekat*: kamera berani masuk ke detail (serat kertas, digit hash, tepi cap), lalu mundur untuk memperlihatkan skala.
- *Pasti*: tidak ada gerak ragu. Setiap benda berhenti di tempatnya dengan bunyi yang jelas.

## 2. Format

- **Master:** 1920 x 1080, 30 fps konstan, H.264 High, yuv420p, bt709 (tag primaries, transfer, dan matrix lengkap), `-crf 14`, `-movflags +faststart`. Audio AAC 256 kbps, 48 kHz, stereo.
- **Durasi:** 3:40 sampai 4:15, ditentukan oleh **slot rekaman** (bagian 8) ditambah beat visual. Bukan loop. Fade ke hitam hanya di akhir.
- **Rasio sinematik:** bilah letterbox 2.39:1 (tinggi bilah 138 px atas dan bawah) **hanya** di cold open (adegan 1) dan penutup (adegan 10). Bilah masuk dan keluar dengan gerak lambat 1,2 detik, menjadi tanda "ini bagian film". Adegan UI tetap 16:9 penuh agar teks terbaca.
- **Tanpa subtitel terbakar dan tanpa narasi** di master. Teks layar hanya super (judul pendek) yang memang bagian desain.

## 3. The one rule

**Satu shot, satu gagasan, satu cahaya.** Setiap shot punya satu benda utama yang menerima cahaya, mengisi 55 sampai 75% bingkai. Semua yang lain gelap, buram, atau tidak ada. Kalau ada dua hal yang sama terang, satu harus dibuang.

## 4. Look

### 4.1 Palet (hanya dari `frontend/src/app/globals.css` dan `kit.tsx`)

| Peran | Hex |
|---|---|
| Latar (hitam-hijau) | `#0d170f`, lapisan `#161b14`, `#1d2419` |
| Teks terang | `#ecebe0`; redup `rgba(236,235,224,0.6)`; garis `rgba(236,235,224,0.12)` |
| Kertas | `#f3f4f0`, tinta `#1b2016` |
| Aksen utama | khaki `#a9b665`, olive `#46562a` |
| Merah | `#d9382f` (cap, pil), teks merah di latar gelap `#e8605a` |
| Emas (garis, nomor bab, detail) | `#d4a72c`, terang `#f1cf6a` |
| Lencana klasifikasi | BIASA `#74b57f`, TERBATAS `#6fa8dc`, RAHASIA `#e29245`, SANGAT RAHASIA `#e8605a` |

Maksimal dua aksen per shot (khaki ditambah satu).

### 4.2 Cahaya dan grading (ini yang membuatnya sinematik)

- **Key light tunggal per shot.** Benda utama diberi pencahayaan lewat lapisan sendiri: vinyet terarah (radial gelap 0 → 70% di tepi), dan pada kertas atau logam satu **sapuan cahaya** (pita terang lembut 12% yang menyapu sekali, 1,5 sampai 2,5 detik, dari kiri atas ke kanan bawah). Satu sapuan per shot, tidak berulang.
- **Kedalaman:** setiap shot punya tiga lapisan: latar (blur 6 sampai 14 px, gelap), benda utama (tajam), depan (opsional: tepi benda lain sangat dekat, blur 20 px, gelap). Rack focus boleh: blur berpindah dari depan ke benda utama dalam 0,6 detik.
- **Grading akhir di ffmpeg**, sama untuk semua adegan: bayangan sedikit ke hijau-olive, highlight sedikit hangat, kontras S lembut. Contoh awal: `curves=master='0/0 0.06/0.04 0.5/0.5 0.94/0.97 1/1',colorbalance=rs=-0.02:gs=0.02:bs=-0.01:rh=0.03:bh=-0.02`. Ukur ulang kontras teks **setelah** grading.
- **Grain film:** butir halus ber-seed (`noise=alls=5:allf=t:all_seed=1729`) setelah grading. Tidak boleh terlihat sebagai noise digital di layar besar; uji di 100% crop.
- **Vinyet global:** `vignette=angle=PI/5` sangat tipis, di atas vinyet per shot.
- **Motion blur sungguhan:** render setiap frame sebagai rata-rata 4 sub-frame dalam rana 180° (waktu `t`, `t+1/240`, `t+2/240`, `t+3/240`), lalu rata-ratakan dengan ffmpeg (`tmix=frames=4` dan ambil setiap frame ke-4). Ini wajib: inilah yang membedakan film dari animasi web.

### 4.3 Kamera

- Panggung 3D dengan CSS `perspective: 1800px`. Benda bisa berada di bidang miring (kertas tergeletak di meja gelap pada sudut 18 sampai 28°, rantai blok melayang berjajar ke kedalaman).
- Gerak yang diizinkan: **push-in** lambat (maksimal 8% per shot), **track lateral**, **tilt** kecil (maksimal 6°), **orbit** pelan (maksimal 10°) untuk benda 3D, dan **crane** turun ke dalam bingkai untuk pembuka bab. Easing kamera: `easeInOutSine` panjang (minimal 2 detik). Tidak ada goyangan tangan, whip pan, atau zoom cepat.
- **Potongan, bukan transisi.** Bahasa utama film adalah cut. Jenis potongan yang dipakai: cut on action (benda bergerak keluar, shot berikut melanjutkan arah gerak), match cut (bentuk sama di dua shot, misalnya cincin chip bukti menjadi cincin pada footer PDF), dan cut ke hitam 6 sampai 10 frame sebelum bab baru. Crossfade polos dilarang.

### 4.4 Tipografi

- Barlow Condensed 700 untuk judul (huruf kapital, tracking 0,04em pada ukuran besar), Plus Jakarta Sans 400 sampai 700 untuk teks, IBM Plex Mono 400/500 untuk log, hash, txId. Font tersemat base64.
- **Kartu bab** (4 kali: CEGAH, DETEKSI, TELUSURI, BUKTIKAN): layar hitam, nomor emas `01` 64 px dengan garis emas 1 px yang ditarik, kata 220 px masuk dengan mask naik, tahan 1,6 detik, lalu cut. Disertai dentum sub-bass (bagian 6).
- **Super** (teks layar yang menggantikan narasi saat tidak ada suara): maksimal 4 kata, 64 sampai 120 px, misalnya "LOG BISA DIHAPUS.", "AKUN BISA DIPINJAM.", "TIDAK ADA KOTAK HITAM." Super tidak boleh mengulang kalimat narasi kata per kata; ia adalah judul, bukan transkrip.
- Ukuran minimum: teks sekunder 34 px, mono 28 px. Margin aman 120 px kiri-kanan, 96 px atas-bawah (di dalam letterbox: 40 px dari tepi bilah).

### 4.5 Logo

`docs/video/assets/sandi-logo.svg` hanya di adegan 3 (lahir) dan 10 (penutup). Di penutup, logo dibuat **sebagai benda**: tampil di bidang 3D dengan sapuan cahaya emas melintas sekali, bukan stiker datar.

## 5. Motion

- Benda fisik punya massa: cap jatuh dengan overshoot 3 sampai 4% dan bayangan menegang 6 frame; blok ledger meluncur lalu **mengunci** (snap 2 px, garis kunci menyala 4 frame); kertas mendarat dengan bayangan yang mengecil.
- Garis tinta ditarik dengan `stroke-dashoffset`, easeInOutCubic.
- Teks masuk kata demi kata dengan mask naik 16 px dan stagger 4 frame.
- Setiap beat menahan keadaan akhir minimal 1,2 detik dengan satu detail kecil tetap hidup (kursor, debu cahaya pada sapuan, garis tipis berjalan). Hold juga memberi ruang bagi suara yang akan direkam.
- Ritme: adegan padat (diagram, UI) selalu diapit shot lega (satu benda, satu super, banyak ruang hitam).

## 6. Desain suara (tanpa narasi, tanpa musik)

Film harus **sudah enak ditonton tanpa suara manusia**. Suara dibuat sendiri dengan numpy, deterministik ber-seed, stereo (pan sesuai posisi benda di layar).

| Lapisan | Isi | Level |
|---|---|---|
| Room tone | noise cokelat lolos-rendah 180 Hz, napas lambat (modulasi 0,05 Hz), sepanjang film | sekitar -48 dBFS RMS |
| Sub hit | sinus 42 Hz meluruh 1,8 detik dengan klik transien, pada setiap kartu bab, potongan ke logo, dan kartu penutup | puncak -14 dBFS |
| Drone ruang | dengung non-melodis (dua sinus 55 dan 82,4 Hz dengan beat lambat, lolos-rendah), hanya di cold open dan penutup, naik dan turun 3 detik | sekitar -36 dBFS RMS |
| Foley kertas | semburan noise lolos-pita 1 sampai 4 kHz, 120 ms, saat kertas mendarat atau bergeser | puncak -24 dBFS |
| Cap | dentum 70 Hz ditambah noise lolos-rendah 400 Hz, 250 ms | puncak -16 dBFS |
| Ketikan | klik 3 kHz 15 ms dengan variasi nada ber-seed, satu per karakter | puncak -28 dBFS |
| Baris ledger | klik 2,4 kHz 12 ms; **kunci**: dentum rendah 95 Hz 120 ms | -26 / -20 dBFS |
| Kunci dilepas | klik ganda tipis | -24 dBFS |
| Peringatan | dua nada lembut 880 Hz lalu 660 Hz, 120 ms | -22 dBFS |
| Cincin sorot | "ting" sinus 1,76 kHz meluruh 400 ms, sangat lembut | -30 dBFS |

- Whoosh dan riser **boleh** dalam satu bentuk saja: "udara" (noise lolos-pita menyapu 300 Hz ke 2 kHz, 0,6 detik, -30 dBFS) pada cut on action yang besar. Maksimal 6 kali dalam film.
- Mix efek dinormalisasi ke **-26 LUFS terintegrasi, true peak ≤ -6 dBTP**, supaya ada ruang untuk suara rekaman yang nanti diletakkan di -16 LUFS. Setelah suara masuk, efek otomatis diturunkan 6 dB selama ada suara (ducking, attack 80 ms, release 400 ms).

## 7. Fakta yang boleh tampil

Sama dengan v1 bagian 8. Angka diukur ulang saat render dan ditulis ke `facts.json` beserta perintahnya: tes backend (`cd backend && npm test`), tes chaincode (`cd chaincode/sandichain && go test ./... -v`), status CI (`gh pr checks 2`), SHA-256 berkas contoh dan salinan 1 bit, rantai 4 blok. Data UI dari `tools/mock-api.mjs` wajib berlabel **DATA SIMULASI** (mono 28 px, kiri bawah). Tidak ada angka di luar daftar. Kata "AI" tidak dipakai. Klaim mutlak dilarang.

Konteks lomba: "Kartika Cyber Hackathon 2026" (track belum dikonfirmasi, jangan tulis track).

## 8. Naskah rekaman

Narasi direkam oleh anggota tim (suara laki-laki). Film dibangun dengan **slot**: ruang waktu untuk setiap kalimat. Panjang slot dihitung dari trek panduan, bukan dikarang:

```
slot = durasi trek panduan (say -v Damayanti -r 150) x 1,18 + 0,35 detik
```

Faktor 1,18 karena manusia berbicara lebih lambat dan bernapas. Visual di dalam slot dikunci ke awal slot (kata pertama = perubahan visual pertama, toleransi 0,3 detik).

### 8.1 Gaya bicara

Narator dokumenter, bukan pembaca berita. Suara rendah dan tenang, tempo sedang, jeda dipakai sebagai tenaga. Tidak berteriak, tidak dramatis berlebihan, tidak tersenyum. Kalimat pendek diucapkan tegas dan berhenti penuh. Kata yang ditebalkan di bawah adalah penekanan. `/` = jeda pendek (napas kecil), `//` = jeda panjang (1 detik).

### 8.2 Naskah (ID tetap, untuk nama berkas dan sinkronisasi)

| ID | Adegan | Teks rekaman | Catatan |
|---|---|---|---|
| S01 | 1 | Sebuah dokumen **rahasia** / bocor. | pelan, berat |
| S02 | 1 | Banyak orang pernah membukanya. // **Siapa** pelakunya? | "Siapa" turun, bukan naik |
| S03 | 1 | Sekarang bayangkan / dokumen itu **sendiri** / yang mencatat siapa saja yang membukanya. | sedikit lebih terang |
| S04 | 2 | Di banyak sistem, / jejak akses disimpan di server / yang bisa **diubah** administratornya. | datar, faktual |
| S05 | 2 | Log bisa dihapus. / Akun bisa dipinjam. // Dan setelah bocor, / penyelidikan dimulai dari **nol**. | tiga pukulan, yang ketiga paling pelan |
| S06 | 3 | Kami **Pasukan Bima**. // Ini **SANDI-Chain**: / integritas dan jejak akses dokumen klasifikasi, / di atas blockchain. | tegak, bangga tapi tidak keras |
| S07 | 4 | Pertama, **mencegah**. // File tidak pernah masuk ke blockchain. / File dienkripsi, / dan yang dicatat di ledger / hanya **sidik jarinya**. | |
| S08 | 4 | Siapa boleh membuka apa / diputuskan oleh chaincode, / berdasarkan atribut di sertifikat personel. // **Bukan** oleh aplikasi. / Dan **bukan** oleh administrator. | dua "bukan" sama berat |
| S09 | 4 | Setiap transaksi harus disepakati **dua** organisasi: / Mabesad atau Kodam, / dan Satuan. | |
| S10 | 4 | Dalam mode perangkat, / tanda tangan dibuat di perangkat personel. / Kunci pribadinya / **tidak pernah** berada di server. | |
| S11 | 4 | Kunci dokumen pun tidak dilepas begitu saja. / Ia hanya keluar jika ledger memuat catatan akses / yang **sah**, / **baru**, / dan **belum pernah** dipakai. | tiga syarat, ketukan rata |
| S12 | 4 | Percobaan yang ditolak / tetap tercatat, / dan langsung menjadi peringatan / untuk unit pengamanan. | |
| S13 | 5 | Kedua, **mendeteksi**. // Sentinel membaca setiap kejadian di ledger, / lalu menghitung skor risiko tiap personel. | |
| S14 | 5 | Ada **tujuh** aturan yang bisa dijelaskan: / penolakan beruntun, / menyisir banyak dokumen, / membuka dokumen secara massal, / akses di luar jam dinas, / dan lainnya. | daftar, jangan dipercepat |
| S15 | 5 | Tidak ada kotak hitam. // Setiap skor datang bersama **buktinya**, / yang bisa diperiksa ulang di ledger. | |
| S16 | 6 | Ketiga, **menelusuri**. // Setiap dokumen yang dibuka diberi watermark: / nama, / NRP, / waktu, / dan kode transaksi. | |
| S17 | 6 | Kalau salinannya bocor, / masukkan kode itu, / atau unggah PDF-nya. | |
| S18 | 6 | Sistem langsung menunjukkan **siapa** yang membukanya, / kapan, / lewat disposisi siapa, / dan siapa lagi yang pernah membuka dokumen yang sama. | naik pelan sampai akhir |
| S19 | 7 | Keempat, **membuktikan**. // Karena jejaknya ada di ledger, / ia tidak bisa dihapus, / bahkan oleh administrator. | |
| S20 | 7 | Dan perubahan **satu bit** saja pada sebuah salinan / akan langsung terdeteksi. | |
| S21 | 8 | Semua komponennya dirancang berjalan di jaringan sendiri, / tanpa cloud, / termasuk di jaringan tertutup. | |
| S22 | 8 | Jalan menuju produksi sudah kami petakan: / kunci di perangkat personel, / Vault tingkat produksi, / serta integrasi ke direktori pengguna dan SIEM yang sudah ada. | |
| S23 | 9 | Semuanya diuji: / tes otomatis di backend dan chaincode, / dan tiga pipeline CI yang **hijau**. | |
| S24a sampai S24d | 10 | Cegah. / Deteksi. / Telusuri. / Buktikan. | empat berkas terpisah, tiap kata berdiri sendiri |
| S25 | 10 | Kami **Pasukan Bima**. // Terima kasih. | "Terima kasih" lebih lembut |

Pelafalan untuk perekam (ditulis di naskah, bukan di layar): SANDI-Chain = "san-di cheyn", blockchain = "blok-cheyn", chaincode = "cheyn-kod", ledger = "le-jer", NRP = "en-er-pe", PDF = "pe-de-ef", CI = "si-ai", SIEM = "sim", Vault = "volt".

### 8.3 Spesifikasi rekaman (ditulis untuk tim, bahasa sederhana)

- Ruangan kecil yang banyak kain (lemari baju, kamar dengan kasur dan gorden). Matikan kipas dan AC. Ponsel mode pesawat.
- Mikrofon USB atau ponsel (aplikasi perekam dengan format WAV atau "lossless"). Jarak mulut 15 sampai 20 cm, sedikit menyamping agar tidak meletup.
- 48 kHz, 24 bit, mono. Puncak suara sekitar -12 dBFS (jarum tidak menyentuh merah).
- Rekam 2 sampai 3 take per kalimat. Diam 1 detik sebelum dan sesudah. Nama berkas: `S07_t1.wav`, `S07_t2.wav`, dan seterusnya. Simpan di `docs/video/vo/raw/`.
- Tonton `out/guide-teleprompter.mp4` sambil merekam (lihat bagian 10), pakai headphone agar suara efek tidak ikut terekam.

## 9. Storyboard (shot list)

Setiap adegan memakai slot dari bagian 8 ditambah beat visual minimum. Kolom "tanpa suara" adalah apa yang membuat shot tetap jelas jika suara belum ada.

**1. Cold open: Kebocoran** (S01 sampai S03, letterbox masuk). Meja gelap tak terlihat; satu lembar A4 tergeletak miring 24° di bidang 3D, key light dari kiri atas. Kamera crane turun dan push-in ke kepala dokumen. Cap SANGAT RAHASIA jatuh (cue cap, sub hit kecil). Rack focus ke kiri: enam nama tersamar (blok redaksi disengaja) muncul di latar dan buram. Super "SIAPA?" 160 px. Lalu dokumen "menulis dirinya sendiri": baris mono muncul di tepi kanan (19.53 · kapten.andi · DIBUKA ...) dengan klik ledger. Teks kecil mono di dalam letterbox atas: "KARTIKA CYBER HACKATHON 2026". *Tanpa suara:* super "SIAPA?" dan baris log yang menulis sendiri.

**2. Masalah** (S04, S05, letterbox keluar). Jendela log server mengisi 70% bingkai, dibidik dari sudut miring 12° lalu meluruskan diri. Kursor administrator menghapus satu baris (sorot merah satu kali), baris di bawahnya naik tanpa bekas. Kolom aktor berganti huruf demi huruf "kapten.andi" menjadi "mayor.dewi". Super berurutan: "LOG BISA DIHAPUS." "AKUN BISA DIPINJAM." Lalu semua baris padam, tersisa kursor dan super "0 BUKTI". Cut ke hitam 8 frame.

**3. Kelahiran** (S06). Kursor berkedip menjadi garis pertama sayap lambang. Lambang digambar garis demi garis, ruang bintang terbentuk, chevron emas. Sub hit saat lambang lengkap. "SANDI-CHAIN" Barlow 140 px tracking 0,14em, subjudul 38 px, garis merah-putih 4 px, "PASUKAN BIMA" mono 32 px. Sapuan cahaya emas tipis melintasi lambang sekali.

**Kartu bab 01 CEGAH.**

**4. Cegah** (S07 sampai S12). Panel ledger tetap di kanan sepanjang adegan sebagai **benda yang tumbuh**, dibidik sedikit dari samping (rotasi Y -8°) agar terasa sebagai objek, bukan kotak UI.
- 4a: dokumen terurai menjadi sel sandi ke kotak "Penyimpanan terenkripsi · AES-256-GCM". Kamera mengikuti sel. Di ledger hanya satu blok berisi hash SHA-256 **asli**, keterangan "bukan filenya". Push-in sampai hash memenuhi 60% bingkai, lalu mundur.
- 4b: dua kartu sertifikat X.509 menuju gerbang "chaincode" (dua garis khaki tegak, cahaya tipis di antaranya). DIIZINKAN dan DITOLAK sebagai pil besar. Garis tinta menulis ke ledger. Super "BUKAN APLIKASI. BUKAN ADMIN." dengan coretan merah.
- 4c: kartu transaksi, dua cap Org1 dan Org2 jatuh bergantian (dua cue cap berbeda nada). Lalu perangkat personel dengan kunci bertakik (gambar sendiri) yang tidak pernah bergerak; hanya tanda tangan yang berjalan ke Server.
- 4d: KeyGuard dengan tiga centang (sah, baru ≤ 120 detik, belum pernah dipakai), bar jendela bukti, kunci dilepas (cue). Penolakan menjadi baris merah yang meluncur menjadi peringatan di panel "Unit Pengamanan" (cue peringatan).

**Kartu bab 02 DETEKSI.**

**5. Deteksi** (S13 sampai S15). Tangkapan UI asli (tab Risiko personel, tema gelap) ditampilkan sebagai **layar fisik** di ruang gelap: bidang 3D dengan sudut 6°, cahaya layar memantul tipis ke "meja" di bawahnya (pantulan buram 8% opasitas). Kamera dolly. Skor 84 kritis dan 56 tinggi diberi cincin (cue cincin). Baris serka.budi terbuka. Di kanan, tujuh nama aturan masuk satu per satu (nama persis dari `behavior.ts`). Super "TIDAK ADA KOTAK HITAM." Cincin akhir di satu chip bukti txId menjadi match cut ke adegan 6. Label DATA SIMULASI.

**Kartu bab 03 TELUSURI.**

**6. Telusuri** (S16 sampai S18).
- 6a: halaman PDF ber-watermark (render `WatermarkService` kelas RAHASIA, `pdftoppm`) tergeletak di bidang 3D. Sapuan cahaya memperlihatkan watermark diagonal. Kamera turun ke footer dalam satu gerak panjang, token nama, waktu, dan kode transaksi digarisbawahi emas, cincin pada txId. Kode itu terangkat dari kertas menjadi teks mono besar yang melayang.
- 6b: cut on action: kode terbang ke kolom input halaman Telusuri (UI asli). Pengetikan 16 karakter (16 tangkapan, cue ketik per karakter), klik, hasil. Kamera mendekat ke kartu pembaca, lalu ke waktu akses, lalu ke "Disposisi oleh letkol.arya".
- 6c: rantai akses bergulir, entri cocok tersorot. Sisipan: PDF jatuh, "Jejak terbaca dari metadata PDF".

**Kartu bab 04 BUKTIKAN.**

**7. Buktikan** (S19, S20). Empat blok ledger sebagai **lempengan 3D** (kedalaman 24 px, tepi menangkap cahaya) berjajar ke kedalaman, kamera track lateral sepanjang rantai. Isi blok 2 diubah huruf demi huruf, lalu hash blok 2, 3, dan 4 berubah merah satu per satu (nilai asli hasil hitung) dan sambungan rantai retak. Lalu cut ke dua hash SHA-256 penuh (berkas asli dan salinan 1 bit) dalam mono 44 px; karakter yang berbeda menyala emas satu per satu; super "58 DARI 64 KARAKTER BERUBAH" (angka diukur ulang).

**8. Kelayakan** (S21, S22). Diagram topologi bergaya garis (Org1, Org2, Orderer Raft, Vault, KeyGuard, Penyimpanan) di dalam batas putus-putus "JARINGAN SENDIRI", digambar garis demi garis. Kamera orbit 8°. Batas berubah utuh saat "jaringan tertutup". Lalu diagram mundur dan tiga chip "Jalan ke produksi": Kunci di perangkat, Vault produksi, LDAP · SIEM.

**9. Bukti** (S23). Tiga ubin angka berhitung naik ke nilai terukur (tes backend, tes chaincode, CI 3/3), dengan perintah sumber di bawahnya dalam mono. Garis tipis berjalan setelah angka diam.

**10. Penutup** (S24, S25, letterbox masuk). Empat kata CEGAH, DETEKSI, TELUSURI, BUKTIKAN (Barlow 700, 180 px) masing-masing jatuh pada beatnya dengan nomor emas, setiap kata disertai sub hit kecil yang makin rendah. Lalu kartu penutup: lambang sebagai benda 3D dengan sapuan cahaya emas, "SANDI-CHAIN", **"PASUKAN BIMA"** (Barlow 700, 140 px), tiga nama dalam Plus Jakarta 600 44 px tanpa peran: **Luthfi Fauzi**, **Fadhail A. Bima Dharmawan**, **Erlan Irhab Ghalib**, dan "Kartika Cyber Hackathon 2026". Drone naik, sub hit terakhir, tahan 4 detik, fade ke hitam 1,5 detik, room tone habis 0,5 detik setelah gambar.

## 10. Pipeline

1. **Trek panduan:** `say -v Damayanti -r 150` per kalimat (teks rekaman tanpa tanda `/`), ukur, hitung slot (bagian 8), tulis `timeline.json`. Trek panduan **tidak** masuk master.
2. **Tangkapan UI:** sama dengan v1 (build produksi, `next start`, DPR 2, tema gelap, API tiruan).
3. **Adegan:** `scenes/sNN.html` + `film/lib.js` (tambah: panggung 3D, lapisan cahaya, sapuan, rack focus, kartu bab). Setiap adegan: `window.seek`, `window.__duration`, `window.__cues`.
4. **Render:** `render.mjs` dengan 4 sub-frame per frame (bagian 4.2), PNG ke ffmpeg, lalu grading, vinyet, dan grain di tahap sambung akhir (sekali, bukan per adegan).
5. **Suara:** `tools/sfx.py` membuat lapisan bagian 6 dari `__cues` ditambah room tone dan drone, mix ke -26 LUFS.
6. **Keluaran pertama (sebelum rekaman):**
   - `out/master-sfx.mp4`: film bersih, hanya efek suara.
   - `out/guide-teleprompter.mp4`: film yang sama ditambah pita teleprompter di bawah (latar hitam 220 px): kalimat yang sedang berjalan (44 px, kata dinyalakan sesuai waktu), kalimat berikutnya (30 px, redup), bar hitung mundur 3-2-1 sebelum setiap slot, timecode, dan ID kalimat. Audio: efek -6 dB ditambah trek panduan Damayanti di -12 dB sebagai acuan tempo.
   - `out/naskah-rekaman.md` dan `out/naskah-rekaman.pdf`: tabel bagian 8.2 ditambah timecode masuk dan keluar tiap slot, durasi slot, catatan pelafalan, dan spesifikasi rekaman bagian 8.3. Rapi untuk dicetak (A4, Plus Jakarta Sans, satu kalimat per baris tabel).
   - `out/pasukan-bima-sandi-chain.srt` dari naskah dan slot.
7. **Setelah rekaman** (`node tools/vo.mjs` atau `python3 -I tools/vo.py`): pilih take terbaik (take terakhir, kecuali `vo/pilihan.json` menyebut lain), potong hening, `highpass=f=80`, de-noise ringan (`afftdn=nr=10`), de-ess ringan, kompresor 2,5:1, loudnorm dua-pass -16 LUFS / -1,5 dBTP. Dua mode:
   - `--pas`: suara diletakkan di awal slot. Jika take lebih panjang dari slot, laporkan selisihnya.
   - `--atur-ulang` (bawaan): slot dihitung ulang dari durasi take asli, `timeline.json` ditulis ulang, adegan dirender ulang (hanya yang berubah), lalu efek di-duck di bawah suara. Hasil: `out/pasukan-bima-sandi-chain.mp4` dan `.srt` yang selaras.

## 11. Sebelum selesai

- **Deterministik:** lima frame acak per adegan dirender dua kali dengan urutan berbeda, hash PNG identik (Chrome dengan `--disable-gpu --disable-partial-raster --disable-lcd-text --run-all-compositor-stages-before-draw`, keadaan akhir animasi dinormalisasi).
- **Contact sheet:** satu frame tiap detik, nilai sebagai sinematografer: setiap frame harus punya satu pusat cahaya, kedalaman, dan komposisi yang disengaja. Ulangi frame yang datar, kosong, atau terang merata. Lalu nilai lagi pada lebar 200 px: siluet tiap shot harus tetap terbaca.
- **Tata letak otomatis:** kotak teks terhadap margin aman (termasuk bilah letterbox) dan terhadap teks lain.
- **Kontras setelah grading:** teks minimal 4,5:1 (teks besar ≥ 48 px tebal boleh 3:1, catat).
- **Fakta, ejaan, nama tim:** seperti v1.
- **Audio:** master efek -26 LUFS ±1, true peak ≤ -6 dBTP, tanpa kliping; `silencedetect` hanya boleh menemukan hening di slot suara (itu memang ruang untuk rekaman).
- **Teleprompter:** setiap kalimat muncul minimal 1,5 detik sebelum slotnya, hitung mundur tepat di awal slot (±1 frame).
- **Berkas:** `ffprobe` memastikan 1920x1080, 30 fps, H.264, yuv420p, tag bt709 lengkap, AAC 48 kHz.

## 12. Never

Gradien blob, bokeh bulat, orb, partikel, lens flare, hujan kode, neon siberpunk, kisi heksagon. Gembok, perisai, bola dunia, otak, robot, peretas berkerudung. Ikon stok, emoji, clip art, rekaman stok, wajah atau orang hasil AI. Logo merek lain (tulis nama sebagai teks). Lambang, seragam, atau atribut TNI dan Pussiberad. Musik, melodi, atau suara manusia buatan di master. Goyangan kamera, whip pan, zoom cepat, crossfade polos, easing memantul. Angka di luar bagian 7. Teks di bawah ukuran minimal. Super yang mengulang narasi kata per kata.

## 13. Serah terima

Di `docs/video/out/`: `master-sfx.mp4`, `guide-teleprompter.mp4`, `naskah-rekaman.md`, `naskah-rekaman.pdf`, `pasukan-bima-sandi-chain.srt`, `contact-sheet.png`, `QA-report.md`. Setelah rekaman masuk: `pasukan-bima-sandi-chain.mp4` final. Laporkan: durasi total dan per adegan, slot tiap kalimat, angka terukur dan sumbernya, apa yang berasal dari data simulasi, perubahan dari v1, dan hal yang tidak bisa diverifikasi.
