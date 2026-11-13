'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Copy, FileSearch, Fingerprint, History, ScanSearch, ShieldAlert, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth';
import { AuditTimeline, Empty, FilePick, HashBox, IconTile, KV, Notice, PageHead, Panel, PanelHead, Stamp } from '@/components/kit';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, Doc, fmtDate, klasLabel, post, TraceDoc, TraceMatch, TraceResult } from '@/lib/api';
import { cn } from '@/lib/utils';

type Mode = 'tx' | 'nrp' | 'file';

const MODES: { key: Mode; label: string }[] = [
  { key: 'tx', label: 'Dari txId' },
  { key: 'nrp', label: 'Dari NRP' },
  { key: 'file', label: 'Unggah PDF' },
];

export default function ForensicsPage() {
  return (
    <Shell>
      <Gate />
    </Shell>
  );
}

/** Halaman ini khusus unit pengamanan; backend juga menolak non-auditor. */
function Gate() {
  const { user } = useAuth();
  if (user?.role !== 'auditor' && user?.role !== 'admin') {
    return (
      <Panel>
        <Empty icon={ShieldAlert}>Halaman ini khusus unit pengamanan (role auditor).</Empty>
      </Panel>
    );
  }
  return (
    <Suspense fallback={<Empty>Memuat…</Empty>}>
      <Forensics />
    </Suspense>
  );
}

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();

function Forensics() {
  const [mode, setMode] = useState<Mode>('tx');
  const [txId, setTxId] = useState('');
  const [who, setWho] = useState('');
  const [docId, setDocId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<TraceResult | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    api<Doc[]>('/documents').then(setDocs).catch(() => undefined);
  }, []);

  const run = useCallback(async (fn: () => Promise<TraceResult>) => {
    setBusy(true);
    setError('');
    setRes(null);
    try {
      const r = await fn();
      setRes(r);
      setSel(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const byTx = useCallback((tx: string) => run(() => api<TraceResult>(`/forensics/trace?txId=${encodeURIComponent(tx.trim())}`)), [run]);

  // Tautan dari tab Risiko: /forensics?txId=…
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('txId');
    if (t) {
      setTxId(t);
      void byTx(t);
    }
  }, [byTx]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'tx') return byTx(txId);
    if (mode === 'nrp') {
      const w = who.trim();
      const q = new URLSearchParams(/^\d+$/.test(w) ? { nrp: w } : { nama: w });
      if (docId) q.set('docId', docId);
      return run(() => api<TraceResult>(`/forensics/trace?${q}`));
    }
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    return run(() => post<TraceResult>('/forensics/trace/file', fd));
  };

  const ready = mode === 'tx' ? txId.trim().length >= 8 : mode === 'nrp' ? who.trim().length > 0 : !!file;
  const match = res?.matches[sel];

  return (
    <>
      <PageHead title="Telusuri kebocoran">
        Dari jejak di salinan bocoran (watermark atau metadata PDF) ke pembaca yang tercatat di ledger, lengkap dengan rantai aksesnya.
      </PageHead>

      <div className="grid items-start gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* ------------------------------------------------ formulir */}
        <div className="grid gap-6 xl:sticky xl:top-28">
          <Panel>
            <PanelHead title="Cari jejak" description="Pilih sumber jejak yang Anda punya" icon={ScanSearch} />
            <form className="grid gap-5 p-5" onSubmit={submit}>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-panel-2 p-1" role="tablist" aria-label="Sumber jejak">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.key}
                    onClick={() => setMode(m.key)}
                    className={cn(
                      'h-9 rounded-lg text-[13px] font-medium transition-colors',
                      mode === m.key ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === 'tx' && (
                <Field label="txId akses" htmlFor="tx" hint="Footer watermark menampilkan 16 karakter pertama (“tx 9f2c…”). Awalan, minimal 8 karakter, sudah cukup.">
                  <Input id="tx" className="h-10 rounded-xl font-mono" placeholder="9f2c41aa7d03b6e8" value={txId} onChange={(e) => setTxId(e.target.value)} autoFocus spellCheck={false} />
                </Field>
              )}

              {mode === 'nrp' && (
                <>
                  <Field label="NRP atau nama pembaca" htmlFor="who" hint="Tertera pada watermark diagonal di setiap halaman.">
                    <Input id="who" className="h-10 rounded-xl" placeholder="11000003 atau Andi" value={who} onChange={(e) => setWho(e.target.value)} autoFocus />
                  </Field>
                  <Field label="Dokumen (opsional)">
                    <Select value={docId || 'all'} onValueChange={(v) => setDocId(v === 'all' ? '' : v)}>
                      <SelectTrigger aria-label="Dokumen" className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua dokumen</SelectItem>
                        {docs.map((d) => (
                          <SelectItem key={d.docId} value={d.docId}>
                            {d.nomor} — {d.perihal}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              {mode === 'file' && (
                <Field label="PDF bocoran" hint="Jejak dibaca dari metadata PDF. File tidak disimpan. Foto layar tidak punya metadata: gunakan txId atau NRP.">
                  <FilePick file={file} onChange={setFile} accept="application/pdf" hint="PDF yang beredar" large />
                </Field>
              )}

              <Button type="submit" variant="primary" className="h-11 rounded-xl shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]" disabled={!ready || busy}>
                <FileSearch /> {busy ? 'Menelusuri ledger…' : 'Telusuri'}
              </Button>
            </form>
          </Panel>

          <Panel>
            <PanelHead title="Di mana jejaknya?" icon={Fingerprint} />
            <ul className="divide-y divide-line text-[13px]">
              {[
                ['Footer setiap halaman', 'nama pembaca, waktu, ID dokumen, dan “tx” 16 karakter'],
                ['Watermark diagonal', 'nama dan NRP pembaca di seluruh halaman'],
                ['Metadata PDF', 'txId lengkap, ID dokumen, dan NRP (hanya pada berkas, bukan foto)'],
              ].map(([t, d]) => (
                <li key={t} className="px-5 py-3">
                  <p className="font-semibold">{t}</p>
                  <p className="text-muted">{d}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ------------------------------------------------ hasil */}
        <div className="grid min-w-0 gap-6">
          {error && <Notice tone="bad">{error}</Notice>}

          {!res && !error && (
            <Panel>
              <Empty icon={ScanSearch} className="py-24">
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{busy ? 'Menelusuri ledger…' : 'Belum ada penelusuran'}</span>
                  Setiap tampilan dokumen tercatat di ledger dengan txId yang sama seperti di watermark.
                </span>
              </Empty>
            </Panel>
          )}

          {res && (
            <>
              {res.extracted && (res.extracted.txId || res.extracted.nrp) && (
                <Notice>
                  <p className="font-medium">Jejak terbaca dari metadata PDF</p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-muted">
                    {res.extracted.txId && <span>tx {res.extracted.txId.slice(0, 16)}…</span>}
                    {res.extracted.docId && <span>{res.extracted.docId}</span>}
                    {res.extracted.nrp && <span>NRP {res.extracted.nrp}</span>}
                  </p>
                </Notice>
              )}

              {res.matches.length === 0 && (
                <Panel>
                  <Empty icon={ScanSearch} className="py-16">
                    <span>
                      <span className="block font-semibold text-ink">{res.status === 'bad_query' ? 'Masukan belum lengkap' : 'Tidak ditemukan'}</span>
                      {res.message}
                    </span>
                  </Empty>
                </Panel>
              )}

              {res.matches.length > 1 && (
                <Panel>
                  <PanelHead title={`${res.matches.length} akses cocok`} description={res.message} icon={Users} />
                  <ul className="divide-y divide-line">
                    {res.matches.map((m, i) => (
                      <li key={m.access.txId}>
                        <button
                          onClick={() => setSel(i)}
                          aria-pressed={sel === i}
                          className={cn('flex w-full items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-panel-2/60', sel === i && 'bg-accent/[0.06]')}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-[12px] font-bold text-accent">{initials(m.person?.nama ?? m.access.actor)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold">{m.person?.nama ?? m.access.actor}</span>
                            <span className="block truncate text-[12.5px] text-muted">
                              {res.documents[m.access.docId]?.nomor ?? m.access.docId} · {fmtDate(m.access.timestamp)}
                            </span>
                          </span>
                          <span className="font-mono text-[11.5px] text-faint">tx {m.access.txId.slice(0, 10)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {match && <MatchDetail match={match} doc={res.documents[match.access.docId]} message={res.matches.length === 1 ? res.message : undefined} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function reportText(m: TraceMatch, doc?: TraceDoc) {
  const p = m.person;
  const via = m.grantedBy ? `disposisi oleh ${m.grantedBy.actor} (${fmtDate(m.grantedBy.timestamp)}): ${m.grantedBy.detail}` : 'tidak lewat disposisi (pemilik atau memenuhi clearance)';
  return [
    'LAPORAN TELUSURI KEBOCORAN — SANDI-Chain',
    `Dibuat   : ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
    `Dokumen  : ${doc ? `${doc.nomor} — ${doc.perihal} (${klasLabel(doc.klasifikasi)})` : m.access.docId} [${m.access.docId}]`,
    `Pembaca  : ${p ? `${p.nama} (${p.jabatan}, ${p.mspId}) NRP ${p.nrp}` : m.access.actor}`,
    `Akses    : ${fmtDate(m.access.timestamp)} WIB`,
    `txId     : ${m.access.txId}`,
    `Cara akses: ${via}`,
    `Pembaca lain pada dokumen ini: ${m.otherReaders.length ? m.otherReaders.map((r) => `${r.actor} (${r.opens}×)`).join(', ') : 'tidak ada'}`,
    '',
    'Entri ledger tidak dapat diubah. Verifikasi dengan txId di atas pada channel dokumen.',
  ].join('\n');
}

function MatchDetail({ match: m, doc, message }: { match: TraceMatch; doc?: TraceDoc; message?: string }) {
  const p = m.person;
  const opens = m.suspectActivity.filter((l) => l.action === 'ACCESS_GRANTED').length;
  const denied = m.suspectActivity.filter((l) => l.action === 'ACCESS_DENIED').length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(reportText(m, doc));
      toast.success('Laporan disalin.');
    } catch {
      toast.error('Tidak bisa menyalin di browser ini.');
    }
  }

  return (
    <>
      <Panel className="overflow-hidden">
        <div className={cn('flex flex-wrap items-start gap-4 border-b border-line p-5', m.isAccessGrant ? 'bg-bad/[0.05]' : 'bg-panel-2/50')}>
          <IconTile icon={ShieldAlert} tone={m.isAccessGrant ? 'bg-bad/10 text-bad' : 'bg-panel-2 text-muted'} className="size-11 rounded-2xl" />
          <div className="min-w-[200px] flex-1">
            <p className="text-[12.5px] font-medium text-muted">{m.isAccessGrant ? 'Pembaca teridentifikasi' : 'Entri ditemukan, bukan akses berhasil'}</p>
            <h2 className="mt-0.5 text-[22px] leading-tight font-bold tracking-[-0.02em] break-words">{p?.nama ?? m.access.actor}</h2>
            <p className="mt-1 text-[13.5px] text-muted">
              {p ? `${p.jabatan} · ${p.mspId} · NRP ${p.nrp}` : `${m.access.jabatan || '-'} · ${m.access.actorOrg}`}
            </p>
            {message && <p className="mt-2 text-[13px] text-muted">{message}</p>}
          </div>
          {p && <Stamp k={p.clearance} className="shrink-0" />}
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-2">
          <div className="bg-panel p-5">
            <p className="text-[12.5px] text-muted">Dokumen</p>
            {doc ? (
              <>
                <p className="mt-1 text-[16px] font-semibold">{doc.nomor}</p>
                <p className="text-[13.5px] text-muted">{doc.perihal}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Stamp k={doc.klasifikasi} />
                  {doc.revoked && <span className="rounded-full bg-warn/10 px-2.5 py-1 text-[12px] font-semibold text-warn">Dicabut</span>}
                </div>
                <p className="mt-2.5 text-[12.5px] text-faint">
                  Pemilik: {doc.ownerName} ({doc.ownerOrg})
                </p>
              </>
            ) : (
              <p className="mt-1 font-mono text-[13px]">{m.access.docId}</p>
            )}
          </div>
          <div className="bg-panel p-5">
            <p className="text-[12.5px] text-muted">{m.isAccessGrant ? 'Waktu akses' : 'Waktu percobaan'}</p>
            <p className="mt-1 text-[16px] font-semibold">{fmtDate(m.access.timestamp)} WIB</p>
            <p className="mt-2.5 text-[13.5px] text-muted">
              Membuka dokumen ini <b className="font-semibold text-ink">{opens}×</b>
              {denied > 0 && (
                <>
                  , ditolak <b className="font-semibold text-bad">{denied}×</b>
                </>
              )}
              .
            </p>
          </div>
        </div>

        <KV
          rows={[
            ['txId', <HashBox key="tx" value={m.access.txId} />],
            ...(m.isAccessGrant
              ? ([
                  [
                    'Cara memperoleh akses',
                    m.grantedBy ? (
                      <span key="via">
                        Disposisi oleh <b>{m.grantedBy.actor}</b>, {fmtDate(m.grantedBy.timestamp)}
                        <span className="block text-[13px] font-normal text-muted">{m.grantedBy.detail}</span>
                      </span>
                    ) : (
                      <span key="via" className="font-normal text-muted">
                        Tidak lewat disposisi: pemilik atau memenuhi clearance.
                      </span>
                    ),
                  ],
                ] as [string, React.ReactNode][])
              : ([['Hasil', <span key="r" className="font-normal text-muted">{m.access.detail || 'Akses ditolak; dokumen tidak tampil.'}</span>]] as [string, React.ReactNode][])),
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-line p-5">
          <Button asChild variant="primary" className="h-10 rounded-xl">
            <Link href={`/documents/${m.access.docId}`}>
              <ArrowUpRight /> Buka halaman dokumen
            </Link>
          </Button>
          <Button className="h-10 rounded-xl" onClick={copy}>
            <Copy /> Salin laporan
          </Button>
          <Button asChild variant="ghost" className="h-10 rounded-xl">
            <Link href="/security">Lihat risiko personel</Link>
          </Button>
          {doc && !doc.revoked && (
            <p className="basis-full text-[12.5px] text-muted">
              Pencabutan dokumen dilakukan pemilik ({doc.ownerName}) dari halaman dokumen. Kirim laporan ini kepadanya atau kepada pimpinan.
            </p>
          )}
        </div>
      </Panel>

      {m.otherReaders.length > 0 && (
        <Panel>
          <PanelHead title="Pembaca lain dokumen ini" description="Untuk membandingkan atau menyingkirkan kemungkinan lain" icon={Users} />
          <ul className="divide-y divide-line">
            {m.otherReaders.map((r) => (
              <li key={r.actor} className="flex items-center gap-3.5 px-5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-[12px] font-bold text-muted">{initials(r.actor)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{r.actor}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {r.jabatan || '-'} · {r.actorOrg}
                  </p>
                </div>
                <div className="text-right text-[12.5px] text-muted">
                  <p className="font-semibold text-ink">{r.opens}× dibuka</p>
                  <p>terakhir {fmtDate(r.last)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <PanelHead title="Rantai akses dokumen" description="Seluruh jejak dokumen ini; entri yang cocok disorot" icon={History} />
        <AuditTimeline logs={m.custody} highlight={m.access.txId} />
      </Panel>
    </>
  );
}
