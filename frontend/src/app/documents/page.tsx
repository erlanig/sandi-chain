'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, ChevronLeft, ChevronRight, FileText, Files, Lock, Search, type LucideIcon } from 'lucide-react';
import { Empty, K_ICON, Stamp } from '@/components/kit';
import { Shell } from '@/components/shell';
import { WelcomeBanner } from '@/components/welcome-banner';
import { api, Doc, fmtDate, KLASIFIKASI, klasLabel } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function DocumentsPage() {
  return (
    <Shell>
      <DocumentList />
    </Shell>
  );
}

const PAGE_SIZE = 10;
const LEVEL: Record<string, number> = { BIASA: 1, TERBATAS: 2, RAHASIA: 3, SANGAT_RAHASIA: 4 };

/** Badge lembut per klasifikasi: latar tipis + teks berwarna. */
const PILL: Record<string, string> = {
  BIASA: 'bg-k-biasa/10 text-k-biasa',
  TERBATAS: 'bg-k-terbatas/10 text-k-terbatas',
  RAHASIA: 'bg-k-rahasia/12 text-k-rahasia',
  SANGAT_RAHASIA: 'bg-k-sr/10 text-k-sr',
};

type SortKey = 'nomor' | 'klasifikasi' | 'version' | 'ownerName' | 'updatedAt';
const SORTERS: Record<SortKey, (a: Doc, b: Doc) => number> = {
  nomor: (a, b) => a.nomor.localeCompare(b.nomor, 'id', { numeric: true }),
  klasifikasi: (a, b) => LEVEL[a.klasifikasi] - LEVEL[b.klasifikasi],
  version: (a, b) => a.version - b.version,
  ownerName: (a, b) => a.ownerName.localeCompare(b.ownerName, 'id'),
  updatedAt: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
};
const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'nomor', label: 'Dokumen' },
  { key: 'klasifikasi', label: 'Klasifikasi', className: 'hidden sm:table-cell' },
  { key: 'version', label: 'Versi', className: 'hidden md:table-cell' },
  { key: 'ownerName', label: 'Pembuat', className: 'hidden lg:table-cell' },
  { key: null, label: 'Status', className: 'hidden md:table-cell' },
  { key: 'updatedAt', label: 'Diperbarui', className: 'hidden xl:table-cell' },
];

function DocumentList() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('SEMUA');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'updatedAt', desc: true });
  const [page, setPage] = useState(0);

  useEffect(() => {
    api<Doc[]>('/documents').then(setDocs).catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = (docs ?? []).filter(
      (d) =>
        (filter === 'SEMUA' || d.klasifikasi === filter) &&
        (!s || [d.nomor, d.perihal, d.docId, d.ownerName].some((v) => v.toLowerCase().includes(s))),
    );
    const cmp = SORTERS[sort.key];
    return rows.sort((a, b) => (sort.desc ? cmp(b, a) : cmp(a, b)));
  }, [docs, filter, q, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const total = docs?.length ?? 0;
  const count = (k: string) => (docs ?? []).filter((d) => d.klasifikasi === k).length;
  const revoked = (docs ?? []).filter((d) => d.revoked).length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'updatedAt' }));
    setPage(0);
  };

  const stats: { label: string; value: number; note: string; icon: LucideIcon; tone: string }[] = [
    { label: 'Total dokumen', value: total, note: 'sesuai clearance Anda', icon: Files, tone: 'bg-accent/10 text-accent' },
    ...KLASIFIKASI.map((k) => ({ label: klasLabel(k), value: count(k), note: `${pct(count(k))}% dari total`, icon: K_ICON[k], tone: PILL[k] })),
    { label: 'Dicabut', value: revoked, note: 'tidak bisa dibuka', icon: Ban, tone: 'bg-warn/10 text-warn' },
  ];

  return (
    <>
      <WelcomeBanner />

      {/* ---------------------------------------------- ringkasan */}
      <section className="mb-6 rounded-2xl border border-line bg-panel-2/60 p-2">
        <h2 className="px-3 pt-2 pb-3 text-[15px] font-semibold">Ringkasan</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex items-center gap-2.5">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', s.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate text-[13px] font-medium text-muted first-letter:uppercase">{s.label.toLowerCase()}</span>
                </div>
                <p className="mt-4 text-[28px] leading-none font-bold tabular-nums tracking-[-0.02em]">{docs ? String(s.value).padStart(2, '0') : '–'}</p>
                <p className="mt-2 truncate text-[12.5px] text-faint">{s.note}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------- tabel */}
      <section className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-[15px] font-semibold">Semua dokumen</h2>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <input
                className="h-9 w-full rounded-xl border border-line bg-panel pr-3 pl-9 text-[13.5px] placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
                placeholder="Cari nomor, perihal, pembuat…"
                aria-label="Cari dokumen"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <div className="flex max-w-full gap-1 overflow-x-auto" role="group" aria-label="Saring klasifikasi">
              {['SEMUA', ...KLASIFIKASI].map((k) => (
                <button
                  key={k}
                  aria-pressed={filter === k}
                  onClick={() => {
                    setFilter(k);
                    setPage(0);
                  }}
                  className={cn(
                    'h-9 shrink-0 rounded-xl px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors first-letter:uppercase',
                    filter === k ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted hover:bg-panel-2 hover:text-ink',
                  )}
                >
                  {k === 'SEMUA' ? 'Semua' : klasLabel(k).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <Empty className="border-t border-line text-bad">{error}</Empty>}
        {!error && !docs && <Empty className="border-t border-line">Mengambil data dari ledger…</Empty>}
        {docs && shown.length === 0 && (
          <Empty className="border-t border-line">{docs.length === 0 ? 'Belum ada dokumen.' : 'Tidak ada dokumen yang cocok.'}</Empty>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  {COLUMNS.map((c) => (
                    <th
                      key={c.label}
                      className={cn('px-4 font-normal first:pl-5', c.className)}
                      aria-sort={c.key && sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
                    >
                      {c.key ? (
                        <button className="flex h-11 items-center gap-1 text-[13px] text-muted hover:text-ink" onClick={() => toggleSort(c.key as SortKey)}>
                          {c.label}
                          {sort.key === c.key && (sort.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />)}
                        </button>
                      ) : (
                        <span className="flex h-11 items-center text-[13px] text-muted">{c.label}</span>
                      )}
                    </th>
                  ))}
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => {
                  const Icon = K_ICON[d.klasifikasi] ?? FileText;
                  return (
                    <tr key={d.docId} className="group cursor-pointer transition-colors hover:bg-panel-2/60" onClick={() => router.push(`/documents/${d.docId}`)}>
                      <td className="py-3.5 pr-4 pl-5">
                        <div className="flex items-center gap-3">
                          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', PILL[d.klasifikasi])}>
                            <Icon className="size-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <Link href={`/documents/${d.docId}`} className="font-semibold group-hover:underline" onClick={(e) => e.stopPropagation()}>
                              {d.nomor}
                            </Link>
                            <div className="truncate text-[13px] text-muted">{d.perihal}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3.5 sm:table-cell">
                        <Stamp k={d.klasifikasi} />
                      </td>
                      <td className="hidden px-4 py-3.5 text-muted tabular-nums md:table-cell">v{d.version}</td>
                      <td className="hidden px-4 py-3.5 lg:table-cell">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-[11.5px] font-bold text-accent">
                            {d.ownerName.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="leading-tight">
                            <div className="font-medium">{d.ownerName}</div>
                            <div className="text-[12.5px] text-faint">{d.ownerOrg}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3.5 md:table-cell">
                        {d.revoked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1 text-[12.5px] font-semibold text-warn">
                            <Lock className="size-3" /> Dicabut
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok/10 px-2.5 py-1 text-[12.5px] font-semibold text-ok">
                            <span className="size-1.5 rounded-full bg-current" /> Aktif
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3.5 whitespace-nowrap text-muted xl:table-cell">{fmtDate(d.updatedAt)}</td>
                      <td className="pr-4 text-right">
                        <span className="inline-grid size-8 place-items-center rounded-lg text-faint transition-colors group-hover:bg-panel group-hover:text-ink">
                          <ChevronRight className="size-4" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {shown.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-[13.5px] text-muted">
            <span>
              Menampilkan {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + rows.length} dari {shown.length} dokumen
            </span>
            <div className="flex items-center gap-1">
              <button
                className="grid size-9 place-items-center rounded-xl hover:bg-panel-2 disabled:opacity-40"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="size-4" />
              </button>
              {Array.from({ length: pages }, (_, i) => i)
                .filter((i) => pages <= 7 || Math.abs(i - current) <= 1 || i === 0 || i === pages - 1)
                .map((i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    aria-current={i === current ? 'page' : undefined}
                    className={cn(
                      'grid size-9 place-items-center rounded-xl text-[13.5px] tabular-nums',
                      i === current ? 'bg-accent font-semibold text-accent-ink shadow-sm' : 'hover:bg-panel-2 hover:text-ink',
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              <button
                className="grid size-9 place-items-center rounded-xl hover:bg-panel-2 disabled:opacity-40"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
