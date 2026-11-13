'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeft, Ban, Copy, Eye, FilePlus2, FileText, Fingerprint, History, Lock, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth';
import { AuditTimeline, Empty, FilePick, HashBox, IconTile, Notice, Panel, PanelHead, Stamp, Verdict } from '@/components/kit';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, AuditLog, DocDetail, fmtDate, klasLabel, post, shortHash, VerifyResult } from '@/lib/api';
import { expectAction, fileHash } from '@/lib/signer';
import { cn } from '@/lib/utils';

export default function DocumentDetailPage() {
  return (
    <Shell>
      <Detail />
    </Shell>
  );
}

const FILTERS: { key: string; label: string; match: (a: string) => boolean }[] = [
  { key: 'semua', label: 'Semua', match: () => true },
  { key: 'ditolak', label: 'Ditolak', match: (a) => a === 'ACCESS_DENIED' || a === 'VERIFY_TAMPERED' },
  { key: 'dibuka', label: 'Dibuka', match: (a) => a === 'ACCESS_GRANTED' },
  { key: 'perubahan', label: 'Perubahan', match: (a) => ['REGISTER', 'NEW_VERSION', 'DISPOSITION', 'REVOKE'].includes(a) },
  { key: 'verifikasi', label: 'Verifikasi', match: (a) => a === 'VERIFY_OK' || a === 'VERIFY_TAMPERED' },
];

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('semua');

  const canAudit = doc && (doc.isOwner || user?.role === 'auditor' || user?.role === 'admin');

  const load = useCallback(() => {
    api<DocDetail>(`/documents/${id}`)
      .then(setDoc)
      .catch((e) => setError(e.message));
  }, [id]);

  const loadLogs = useCallback(() => {
    api<AuditLog[]>(`/documents/${id}/audit`)
      .then(setLogs)
      .catch(() => setLogs(null));
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    if (canAudit) loadLogs();
  }, [canAudit, loadLogs]);

  const refresh = () => {
    load();
    if (canAudit) loadLogs();
  };

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!doc) return <Empty>Membaca ledger…</Empty>;

  const manage = doc.isOwner && !doc.revoked;
  const count = (a: string) => (logs ? logs.filter((l) => l.action === a).length : null);
  const show = (n: number | null) => (n === null ? '–' : String(n).padStart(2, '0'));
  const shownLogs = (logs ?? []).filter((l) => FILTERS.find((f) => f.key === filter)!.match(l.action));

  const metrics: [string, string][] = [
    ['Versi terkini', `v${doc.version}`],
    ['Dibuka', show(count('ACCESS_GRANTED'))],
    ['Akses ditolak', show(count('ACCESS_DENIED'))],
    ['Disposisi', String(doc.recipients.length).padStart(2, '0')],
  ];

  return (
    <>
      <Link href="/documents" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Daftar dokumen
      </Link>

      {/* ------------------------------------------------ kepala berkas: kartu polos */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5 p-6 sm:p-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Stamp k={doc.klasifikasi} />
              {doc.revoked ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 text-[12px] font-semibold text-warn">
                  <Lock className="size-3" /> Dicabut
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-semibold text-ok">
                  <span className="size-1.5 rounded-full bg-current" /> Aktif
                </span>
              )}
            </div>

            <h1 className="mt-4 text-[30px] leading-tight font-bold tracking-[-0.02em] break-words sm:text-[34px]">{doc.nomor}</h1>
            <p className="mt-1 text-[15px] text-muted">{doc.perihal}</p>

            <p className="mt-4 text-[13px] text-faint">
              {doc.ownerName} ({doc.ownerOrg}) · {doc.channel} · {fmtDate(doc.createdAt)} · <span className="font-mono text-[12px]">{doc.docId}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {manage && (
              <>
                <DispositionDialog docId={doc.docId} sr={doc.klasifikasi === 'SANGAT_RAHASIA'} onDone={refresh} />
                <VersionDialog docId={doc.docId} onDone={refresh} />
                <RevokeDialog docId={doc.docId} nomor={doc.nomor} onDone={refresh} />
              </>
            )}
            {doc.revoked ? (
              <Button disabled className="h-10 rounded-xl">
                Dokumen dicabut
              </Button>
            ) : (
              <Button asChild variant="primary" className="h-10 rounded-xl px-5">
                <Link href={`/documents/${doc.docId}/view`}>
                  <Eye /> Buka dokumen
                </Link>
              </Button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div key={label} className="bg-panel px-6 py-4 sm:px-8 lg:px-6 lg:first:pl-8">
              <dt className="text-[12.5px] text-muted">{label}</dt>
              <dd className="mt-1 text-[24px] leading-none font-bold tracking-[-0.02em] tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------------------------------ rel info (kiri) + linimasa (kanan) */}
      <div className="grid items-start gap-6 xl:grid-cols-[370px_minmax(0,1fr)]">
        <aside className="order-2 grid gap-6 xl:sticky xl:top-28 xl:order-1">
          <Panel>
            <PanelHead title="Sidik jari on-chain" description="SHA-256 versi terkini" icon={Fingerprint}>
              <CopyButton value={doc.hash} />
            </PanelHead>
            <div className="p-5">
              <HashBox value={doc.hash} />
              <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
                <Lock className="size-3.5 shrink-0" /> Tercatat di Hyperledger Fabric, tidak bisa diubah.
              </p>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHead title="Riwayat versi" description={`${doc.versions.length} versi tersimpan`} icon={History} />
            <ol className="divide-y divide-line">
              {[...doc.versions].reverse().map((v) => {
                const now = v.version === doc.version;
                return (
                  <li key={v.version} className={cn('flex items-center gap-3 px-5 py-3.5', now && 'bg-accent/[0.05]')}>
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold', now ? 'bg-accent text-accent-ink' : 'bg-panel-2 text-muted')}>
                      v{v.version}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-[13.5px] font-semibold">
                        <span className="truncate">{v.filename}</span>
                        {now && <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">Terkini</span>}
                      </p>
                      <p className="truncate text-[12.5px] text-muted">
                        {(v.size / 1024).toFixed(1)} KB · {fmtDate(v.created_at)}
                      </p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-faint" title={v.sha256}>
                        {shortHash(v.sha256)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <VerifyBox docId={doc.docId} />
        </aside>

        <Panel className="order-1 min-w-0 xl:order-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <IconTile icon={Activity} className="size-9" />
              <div>
                <h2 className="text-[15px] font-semibold">Jejak akses</h2>
                <p className="text-[12.5px] text-muted">Dibaca langsung dari ledger, tidak bisa diubah atau dihapus</p>
              </div>
            </div>
            {canAudit && (
              <Button variant="ghost" size="sm" className="h-9 rounded-xl" onClick={loadLogs}>
                <RefreshCw /> Muat ulang
              </Button>
            )}
          </div>

          {!canAudit ? (
            <Empty icon={Lock} className="py-16">
              <span>
                <span className="block font-semibold text-ink">Jejak akses dibatasi</span>
                Hanya pemilik dokumen dan auditor yang dapat melihatnya.
              </span>
            </Empty>
          ) : !logs ? (
            <Empty>Memuat…</Empty>
          ) : (
            <>
              <div className="flex gap-1 overflow-x-auto border-b border-line px-5 py-3 sm:px-6" role="group" aria-label="Saring jejak akses">
                {FILTERS.map((f) => {
                  const n = logs.filter((l) => f.match(l.action)).length;
                  return (
                    <button
                      key={f.key}
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        'flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                        filter === f.key ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted hover:bg-panel-2 hover:text-ink',
                      )}
                    >
                      {f.label}
                      <span className={cn('rounded-full px-1.5 text-[11.5px] tabular-nums', filter === f.key ? 'bg-black/15' : 'bg-panel-2')}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <AuditTimeline logs={shownLogs} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

function CopyButton({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Hash disalin.');
    } catch {
      toast.error('Tidak bisa menyalin di browser ini.');
    }
  }
  return (
    <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={copy}>
      <Copy /> Salin
    </Button>
  );
}

function VerifyBox({ docId }: { docId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setRes(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      expectAction('VerifyDocument', [docId, await fileHash(file)]);
      setRes(await post<VerifyResult>(`/documents/${docId}/verify`, fd));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHead title="Verifikasi keaslian" description="Bandingkan salinan dengan ledger" icon={ShieldCheck} />
      <div className="grid gap-3 p-5">
        <FilePick file={file} onChange={setFile} hint="File pembanding (apa pun formatnya)" />
        <Button className="h-10 rounded-xl" disabled={!file || busy} onClick={run}>
          {busy ? 'Memeriksa…' : 'Verifikasi'}
        </Button>
        {error && <Notice tone="bad">{error}</Notice>}
        {res && <Verdict authentic={res.authentic} message={res.message} />}
      </div>
    </Panel>
  );
}

type Person = { username: string; nama: string; jabatan: string; clearance: string };

function DispositionDialog({ docId, sr, onDone }: { docId: string; sr: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [recipient, setRecipient] = useState('');
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) api<Person[]>('/auth/personel').then(setPeople).catch(() => undefined);
  }, [open]);

  async function send() {
    setError('');
    setBusy(true);
    try {
      expectAction('AddDisposition', [docId, recipient, null, catatan]);
      await post(`/documents/${docId}/disposition`, { recipient, catatan });
      toast.success('Disposisi tercatat di ledger.');
      setRecipient('');
      setCatatan('');
      setOpen(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 rounded-xl">
          <Send /> Disposisi
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Disposisi"
        description={sr ? 'Dokumen SANGAT RAHASIA hanya bisa dibuka personel yang didisposisikan.' : 'Teruskan dokumen ini kepada personel lain.'}
      >
        <Field label="Penerima">
          <Select value={recipient} onValueChange={setRecipient}>
            <SelectTrigger aria-label="Penerima">
              <SelectValue placeholder="Pilih personel…" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.username} value={p.username}>
                  {p.nama} — {p.jabatan} ({klasLabel(p.clearance)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Catatan disposisi" htmlFor="catatan">
          <Textarea id="catatan" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Batal</Button>
          </DialogClose>
          <Button variant="primary" disabled={!recipient || busy} onClick={send}>
            {busy ? 'Mengirim…' : 'Kirim disposisi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionDialog({ docId, onDone }: { docId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!file) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      expectAction('AddVersion', [docId, await fileHash(file)]);
      await post(`/documents/${docId}/versions`, fd);
      setFile(null);
      toast.success('Versi baru tercatat.', { description: 'Hash versi lama tetap tersimpan di ledger.' });
      setOpen(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 rounded-xl">
          <FilePlus2 /> Revisi
        </Button>
      </DialogTrigger>
      <DialogContent title="Revisi" description="Unggah versi baru. Sidik jari versi lama tetap tersimpan dan tetap bisa diverifikasi.">
        <FilePick file={file} onChange={setFile} />
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Batal</Button>
          </DialogClose>
          <Button variant="primary" disabled={!file || busy} onClick={send}>
            {busy ? 'Menyimpan…' : 'Unggah versi baru'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ docId, nomor, onDone }: { docId: string; nomor: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError('');
    try {
      expectAction('RevokeDocument', [docId, alasan]);
      await post(`/documents/${docId}/revoke`, { alasan });
      toast.success('Dokumen dicabut.');
      setOpen(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="danger" className="h-10 rounded-xl">
          <Ban /> Cabut
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Cabut dokumen"
        description={
          <>
            Setelah dicabut, <b className="text-ink">{nomor}</b> tidak bisa dibuka siapa pun. Tidak bisa dibatalkan.
          </>
        }
      >
        <Field label="Alasan pencabutan" htmlFor="alasan">
          <Input id="alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Batal</Button>
          </DialogClose>
          <Button variant="danger-solid" disabled={!alasan || busy} onClick={send}>
            {busy ? 'Mencabut…' : 'Ya, cabut permanen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
