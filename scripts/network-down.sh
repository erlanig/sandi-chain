#!/usr/bin/env bash
# Mematikan jaringan Fabric dan menghapus seluruh ledger + identitas.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_SAMPLES="${FABRIC_SAMPLES:-$ROOT/fabric-samples}"
export PATH="$FABRIC_SAMPLES/bin:$PATH"
(cd "$FABRIC_SAMPLES/test-network" && ./network.sh down)
rm -rf "$ROOT/backend/wallet" "$ROOT/backend/config/users.json"
echo "Jaringan dimatikan. Jalankan juga 'docker compose down -v' untuk reset PostgreSQL/MinIO/Vault."
