#!/usr/bin/env bash
# Upgrade chaincode sandichain di semua channel tanpa menghapus ledger.
#   ./scripts/cc-upgrade.sh 1.1 2     (versi, sequence)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_SAMPLES="${FABRIC_SAMPLES:-$ROOT/fabric-samples}"
VERSION="${1:?versi chaincode, mis. 1.1}"
SEQUENCE="${2:?sequence, mis. 2 (naik 1 tiap upgrade)}"
CHANNELS=(${CHANNELS:-ch-umum ch-rahasia})

export PATH="$FABRIC_SAMPLES/bin:$PATH"
cd "$FABRIC_SAMPLES/test-network"
for ch in "${CHANNELS[@]}"; do
  ./network.sh deployCC -c "$ch" -ccn sandichain -ccp "$ROOT/chaincode/sandichain" -ccl go -ccv "$VERSION" -ccs "$SEQUENCE"
done
