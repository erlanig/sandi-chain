#!/usr/bin/env bash
# Menyalakan jaringan Hyperledger Fabric (2 org + Raft + Fabric CA),
# membuat channel per klasifikasi, dan deploy chaincode sandichain.
#
#   ch-umum    -> dokumen BIASA & TERBATAS
#   ch-rahasia -> dokumen RAHASIA & SANGAT_RAHASIA
#
# Org1 = Mabesad/Kodam, Org2 = Satuan (nama org mengikuti test-network).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_SAMPLES="${FABRIC_SAMPLES:-$ROOT/fabric-samples}"
FABRIC_VERSION="${FABRIC_VERSION:-2.5.16}"
CA_VERSION="${CA_VERSION:-1.5.17}"
CC_NAME="${CC_NAME:-sandichain}"
CHANNELS=(${CHANNELS:-ch-umum ch-rahasia})

if [[ ! -d "$FABRIC_SAMPLES/test-network" ]]; then
  echo ">> Mengunduh fabric-samples, binary, dan image Docker (Fabric $FABRIC_VERSION, CA $CA_VERSION)"
  cd "$ROOT"
  curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
  chmod +x install-fabric.sh
  ./install-fabric.sh -f "$FABRIC_VERSION" -c "$CA_VERSION" docker samples binary
  rm -f install-fabric.sh
fi

export PATH="$FABRIC_SAMPLES/bin:$PATH"
cd "$FABRIC_SAMPLES/test-network"

echo ">> Mematikan jaringan lama (jika ada)"
./network.sh down

# Identitas lama tidak berlaku lagi setelah CA dibuat ulang
rm -rf "$ROOT/backend/wallet" "$ROOT/backend/config/users.json"

echo ">> Menyalakan peer, orderer (Raft), dan Fabric CA"
./network.sh up -ca

for ch in "${CHANNELS[@]}"; do
  echo ">> Channel $ch"
  ./network.sh createChannel -c "$ch"
  ./network.sh deployCC -c "$ch" -ccn "$CC_NAME" -ccp "$ROOT/chaincode/sandichain" -ccl go
done

echo
echo "Jaringan siap. Lanjut:"
echo "  cd backend && npm run enroll"
