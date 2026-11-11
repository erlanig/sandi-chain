/**
 * Penyimpanan kunci di perangkat: CryptoKey non-extractable di IndexedDB.
 * Yang tersimpan adalah "pegangan" kunci, bukan byte kuncinya: JavaScript
 * (termasuk skrip jahat di halaman) tidak bisa membaca atau menyalinnya,
 * hanya bisa meminta tanda tangan selama halaman terbuka.
 */
export interface StoredCard {
  username: string;
  certFp: string;
  key: CryptoKey;
}

const DB = 'sandi-chain';
const STORE = 'cards';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'username' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB tidak tersedia'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const loadCard = (username: string) => run<StoredCard | undefined>('readonly', (s) => s.get(username));
export const saveCard = (card: StoredCard) => run('readwrite', (s) => s.put(card));
export const removeCard = (username: string) => run('readwrite', (s) => s.delete(username));
