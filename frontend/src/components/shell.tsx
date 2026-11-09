'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const { user, loading, logout } = useAuth();
  const path = usePathname();

  if (loading || !user) {
    return <div className="empty">Memuat sesi…</div>;
  }

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
          <button className="btn btn-sm btn-ghost" onClick={logout}>
            Keluar
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
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
