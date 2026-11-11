'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { klasLabel } from '@/lib/api';
import { useAuth } from './auth';

export function Stamp({ k }: { k: string }) {
  return (
    <span className="stamp" data-k={k}>
      {klasLabel(k)}
    </span>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, signing, refused, ejectCard } = useAuth();
  const path = usePathname();

  if (loading || !user || signing === 'checking') {
    return <div className="empty">Memuat sesi…</div>;
  }
  if (signing === 'need-card') return <CardGate />;

  const nav = [
    { href: '/', label: 'Dokumen' },
    { href: '/documents/new', label: 'Registrasi' },
    { href: '/verify', label: 'Verifikasi' },
    ...(user.role === 'auditor' || user.role === 'admin' ? [{ href: '/security', label: 'Pengamanan' }] : []),
  ];
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <>
      <div className="class-banner" data-k={user.clearance}>
        SESI {klasLabel(user.clearance)} — SETIAP AKSES DICATAT DI LEDGER
      </div>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark">S</span>
          SANDI-CHAIN
        </Link>
        <nav className="nav">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="who">
          <div className="who-text">
            <b>{user.nama}</b>
            <span>
              {user.jabatan} · {user.mspId} · <Stamp k={user.clearance} />
            </span>
          </div>
          {signing === 'ready' && (
            <button className="btn btn-sm btn-ghost" onClick={ejectCard} title="Hapus kunci dari perangkat ini">
              Lepas kartu
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={logout}>
            Keluar
          </button>
        </div>
      </header>
      <main className="page">
        {refused && (
          <div className="notice notice-bad" style={{ marginBottom: 16 }}>
            <b>Perangkat menolak menandatangani permintaan dari server.</b>
            <div>{refused}</div>
            <div className="faint">Jika Anda tidak sedang melakukan aksi tersebut, laporkan ke unit pengamanan.</div>
          </div>
        )}
        {children}
      </main>
    </>
  );
}

/** Mode tanda tangan di perangkat: sebelum bisa bekerja, kunci personel harus ada di perangkat ini. */
function CardGate() {
  const { user, importCard, logout } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await importCard(file, pin);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login card card-pad stack" onSubmit={submit}>
        <div>
          <h1>Kartu identitas</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Transaksi <b>{user?.nama}</b> ditandatangani di perangkat ini, bukan di server. Impor kartu identitas Anda sekali; kuncinya
            disimpan sehingga tidak bisa disalin keluar dari browser ini.
          </p>
        </div>
        <label className={`drop ${file ? 'has' : ''}`}>
          <input type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <b>{file ? file.name : 'Pilih file kartu'}</b>
          <span className="faint">{user?.username}.card.json</span>
        </label>
        <div className="field">
          <label htmlFor="pin">PIN kartu</label>
          <input id="pin" className="input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" />
        </div>
        {error && <div className="notice notice-bad">{error}</div>}
        <button className="btn btn-primary" disabled={!file || !pin || busy}>
          {busy ? 'Membuka kartu…' : 'Impor kartu'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Keluar
        </button>
      </form>
    </div>
  );
}

export function FilePick({ file, onChange, hint }: { file: File | null; onChange: (f: File | null) => void; hint?: string }) {
  return (
    <label className={`drop ${file ? 'has' : ''}`}>
      <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      {file ? (
        <>
          <b>{file.name}</b>
          <span className="faint">{(file.size / 1024).toFixed(1)} KB · klik untuk ganti</span>
        </>
      ) : (
        <>
          <b>Pilih file</b>
          <span className="faint">{hint ?? 'PDF, PNG, atau JPG · maks 25 MB'}</span>
        </>
      )}
    </label>
  );
}
