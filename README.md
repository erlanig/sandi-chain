# SANDI-Chain

**Sistem Integritas & Jejak Akses Dokumen Rahasia Berbasis Permissioned Blockchain**

Prototype pengelolaan dokumen klasifikasi (BIASA, TERBATAS, RAHASIA, SANGAT RAHASIA) di atas Hyperledger Fabric. File tidak pernah masuk blockchain. File dienkripsi lalu disimpan di object storage, sedangkan ledger menyimpan **sidik jari SHA-256, versi, disposisi, dan setiap aksi** yang ditandatangani sertifikat X.509 milik personel.

> Semua nama personel dan dokumen di repo ini fiktif, untuk demo.

---

## Fitur

| Fitur | Cara kerja |
|---|---|
| **Kontrol akses berbasis atribut (ABAC)** | `clearance`, `jabatan`, `role` ditanam di sertifikat oleh Fabric CA. Chaincode yang memutuskan, bukan frontend/backend. |
| **Need-to-know** | Dokumen SANGAT RAHASIA hanya bisa dibuka pemilik dan penerima disposisi, meskipun clearance orang lain sama tinggi. |
| **Jejak akses immutable** | Setiap buka, tolak, verifikasi, revisi, disposisi, cabut tercatat di ledger. Admin tidak bisa menghapusnya. |
| **Penolakan tetap tercatat** | Akses ilegal tidak dikembalikan sebagai error (yang akan membatalkan transaksi), tetapi di-commit sebagai `ACCESS_DENIED`. |
| **Early warning real time** | Chaincode memancarkan event, *Sentinel* di backend meneruskannya ke dashboard (SSE), file JSON untuk Wazuh, dan webhook. |
| **Verifikasi keaslian** | Unggah salinan yang beredar → ASLI / cocok versi lama / TIDAK COCOK (perubahan 1 bit pun terdeteksi). |
| **Envelope encryption** | AES-256-GCM per dokumen, kunci dibungkus Vault Transit. Admin storage/DB tidak bisa membaca isi. |
| **Tamper-evident terhadap admin storage** | Ciphertext yang diubah di storage ditolak saat dibuka dan memicu alert `StorageIntegrity`. |
| **Watermark dinamis** | PDF yang ditampilkan berisi nama, NRP, waktu, dan txId akses di tiap halaman, sehingga foto layar bisa dilacak ke entri ledger. |
| **Channel per klasifikasi** | `ch-umum` (BIASA, TERBATAS) dan `ch-rahasia` (RAHASIA, SANGAT RAHASIA). |
| **Multi-org consensus** | Org1 (Mabesad/Kodam) dan Org2 (Satuan) harus sama-sama meng-endorse transaksi. |

## Tampilan

| Daftar dokumen | Detail & jejak akses |
|---|---|
| ![](docs/screenshots/1-daftar-dokumen.png) | ![](docs/screenshots/2-detail-jejak-akses.png) |
| **Viewer berwatermark** | **Pusat pengamanan (alert live)** |
| ![](docs/screenshots/3-viewer-watermark.png) | ![](docs/screenshots/4-pusat-pengamanan.png) |

## Arsitektur

```
 Browser ──► Next.js portal (:3000) ──/api proxy──► NestJS API (:4000)
                                                     │
          ┌───────────────┬──────────────┬───────────┼────────────────────┐
          ▼               ▼              ▼           ▼                    ▼
   Hyperledger Fabric   Vault Transit   S3 storage   PostgreSQL       Sentinel (event listener)
   2 org + Raft + CA    (KEK, DEK wrap) (ciphertext) (metadata,       ├─► SSE dashboard
   chaincode Go                                       alert, ckpt)    ├─► logs/alerts.log (Wazuh)
   ch-umum / ch-rahasia                                               └─► webhook (Telegram/SOAR)
```

**Alur membuka dokumen**

1. Backend memanggil `RequestAccess` dengan identitas personel. Chaincode mengecek atribut sertifikat dan mencatat hasilnya.
2. Kalau ditolak → `ACCESS_DENIED` di ledger + event `UnauthorizedAccess` → alert ke unit pengamanan.
3. Kalau diizinkan → ambil versi yang hash-nya sama dengan ledger → Vault meng-unwrap DEK → dekripsi.
4. SHA-256 hasil dekripsi dicocokkan lagi dengan ledger. Kalau beda → alert `StorageIntegrity`.
5. PDF dirender dengan watermark (nama, NRP, waktu, txId) dan dikirim `no-store`.

## Struktur

```
sandi-chain/
├── chaincode/sandichain/      Chaincode Go (fabric-contract-api-go v2)
│   └── contract/              contract.go, helpers.go (aturan akses), model.go, rules_test.go
├── backend/                   NestJS
│   ├── src/fabric/            Fabric Gateway, 1 gateway per personel
│   ├── src/crypto/            Envelope encryption (Vault Transit / local)
│   ├── src/watermark/         Watermark PDF/gambar (pdf-lib)
│   ├── src/alerts/            Sentinel: listener event + SSE + Wazuh + webhook
│   ├── src/documents/         Alur bisnis dokumen
│   ├── config/users.seed.json Personel demo (fiktif)
│   └── scripts/               enroll-users.mjs, demo.mjs
├── frontend/                  Next.js 16 (App Router)
├── scripts/                   network-up.sh, network-down.sh, cc-upgrade.sh
├── infra/seaweedfs/           Konfigurasi kredensial S3
└── docker-compose.yml
```

## Menjalankan

Prasyarat: Docker, Node.js 22, Go 1.22+, `curl`, `jq` (dipakai script Fabric). Linux atau macOS (Windows lewat WSL2).

```bash
# 1. Infrastruktur off-chain (PostgreSQL, S3, Vault)
docker compose up -d

# 2. Jaringan Fabric + 2 channel + deploy chaincode (pertama kali ±5-10 menit, unduh image)
./scripts/network-up.sh

# 3. Backend
cd backend
npm install
cp .env.example .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 24)/" .env   # macOS: sed -i ''
npm run enroll          # register personel ke Fabric CA + buat wallet
npm run start:dev       # http://localhost:4000/api

# 4. Frontend (terminal lain)
cd frontend
npm install
npm run dev             # http://localhost:3000
```

Login dengan akun demo (password `sandi123`):

| Username | Jabatan | Clearance | Org | Role |
|---|---|---|---|---|
| `letkol.arya` | Danyon | SANGAT RAHASIA | Org1 | user |
| `mayor.dewi` | Kasi Intel | RAHASIA | Org1 | user |
| `kapten.andi` | Pasi Ops | SANGAT RAHASIA | Org2 | user |
| `serka.budi` | Staf TU | TERBATAS | Org2 | user |
| `auditor.pam` | Unit Pam | RAHASIA | Org1 | auditor |

## Demo otomatis (untuk presentasi)

Dengan backend berjalan:

```bash
cd backend && node scripts/demo.mjs
```

Skenario yang dijalankan (23 pengecekan):

1. Danyon mendaftarkan dokumen SANGAT RAHASIA, Kasi Intel mendaftarkan dokumen RAHASIA.
2. Staf TU tidak melihat keduanya di daftar dan ditolak saat membuka (tercatat + alert).
3. Pasi Ops (clearance SR) ditolak sebelum didisposisikan, lalu bisa membuka setelah disposisi. PDF-nya berwatermark.
4. Kasi Intel (RAHASIA) ditolak membuka dokumen SR.
5. Verifikasi: file asli → ASLI, file diubah 1 bit → TIDAK COCOK.
6. Non-pemilik mencoba merevisi → ditolak dan tercatat. Pemilik merevisi → v2, file v1 tetap terverifikasi sebagai versi lama.
7. Simulasi admin storage mengubah ciphertext → pembukaan ditolak + alert `StorageIntegrity`.
8. Auditor melihat seluruh alert dan jejak; Staf TU ditolak membuka dashboard audit.

Tips demo live: buka `/security` sebagai `auditor.pam` di satu jendela, lalu di jendela lain (incognito) login `serka.budi` dan coba buka dokumen rahasia. Alert muncul seketika.

## API ringkas

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | Login, cookie httpOnly |
| GET | `/api/documents` | Daftar dokumen (disaring chaincode sesuai clearance) |
| POST | `/api/documents` | Registrasi (multipart: `file`, `nomor`, `perihal`, `klasifikasi`) |
| GET | `/api/documents/:id/view` | Buka dokumen (PDF berwatermark), header `X-Access-Tx` |
| POST | `/api/documents/:id/verify` | Verifikasi keaslian (multipart `file`) |
| POST | `/api/documents/:id/versions` | Revisi (pemilik) |
| POST | `/api/documents/:id/disposition` | `{ recipient, catatan }` |
| POST | `/api/documents/:id/revoke` | `{ alasan }` |
| GET | `/api/documents/:id/audit` | Jejak akses (pemilik/auditor) |
| GET | `/api/documents/:id/history` | History key langsung dari ledger |
| GET | `/api/audit`, `/api/alerts` | Auditor |
| GET | `/api/alerts/stream` | SSE real time (auditor) |

## Fungsi chaincode

| Fungsi | Jenis | Catatan |
|---|---|---|
| `RegisterDocument(docId, nomor, hash, klasifikasi)` | submit | Clearance ≥ klasifikasi |
| `AddVersion(docId, hash)` | submit | Pemilik; hash lama masuk `history` |
| `RequestAccess(docId)` | submit | Selalu mencatat; event `UnauthorizedAccess` saat ditolak |
| `VerifyDocument(docId, hash)` | submit | Event `DocumentTampered` saat tidak cocok |
| `AddDisposition(docId, recipient, catatan)` | submit | Pemilik |
| `RevokeDocument(docId, alasan)` | submit | Pemilik atau role admin |
| `GetDocument`, `ListDocuments` | evaluate | Disaring clearance |
| `GetAuditTrail`, `GetAllAuditLogs`, `GetDocumentHistory` | evaluate | Pemilik / auditor / admin |

Aturan akses ada di satu fungsi murni `CanAccess` (`helpers.go`) dan diuji di `rules_test.go`.

## Pengujian

```bash
cd chaincode/sandichain && go test ./...     # aturan akses & pencocokan versi
cd backend && npm test                        # enkripsi, tamper GCM, watermark
cd backend && node scripts/demo.mjs           # end-to-end di jaringan Fabric asli
```

Upgrade chaincode tanpa menghapus ledger: `./scripts/cc-upgrade.sh 1.2 3` (versi, sequence naik 1 tiap upgrade).

## Batasan prototype & jalan ke produksi

Prototype ini sengaja disederhanakan. Untuk penggunaan nyata:

| Prototype | Produksi |
|---|---|
| Kunci privat personel disimpan server (`wallet/`) | Kunci di smartcard/token. Fabric Gateway sudah mendukung `signers.newHSMSigner` (PKCS#11). |
| Login username/password + `users.json` | Keycloak/LDAP + mTLS smartcard. Clearance tetap dari sertifikat. |
| Vault dev mode (in-memory, token root) | Vault HA, auto-unseal dengan HSM, policy per service, audit device aktif. |
| `test-network` 2 org di satu mesin | Peer & orderer per Kodam/satuan, Raft ≥3 orderer (atau BFT di Fabric 3), CA terpisah, TLS mutual. |
| Perihal di PostgreSQL plaintext | Private Data Collection Fabric atau enkripsi kolom. |
| Watermark & viewer | Ditambah DRM/viewer terkunci, pemblokiran print/download di endpoint. Watermark tidak mencegah pemotretan, tapi membuat pelaku bisa dilacak. |
| SeaweedFS dev | Object storage on-prem terenkripsi (MinIO/Ceph) di jaringan terisolasi. |

Semua komponen berjalan on-prem tanpa internet (font sistem, tanpa CDN), sesuai untuk jaringan air-gapped. Unduhan image dan dependency hanya diperlukan saat instalasi.

## Docker (opsional)

```bash
docker compose --profile app up -d --build   # backend + frontend dalam container
```

Prasyarat sama: jaringan Fabric jalan dan `npm run enroll` sudah dilakukan (wallet & users.json di-mount read-only).

## Reset total

```bash
./scripts/network-down.sh
docker compose down -v
```
