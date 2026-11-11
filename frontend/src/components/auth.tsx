'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, post, User } from '@/lib/api';
import { loadCard, removeCard, saveCard } from '@/lib/card';
import { openCard, parseCard } from '@/lib/card-crypto';
import { startSigner } from '@/lib/signer';

/**
 * server    = transaksi ditandatangani kunci di server (mode dev)
 * ready     = kunci ada di perangkat ini dan penanda tangan berjalan
 * need-card = mode client, tapi perangkat ini belum punya kartu yang cocok
 */
/** Halaman yang boleh dibuka tanpa login. */
const PUBLIC_PATHS = ['/', '/login'];

export type Signing = 'checking' | 'server' | 'ready' | 'need-card';

interface SignInfo {
  mode: 'client' | 'server';
  certFp: string;
  chaincode: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signing: Signing;
  /** Alasan terakhir perangkat menolak menandatangani (ditampilkan sebagai peringatan). */
  refused: string;
  importCard: (file: File, pin: string) => Promise<void>;
  ejectCard: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<Signing>('checking');
  const [refused, setRefused] = useState('');
  const info = useRef<SignInfo | null>(null);
  const stopSigner = useRef<(() => void) | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const run = useCallback((key: CryptoKey, chaincode: string) => {
    stopSigner.current?.();
    stopSigner.current = startSigner(key, chaincode, setRefused);
    setSigning('ready');
  }, []);

  // Setiap kali user berganti: cari tahu mode tanda tangan dan siapkan kunci perangkat.
  useEffect(() => {
    stopSigner.current?.();
    stopSigner.current = null;
    info.current = null;
    setSigning('checking');
    setRefused('');
    if (!user) return;
    let cancelled = false;
    (async () => {
      const i = await api<SignInfo>('/sign/info');
      if (cancelled) return;
      info.current = i;
      if (i.mode !== 'client') return setSigning('server');
      const card = await loadCard(user.username).catch(() => undefined);
      if (cancelled) return;
      if (card && card.certFp === i.certFp) run(card.key, i.chaincode);
      else setSigning('need-card');
    })().catch(() => !cancelled && setSigning('need-card'));
    return () => {
      cancelled = true;
    };
  }, [user, run]);

  useEffect(() => () => stopSigner.current?.(), []);

  const importCard = useCallback(
    async (file: File, pin: string) => {
      if (!user || !info.current) throw new Error('Belum login');
      if (!globalThis.crypto?.subtle) throw new Error('WebCrypto tidak tersedia: buka portal lewat HTTPS atau localhost');
      const card = parseCard(await file.text());
      if (card.username !== user.username) throw new Error(`Kartu ini milik ${card.username}, bukan ${user.username}`);
      if (card.certFp !== info.current.certFp) throw new Error('Kartu tidak cocok dengan sertifikat yang terdaftar (kartu lama?)');
      const key = await openCard(card, pin);
      await saveCard({ username: user.username, certFp: card.certFp, key });
      run(key, info.current.chaincode);
    },
    [user, run],
  );

  const ejectCard = useCallback(async () => {
    if (!user) return;
    stopSigner.current?.();
    stopSigner.current = null;
    await removeCard(user.username);
    setSigning('need-card');
  }, [user]);

  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname)) router.replace('/login');
  }, [loading, user, pathname, router]);

  const login = useCallback(
    async (username: string, password: string) => {
      const u = await post<User>('/auth/login', { username, password });
      setUser(u);
      router.replace('/documents');
    },
    [router],
  );

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    setUser(null);
    router.replace('/login');
  }, [router]);

  return (
    <Ctx.Provider value={{ user, loading, login, logout, signing, refused, importCard, ejectCard }}>{children}</Ctx.Provider>
  );
}
