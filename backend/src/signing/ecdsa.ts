/** Orde kurva P-256 (secp256r1). */
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const HALF_N = N >> 1n;

/**
 * Ubah tanda tangan ECDSA P-256 format WebCrypto (r||s, 64 byte) menjadi
 * ASN.1 DER dengan s "rendah" (s <= n/2), bentuk yang diwajibkan Fabric.
 * Normalisasi s tidak butuh kunci privat: (r, s) dan (r, n-s) sama-sama sah.
 */
export function p1363ToDerLowS(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) throw new Error(`Tanda tangan harus 64 byte (r||s), dapat ${raw.length}`);
  const r = toBig(raw.subarray(0, 32));
  let s = toBig(raw.subarray(32));
  if (r === 0n || s === 0n || r >= N || s >= N) throw new Error('Tanda tangan di luar rentang kurva');
  if (s > HALF_N) s = N - s;
  const body = Buffer.concat([derInt(r), derInt(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]); // panjang selalu < 128
}

function toBig(b: Uint8Array): bigint {
  return BigInt('0x' + Buffer.from(b).toString('hex'));
}

function derInt(v: bigint): Buffer {
  let hex = v.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = Buffer.from(hex, 'hex');
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]); // tetap positif
  return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
}
