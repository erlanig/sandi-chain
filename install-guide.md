# Panduan Instalasi SANDI-Chain untuk Windows

## Status Instalasi

✅ Node.js v24.14.0 - TERINSTAL
✅ Docker v29.1.3 - TERINSTAL  
✅ WSL2 (Ubuntu 24.04) - TERINSTAL
❌ Go - PERLU DIINSTAL

## Langkah 1: Install Go

### Opsi A - Manual Download (Direkomendasikan):
1. Buka browser dan download Go dari: https://go.dev/dl/
2. Download file: **go1.23.x.windows-amd64.msi** (versi terbaru)
3. Jalankan installer (.msi file)
4. Ikuti wizard instalasi (default settings OK)
5. Restart PowerShell/terminal setelah instalasi

### Opsi B - Menggunakan Chocolatey (jika sudah terinstal):
```powershell
choco install golang
```

### Opsi C - Menggunakan winget:
```powershell
winget install GoLang.Go
```

Setelah instalasi, buka PowerShell BARU dan cek:
```powershell
go version
```

## Langkah 2: Install Tools di WSL2

Buka WSL2 terminal dan jalankan:

```bash
# Update package list
sudo apt update

# Install curl dan jq (diperlukan untuk script Fabric)
sudo apt install -y curl jq

# Cek instalasi
curl --version
jq --version
```

## Langkah 3: Jalankan Infrastruktur

Di PowerShell Windows:
```powershell
cd c:\Software\sandi-chain
docker compose up -d
```

## Langkah 4: Jalankan Fabric Network

Di WSL2 terminal:
```bash
cd /mnt/c/Software/sandi-chain
./scripts/network-up.sh
```

**CATATAN**: Proses pertama kali butuh 5-10 menit karena download Docker images.

## Langkah 5: Setup Backend

Di PowerShell Windows:
```powershell
cd c:\Software\sandi-chain\backend

# Install dependencies
npm install

# Copy dan setup environment
Copy-Item .env.example .env

# Generate JWT secret
$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
(Get-Content .env) -replace '^JWT_SECRET=.*', "JWT_SECRET=$jwtSecret" | Set-Content .env

# Enroll users ke Fabric CA
npm run enroll

# Jalankan backend
npm run start:dev
```

### Opsional (disarankan): KeyGuard

KeyGuard memisahkan izin dekripsi dari backend: kunci dokumen hanya dilepas kalau ada `ACCESS_GRANTED` di ledger. Tanpa langkah ini aplikasi tetap jalan (backend mendekripsi langsung dengan token root Vault), tapi hanya cocok untuk development.

```bash
# Di WSL2, dari folder sandi-chain (butuh curl, jq, openssl)
./scripts/vault-setup.sh
```

Script mencetak dua blok. Salin blok pertama ke `backend/.env` (ganti `VAULT_TOKEN` lama) dan blok kedua ke file baru `backend/keyguard.env`. Lalu restart backend dan jalankan KeyGuard di terminal baru:

```powershell
cd c:\Software\sandi-chain\backend
npm run keyguard:dev
```

KeyGuard berjalan di: http://127.0.0.1:4100/keyguard

Catatan: Vault berjalan dalam dev mode (in-memory). Setiap kali container Vault di-restart, jalankan ulang `vault-setup.sh` dan perbarui kedua file env.

Backend akan berjalan di: http://localhost:4000

## Langkah 6: Setup Frontend (Terminal Baru)

Di PowerShell Windows (terminal baru):
```powershell
cd c:\Software\sandi-chain\frontend

# Install dependencies
npm install

# Jalankan frontend
npm run dev
```

Frontend akan berjalan di: http://localhost:3000

## Akun Demo untuk Login

| Username | Password | Jabatan | Clearance | Org |
|---|---|---|---|---|
| letkol.arya | sandi123 | Danyon | SANGAT RAHASIA | Org1 |
| mayor.dewi | sandi123 | Kasi Intel | RAHASIA | Org1 |
| kapten.andi | sandi123 | Pasi Ops | SANGAT RAHASIA | Org2 |
| serka.budi | sandi123 | Staf TU | TERBATAS | Org2 |
| auditor.pam | sandi123 | Unit Pam | RAHASIA | Org1 |

## Troubleshooting

### Error: "Cannot connect to Docker daemon"
- Pastikan Docker Desktop running
- Restart Docker Desktop

### Error di network-up.sh
- Pastikan menjalankan di WSL2 (bukan PowerShell)
- Cek apakah Docker accessible dari WSL2: `docker ps`

### Opsional (disarankan): tanda tangan di perangkat

Secara default kunci privat tiap personel disimpan di server (`backend/wallet/`). Untuk memindahkannya ke perangkat personel:

1. Di `backend/.env` set `SIGNING_MODE=client`.
2. Jalankan ulang `npm run enroll`. Kartu identitas tiap personel dibuat di `backend/cards/` (PIN default `123456`), dan kunci mereka tidak lagi disimpan di `wallet/`.
3. Restart backend.
4. Saat login pertama di sebuah browser, portal meminta file kartu (`<username>.card.json`) dan PIN. Cukup sekali per browser.

Portal harus dibuka lewat `http://localhost:3000` atau HTTPS, karena browser hanya mengizinkan WebCrypto di sana.

### Layar "Kartu identitas" muncul lagi setelah enroll ulang
`npm run enroll` menerbitkan sertifikat baru, jadi kartu lama tidak cocok lagi. Impor kartu yang baru dari `backend/cards/`.

### Error "Perangkat tidak menandatangani"
Backend menunggu tanda tangan dari browser user tersebut. Pastikan portal masih terbuka dan kartu sudah diimpor. Untuk `demo.mjs`, pastikan `backend/cards/` berisi kartu hasil enroll terakhir.

### Error "Identitas Fabric keyguard tidak ada di wallet"
Jalankan ulang `npm run enroll` (identitas layanan `keyguard` ditambahkan belakangan).

### Dokumen gagal dibuka dengan pesan "KeyGuard tidak dapat dihubungi"
`KEYGUARD_URL` terisi di `backend/.env` tetapi KeyGuard belum dijalankan. Jalankan `npm run keyguard:dev`, atau kosongkan `KEYGUARD_URL` untuk mode development.

### Jaringan Fabric sudah ada dari versi sebelumnya
Chaincode berubah (fungsi dan argumen baru). Upgrade tanpa menghapus ledger, lalu restart backend:
```bash
./scripts/cc-upgrade.sh 1.1 2   # versi, sequence (naik 1 tiap upgrade)
```

### Error saat npm run enroll
- Pastikan network Fabric sudah running (langkah 4 selesai)
- Cek logs: `docker compose logs`

### Port sudah digunakan
```powershell
# Cek port 3000, 4000, 5432, 8200, 8333
netstat -ano | findstr "3000 4000 5432"
```

## Demo Otomatis

Setelah semua berjalan, coba demo otomatis:
```powershell
cd c:\Software\sandi-chain\backend
node scripts/demo.mjs
```

## Stop Semua Services

```powershell
# Stop infrastruktur
docker compose down

# Stop Fabric network (di WSL2)
cd /mnt/c/Software/sandi-chain
./scripts/network-down.sh
```

## Reset Total (jika perlu mulai dari awal)

```powershell
# Di PowerShell
docker compose down -v

# Di WSL2
cd /mnt/c/Software/sandi-chain
./scripts/network-down.sh
```
