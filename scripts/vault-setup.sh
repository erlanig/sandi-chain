#!/usr/bin/env bash
# Siapkan Vault untuk SANDI-Chain dengan pemisahan wewenang:
#   - token backend  : HANYA boleh membuat DEK baru (transit/datakey), TIDAK bisa decrypt
#   - token keyguard : HANYA boleh decrypt (dan hanya melepas DEK jika ada ACCESS_GRANTED di ledger)
# Idempoten. Vault dev mode in-memory: jalankan ulang setiap kali Vault di-restart.
#
#   ./scripts/vault-setup.sh            -> cetak baris untuk backend/.env
set -euo pipefail
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
ROOT="${VAULT_ROOT_TOKEN:-root}"
DOC_KEY="${VAULT_DOC_KEY:-sandichain-doc}"
LEGACY_KEY="${VAULT_TRANSIT_KEY:-sandichain}"

v() { # method path [json]
  curl -sS -f -X "$1" -H "X-Vault-Token: $ROOT" -H 'Content-Type: application/json' ${3:+-d "$3"} "$VAULT_ADDR/v1/$2"
}

v POST sys/mounts/transit '{"type":"transit"}' >/dev/null 2>&1 || true   # sudah ter-mount => abaikan
# derived=true: DEK di-derive dengan konteks channel/docId, tidak bisa dibuka atas nama dokumen lain
v POST "transit/keys/$DOC_KEY" '{"type":"aes256-gcm96","derived":true}' >/dev/null
v POST "transit/keys/$LEGACY_KEY" '{"type":"aes256-gcm96"}' >/dev/null   # DEK format lama

policy() { # name hcl
  v PUT "sys/policies/acl/$1" "$(jq -n --arg p "$2" '{policy: $p}')" >/dev/null
}
policy sandi-backend "path \"transit/datakey/plaintext/$DOC_KEY\" { capabilities = [\"update\"] }"
policy sandi-keyguard "path \"transit/decrypt/$DOC_KEY\" { capabilities = [\"update\"] }
path \"transit/decrypt/$LEGACY_KEY\" { capabilities = [\"update\"] }"

token() { # policy
  v POST auth/token/create "{\"policies\":[\"$1\"],\"no_parent\":true,\"period\":\"768h\",\"display_name\":\"$1\"}" | jq -r .auth.client_token
}

SECRET="$(openssl rand -hex 32)"
echo "# ---- backend/.env (ganti nilai lama) ----"
echo "VAULT_TOKEN=$(token sandi-backend)"
echo "KEYGUARD_URL=http://localhost:4100"
echo "KEYGUARD_SECRET=$SECRET"
echo
echo "# ---- backend/keyguard.env (file baru, hanya untuk proses KeyGuard) ----"
echo "KEYGUARD_VAULT_TOKEN=$(token sandi-keyguard)"
echo "KEYGUARD_SECRET=$SECRET"
