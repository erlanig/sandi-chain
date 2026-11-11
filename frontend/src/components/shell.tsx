'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { ChevronDown, CreditCard, FilePlus2, Files, LogOut, Menu, ShieldCheck, Siren, type LucideIcon } from 'lucide-react';
import { klasLabel } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from './auth';
import { ClassBanner, Empty, FilePick, Logo, Notice, Panel, Stamp, ThemeToggle } from './kit';
import { Button } from './ui/button';
import { Field, Input } from './ui/input';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { title: string; items: NavItem[] };

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, refused, signing } = useAuth();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);

  if (loading || !user || signing === 'checking') {
    return <Empty className="pt-24">Memuat sesi…</Empty>;
  }
  if (signing === 'need-card') return <CardGate />;

  const groups: NavGroup[] = [
    {
      title: 'Dokumen',
      items: [
        { href: '/documents', label: 'Daftar dokumen', icon: Files },
        { href: '/documents/new', label: 'Registrasi', icon: FilePlus2 },
        { href: '/verify', label: 'Verifikasi', icon: ShieldCheck },
      ],
    },
    ...(user.role === 'auditor' || user.role === 'admin'
      ? [{ title: 'Pengamanan', items: [{ href: '/security', label: 'Pusat pengamanan', icon: Siren }] }]
      : []),
  ];
  // "/documents/new" adalah menu sendiri; halaman dokumen lain termasuk "Daftar dokumen".
  const active = (href: string) =>
    href === '/documents' ? path.startsWith('/documents') && path !== '/documents/new' : path.startsWith(href);
  const current = groups.flatMap((g) => g.items).find((n) => active(n.href));
  const CurrentIcon = current?.icon ?? Files;

  return (
    <div className="min-h-screen bg-bg">
      <div className="fixed inset-x-0 top-0 z-50">
        <ClassBanner k={user.clearance}>
          <span className="block truncate">Sesi {klasLabel(user.clearance)} — setiap akses dicatat di ledger</span>
        </ClassBanner>
      </div>

      {/* sidebar tetap (layar lebar) */}
      <aside className="fixed top-6 bottom-0 left-0 z-40 hidden w-[264px] lg:block">
        <Sidebar groups={groups} active={active} />
      </aside>

      {/* sidebar sebagai laci (layar kecil) */}
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
          <Dialog.Content className="fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] bg-bg shadow-2xl lg:hidden" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Sidebar groups={groups} active={active} onNavigate={() => setDrawer(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="pt-6 lg:py-2 lg:pr-2 lg:pl-[264px]">
        {/* panel konten putih di atas kanvas abu, seperti lembar kerja */}
        <div className="min-h-[calc(100vh-24px)] bg-panel lg:mt-6 lg:min-h-[calc(100vh-40px)] lg:rounded-2xl lg:border lg:border-line lg:shadow-[0_1px_3px_rgba(20,25,15,0.05)]">
          <header className="sticky top-6 z-30 flex h-16 items-center gap-3 border-b border-line bg-panel/90 px-4 backdrop-blur-md sm:px-7 lg:top-8 lg:rounded-t-2xl">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Buka menu">
              <Menu />
            </Button>
            <div className="flex min-w-0 items-center gap-2.5 text-[14px] text-muted">
              <CurrentIcon className="size-[18px] shrink-0" />
              <span className="truncate">{current?.label ?? 'Portal'}</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
              <ProfileMenu />
            </div>
          </header>

          <main className="px-4 pt-7 pb-16 sm:px-7">
            {refused && (
              <Notice tone="bad" className="mb-5">
                <b>Perangkat menolak menandatangani permintaan dari server.</b>
                <div>{refused}</div>
                <div className="text-muted">Jika Anda tidak sedang melakukan aksi tersebut, laporkan ke unit pengamanan.</div>
              </Notice>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/** Sidebar terang di atas kanvas; menu aktif tampil sebagai kartu putih. */
function Sidebar({ groups, active, onNavigate }: { groups: NavGroup[]; active: (href: string) => boolean; onNavigate?: () => void }) {
  const { user, signing } = useAuth();
  if (!user) return null;
  return (
    <div className="flex h-full flex-col px-3 pt-4 pb-3">
      <Link href="/documents" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-panel shadow-sm">
          <Logo className="h-[18px]" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[15px] font-bold tracking-[-0.01em]">SANDI-Chain</span>
          <span className="block truncate text-[12.5px] text-muted">Portal dokumen dinas</span>
        </span>
      </Link>

      <nav className="mt-5 flex-1 overflow-y-auto" aria-label="Utama">
        {groups.map((g) => (
          <div key={g.title} className="mb-5">
            <p className="mb-1.5 px-3 text-[11.5px] font-medium tracking-[0.06em] text-faint uppercase">{g.title}</p>
            <ul className="grid gap-0.5">
              {g.items.map((n) => {
                const on = active(n.href);
                const Icon = n.icon;
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={onNavigate}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'flex h-10 items-center gap-3 rounded-xl border px-3 text-[14px] transition-colors',
                        on
                          ? 'border-line bg-panel font-semibold text-ink shadow-[0_1px_2px_rgba(20,25,15,0.06)]'
                          : 'border-transparent text-muted hover:bg-panel/60 hover:text-ink',
                      )}
                    >
                      <Icon className={cn('size-[18px]', on ? 'text-accent' : 'text-faint')} />
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="rounded-xl border border-line bg-panel p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted">Sesi aktif</span>
          <Stamp k={user.clearance} className="text-[10.5px]" />
        </div>
        <p className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="live-dot size-1.5 rounded-full bg-ok" aria-hidden />
          {signing === 'ready' ? 'Tanda tangan di perangkat ini' : 'Tanda tangan oleh server'}
        </p>
      </div>
    </div>
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
      <DropdownMenu.Trigger className="flex items-center gap-2.5 rounded-xl py-1.5 pr-2 pl-1.5 text-left transition-colors outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-panel-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-ink">{initials(user.nama)}</span>
        <span className="hidden leading-tight sm:block">
          <span className="block max-w-48 truncate text-[13px] font-semibold">{user.nama}</span>
          <span className="block text-xs text-muted">{user.jabatan}</span>
        </span>
        <ChevronDown className="size-4 text-muted" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-xl border border-line bg-panel p-1.5 text-ink shadow-xl shadow-black/15"
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
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {signing === 'ready' && (
            <DropdownMenu.Item
              onSelect={ejectCard}
              className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-3 text-[13px] outline-none data-[highlighted]:bg-panel-2"
            >
              <CreditCard className="size-4 text-muted" /> Lepas kartu dari perangkat
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onSelect={logout}
            className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-3 text-[13px] text-bad outline-none data-[highlighted]:bg-bad-wash"
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
