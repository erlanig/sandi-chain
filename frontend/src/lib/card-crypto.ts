/**
 * "Kartu identitas" prototype: kunci privat personel (PKCS#8) yang dienkripsi
 * dengan PIN, dibuat saat penerbitan (backend/scripts/enroll-users.mjs).
 * Format: PBKDF2-SHA256 -> AES-256-GCM. Produksi: smartcard/token, kunci
 * tidak pernah berbentuk file.
 *
 * Modul murni (hanya WebCrypto) supaya bisa diuji dari Node.
 */
export interface CardFile {
  v: 1;
  username: string;
  mspId: string;
  /** SHA-256 (hex) sertifikat X.509 pasangan kunci ini. */
  certFp: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  /** AES-GCM(pkcs8) + tag, base64. */
  ct: string;
}

export function parseCard(text: string): CardFile {
  let c: CardFile;
  try {
    c = JSON.parse(text);
  } catch {
    throw new Error('File kartu bukan JSON yang sah');
  }
  if (c?.v !== 1 || !c.username || !c.certFp || !c.ct || !c.iv || c.kdf?.name !== 'PBKDF2' || !(c.kdf.iterations >= 100_000)) {
    throw new Error('Format kartu identitas tidak dikenali');
  }
  return c;
}

/**
 * Buka kartu dengan PIN dan impor kuncinya sebagai CryptoKey yang TIDAK bisa
 * diekspor (extractable=false): setelah diimpor, kunci hanya bisa dipakai
 * menandatangani, tidak bisa dibaca lagi oleh JavaScript.
 */
export async function openCard(card: CardFile, pin: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  const kek = await subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(card.kdf.salt), iterations: card.kdf.iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: b64(card.iv) }, kek, b64(card.ct));
  } catch {
    throw new Error('PIN salah atau file kartu rusak');
  }
  try {
    return await subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } finally {
    new Uint8Array(pkcs8).fill(0);
  }
}

/** Tanda tangan ECDSA-SHA256 atas pesan utuh. Hasil: r||s (64 byte). */
export async function signMessage(key: CryptoKey, message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, message as BufferSource));
}

export function b64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource));
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
}
