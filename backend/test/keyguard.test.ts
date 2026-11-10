import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkGrant, ReplayGuard } from '../src/keyguard/grant';

const now = Date.parse('2026-11-10T08:00:00Z');
const tx = 'a'.repeat(64);
const grant = (o: Record<string, string> = {}) => ({
  txId: tx, docId: 'DOC-1', action: 'ACCESS_GRANTED', actor: 'mayor.dewi', actorOrg: 'Org1MSP',
  clearance: 'RAHASIA', jabatan: '-', detail: '', timestamp: '2026-11-10T07:59:30Z', ...o,
});
const req = { docId: 'DOC-1', txId: tx };

test('keyguard: ACCESS_GRANTED yang baru diterima', () => {
  assert.equal(checkGrant(grant(), req, now, 120).ok, true);
});

test('keyguard: entri tidak ada / ACCESS_DENIED / dokumen lain ditolak', () => {
  assert.equal(checkGrant(null, req, now, 120).ok, false);
  assert.equal(checkGrant(grant({ action: 'ACCESS_DENIED' }), req, now, 120).ok, false);
  assert.equal(checkGrant(grant({ action: 'VERIFY_OK' }), req, now, 120).ok, false);
  assert.equal(checkGrant(grant({ docId: 'DOC-2' }), req, now, 120).ok, false);
});

test('keyguard: bukti kedaluwarsa atau bertanggal masa depan ditolak', () => {
  assert.equal(checkGrant(grant({ timestamp: '2026-11-10T07:57:00Z' }), req, now, 120).ok, false);
  assert.equal(checkGrant(grant({ timestamp: '2026-11-10T08:05:00Z' }), req, now, 120).ok, false);
  assert.equal(checkGrant(grant({ timestamp: 'bukan-tanggal' }), req, now, 120).ok, false);
});

test('keyguard: satu bukti akses hanya bisa dipakai sekali', () => {
  const g = new ReplayGuard(60_000);
  assert.equal(g.claim(tx, now), true);
  assert.equal(g.claim(tx, now + 1000), false);
  assert.equal(g.claim('b'.repeat(64), now), true);
});
