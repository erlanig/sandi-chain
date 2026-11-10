// "Kartu identitas" prototype untuk SIGNING_MODE=client: kunci privat personel
// (PKCS#8) dienkripsi dengan PIN. Dibuka di perangkat oleh frontend/src/lib/card-crypto.ts.
// Produksi: kunci dibangkitkan di dalam smartcard/token dan tidak pernah berbentuk file.
import crypto from 'node:crypto';

export const CARD_ITERATIONS = 310_000;

/** SHA-256 (hex) sertifikat X.509: dipakai perangkat untuk mencocokkan kartu dengan identitas di server. */
export function certFingerprint(certPem) {
  return crypto.createHash('sha256').update(new crypto.X509Certificate(certPem).raw).digest('hex');
}

export function makeCard({ username, mspId, certFp, keyPem, pin, iterations = CARD_ITERATIONS }) {
  const pkcs8 = crypto.createPrivateKey(keyPem).export({ type: 'pkcs8', format: 'der' });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const kek = crypto.pbkdf2Sync(pin, salt, iterations, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const ct = Buffer.concat([c.update(pkcs8), c.final(), c.getAuthTag()]); // format WebCrypto: ciphertext||tag
  pkcs8.fill(0);
  kek.fill(0);
  return {
    v: 1,
    username,
    mspId,
    certFp,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: salt.toString('base64') },
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
  };
}
