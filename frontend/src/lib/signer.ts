import { b64, sha256Hex, signMessage, toB64 } from './card-crypto';
import { decide, INTENT_TTL_MS, SignState } from './sign-policy';

const STATE_KEY = 'sandi.sign-state';

/** State kebijakan disimpan di localStorage supaya berlaku lintas tab (tab mana pun bisa menerima permintaan). */
function readState(): SignState {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? '');
    if (Array.isArray(s?.intents) && s.approved && typeof s.approved === 'object') return s;
  } catch {
    /* kosong / rusak */
  }
  return { intents: [], approved: {} };
}

function writeState(s: SignState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

/**
 * Daftarkan niat user tepat sebelum memanggil API yang menulis ke ledger.
 * Perangkat hanya menandatangani transaksi tulis yang cocok dengan niat ini.
 * `null` = argumen yang ditentukan server (mis. docId baru, MSP penerima).
 */
export function expectAction(fn: string, args: (string | null)[]) {
  const now = Date.now();
  const s = readState();
  s.intents = s.intents.filter((i) => i.exp > now);
  s.intents.push({ fn, args, exp: now + INTENT_TTL_MS });
  writeState(s);
}

/** SHA-256 file dihitung di perangkat: backend tidak bisa mendaftarkan file lain atas nama user. */
export async function fileHash(file: File): Promise<string> {
  return sha256Hex(await file.arrayBuffer());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jalankan loop penanda tangan. Mengembalikan fungsi untuk menghentikannya. */
export function startSigner(key: CryptoKey, chaincode: string, onRefuse?: (reason: string) => void): () => void {
  const ctl = new AbortController();
  const answer = (id: string, body: object) =>
    fetch(`/api/sign/${id}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  void (async () => {
    while (!ctl.signal.aborted) {
      try {
        const res = await fetch('/api/sign/next', { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal });
        if (res.status === 204) continue;
        if (res.status === 401) return; // sesi berakhir
        if (!res.ok) {
          await sleep(2000);
          continue;
        }
        const { id, message } = (await res.json()) as { id: string; message: string };
        const bytes = b64(message);
        const d = decide(bytes, readState(), Date.now(), chaincode);
        writeState(d.state);
        if (d.ok) {
          await answer(id, { signature: toB64(await signMessage(key, bytes)) });
        } else {
          onRefuse?.(d.reason);
          await answer(id, { refuse: d.reason });
        }
      } catch {
        if (ctl.signal.aborted) return;
        await sleep(2000);
      }
    }
  })();
  return () => ctl.abort();
}
