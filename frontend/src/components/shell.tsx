'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { ChevronDown, CreditCard, FilePlus2, Files, LogOut, Menu, PenLine, ShieldCheck, Siren, type LucideIcon } from 'lucide-react';
import { klasLabel } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from './auth';
import { ClassBanner, Empty, FilePick, Logo, Notice, Panel, Stamp, ThemeToggle } from './kit';
import { SiteFooter } from './site-footer';
import { Button } from './ui/button';
import { Field, Input } from './ui/input';

type NavItem = { href: string; label: string; icon: LucideIcon };

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, refused, signing } = useAuth();
  const path = usePathname();

  if (loading || !user || signing === 'checking') {
    return <Empty className="pt-24">Memuat sesi…</Empty>;
  }
  if (signing === 'need-card') return <CardGate />;

  const nav: NavItem[] = [
    { href: '/documents', label: 'Dokumen', icon: Files },
    { href: '/documents/new', label: 'Registrasi', icon: FilePlus2 },
    { href: '/verify', label: 'Verifikasi', icon: ShieldCheck },
    ...(user.role === 'auditor' || user.role === 'admin' ? [{ href: '/security', label: 'Pengamanan', icon: Siren }] : []),
  ];
  // "/documents/new" adalah menu sendiri; halaman dokumen lain termasuk "Dokumen".
  const active = (href: string) =>
    href === '/documents' ? path.startsWith('/documents') && path !== '/documents/new' : path.startsWith(href);
  const current = nav.find((n) => active(n.href));

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* banner sesi + navbar menempel di atas layar */}
      <div className="fixed inset-x-0 top-0 z-40">
        <ClassBanner k={user.clearance}>
          <span className="block truncate">Sesi {klasLabel(user.clearance)} — setiap akses dicatat di ledger</span>
        </ClassBanner>
        <header className="border-b border-line bg-panel/85 backdrop-blur-xl">
          <div className="mx-auto grid h-16 max-w-[1360px] grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-6">
          <div className="flex items-center gap-1 justify-self-start">
            <MobileNav nav={nav} active={active} current={current?.label} />
            <Link href="/documents" className="flex items-center gap-2.5 rounded-full py-1 pr-3 pl-2 max-lg:pl-1">
              <Logo className="h-6" />
              <span className="text-[15px] font-bold tracking-[-0.01em] max-md:hidden">SANDI-Chain</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Utama">
            {nav.map((n) => {
              const on = active(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium transition-colors',
                    on ? 'bg-accent text-accent-ink shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]' : 'text-muted hover:bg-panel-2 hover:text-ink',
                  )}
                >
                  <Icon className="size-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="col-start-3 flex items-center gap-1 justify-self-end max-lg:col-start-2">
            <ThemeToggle className="rounded-full" />
            <ProfileMenu />
          </div>
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 pt-[120px] pb-16 sm:px-6">
        {refused && (
          <Notice tone="bad" className="mb-5">
            <b>Perangkat menolak menandatangani permintaan dari server.</b>
            <div>{refused}</div>
            <div className="text-muted">Jika Anda tidak sedang melakukan aksi tersebut, laporkan ke unit pengamanan.</div>
          </Notice>
        )}
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

/** Menu untuk layar kecil: dropdown dari tombol hamburger di dalam kapsul. */
function MobileNav({ nav, active, current }: { nav: NavItem[]; active: (href: string) => boolean; current?: string }) {
  const router = useRouter();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="grid size-10 place-items-center rounded-full text-muted outline-none hover:bg-panel-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-panel-2 lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={14} className="z-50 w-64 rounded-3xl border border-line bg-panel p-2 shadow-xl shadow-black/15">
          <p className="px-3 pt-2 pb-1.5 text-[11.5px] font-medium tracking-[0.06em] text-faint uppercase">{current ?? 'Menu'}</p>
          {nav.map((n) => {
            const on = active(n.href);
            const Icon = n.icon;
            return (
              <DropdownMenu.Item
                key={n.href}
                onSelect={() => router.push(n.href)}
                className={cn(
                  'flex h-11 cursor-pointer items-center gap-3 rounded-2xl px-3 text-[14px] outline-none',
                  on ? 'bg-accent font-semibold text-accent-ink' : 'text-ink data-[highlighted]:bg-panel-2',
                )}
              >
                <Icon className="size-[18px]" />
                {n.label}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function initials(nama: string) {
  // Lewati pangkat/korps (mis. "Letkol Inf"): pakai dua kata terakhir.
  const w = nama.split(/\s+/).filter(Boolean);
  return w.slice(-2).map((x) => x[0]).join('').toUpperCase();
}

function ProfileMenu() {
  const { user, logout, signing, ejectCard } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 text-left transition-colors outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-panel-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-ink">{initials(user.nama)}</span>
        <span className="hidden leading-tight md:block">
          <span className="block max-w-48 truncate text-[13px] font-semibold">{user.nama}</span>
          <span className="block text-xs text-muted">{user.jabatan}</span>
        </span>
        <ChevronDown className="size-4 text-muted" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-3xl border border-line bg-panel p-2 text-ink shadow-xl shadow-black/15"
        >
          <div className="px-3 pt-2.5 pb-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-ink">{initials(user.nama)}</span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold">{user.nama}</p>
                <p className="font-mono text-[11.5px] text-muted">NRP {user.nrp}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="truncate">
                {user.jabatan} · {user.mspId}
              </span>
              <Stamp k={user.clearance} className="text-[10.5px]" />
            </div>
            <p className="mt-2.5 flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2 text-[12.5px] text-muted">
              <PenLine className="size-3.5" />
              {signing === 'ready' ? 'Tanda tangan di perangkat ini' : 'Tanda tangan oleh server'}
            </p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {signing === 'ready' && (
            <DropdownMenu.Item
              onSelect={ejectCard}
              className="flex h-10 cursor-pointer items-center gap-2.5 rounded-2xl px-3 text-[13px] outline-none data-[highlighted]:bg-panel-2"
            >
              <CreditCard className="size-4 text-muted" /> Lepas kartu dari perangkat
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onSelect={logout}
            className="flex h-10 cursor-pointer items-center gap-2.5 rounded-2xl px-3 text-[13px] text-bad outline-none data-[highlighted]:bg-bad-wash"
          >
            <LogOut className="size-4" /> Keluar
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
    <>
      {user && <ClassBanner k={user.clearance}>Sesi {klasLabel(user.clearance)} — kartu identitas diperlukan</ClassBanner>}
      <div className="grid min-h-[calc(100vh-24px)] place-items-center p-4">
        <Panel className="w-full max-w-md">
          <form className="grid gap-4 p-6" onSubmit={submit}>
            <div>
              <div className="mb-3 flex items-center justify-between text-accent">
                <CreditCard className="size-6" />
                <ThemeToggle />
              </div>
              <h1 className="title text-2xl">Kartu identitas</h1>
              <p className="mt-1.5 text-muted">
                Transaksi <b className="text-ink">{user?.nama}</b> ditandatangani di perangkat ini, bukan di server. Impor kartu identitas Anda
                sekali; kuncinya disimpan sehingga tidak bisa disalin keluar dari browser ini.
              </p>
            </div>
            <FilePick file={file} onChange={setFile} accept="application/json,.json" label="Pilih file kartu" hint={`${user?.username}.card.json`} />
            <Field label="PIN kartu" htmlFor="pin">
              <Input id="pin" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" />
            </Field>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" className="flex-1" disabled={!file || !pin || busy}>
                {busy ? 'Membuka kartu…' : 'Impor kartu'}
              </Button>
              <Button variant="ghost" onClick={logout}>
                Keluar
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}
