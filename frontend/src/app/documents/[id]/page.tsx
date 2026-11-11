'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, Boxes, Eye, FilePlus2, FileText, History, Lock, RefreshCw, Send, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth';
import { AuditList, Empty, FilePick, HashBox, IconTile, KV, Notice, PageHead, Panel, PanelHead, Stamp, StatCard, StatGroup, Verdict } from '@/components/kit';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, AuditLog, DocDetail, fmtDate, klasLabel, post, shortHash, VerifyResult } from '@/lib/api';
import { expectAction, fileHash } from '@/lib/signer';

export default function DocumentDetailPage() {
  return (
    <Shell>
      <Detail />
    </Shell>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState('');

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

  return (
    <>
      <Link href="/documents" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Daftar dokumen
      </Link>

      <PageHead
        eyebrow={
          <>
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
            <span className="rounded-full bg-panel-2 px-2.5 py-1 font-mono text-[11.5px] text-muted">{doc.docId}</span>
          </>
        }
        title={doc.nomor}
        actions={
          <>
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
              <Button asChild variant="primary" className="h-10 rounded-xl px-4 shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]">
                <Link href={`/documents/${doc.docId}/view`}>
                  <Eye /> Buka dokumen
                </Link>
              </Button>
            )}
          </>
        }
      >
        {doc.perihal}
      </PageHead>

      <StatGroup className="mb-6">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Versi terkini" value={`v${doc.version}`} note={`${doc.versions.length} versi tersimpan`} icon={History} tone="bg-accent/10 text-accent" />
          <StatCard label="Dibuka" value={show(count('ACCESS_GRANTED'))} note={canAudit ? 'akses berhasil' : 'khusus pemilik/auditor'} icon={Eye} tone="bg-ok/10 text-ok" />
          <StatCard label="Akses ditolak" value={show(count('ACCESS_DENIED'))} note={canAudit ? 'tercatat & dilaporkan' : 'khusus pemilik/auditor'} icon={ShieldX} tone="bg-bad/10 text-bad" />
          <StatCard label="Disposisi" value={String(doc.recipients.length).padStart(2, '0')} note={doc.recipients.length ? doc.recipients.join(', ') : 'belum ada penerima'} icon={Send} tone="bg-k-terbatas/10 text-k-terbatas" />
        </div>
      </StatGroup>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="min-w-0 overflow-hidden">
          <Tabs defaultValue={canAudit ? 'jejak' : 'versi'}>
            <div className="flex items-center justify-between border-b border-line pr-3">
              <TabsList className="border-b-0">
                {canAudit && (
                  <TabsTrigger value="jejak">
                    Jejak akses
                    {logs && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">{logs.length}</span>}
                  </TabsTrigger>
                )}
                <TabsTrigger value="versi">
                  Riwayat versi <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">{doc.versions.length}</span>
                </TabsTrigger>
              </TabsList>
              {canAudit && (
                <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={loadLogs}>
                  <RefreshCw /> <span className="max-sm:hidden">Muat ulang</span>
                </Button>
              )}
            </div>

            {canAudit && (
              <TabsContent value="jejak">
                <p className="flex items-center gap-2 border-b border-line bg-panel-2/50 px-5 py-2.5 text-[12.5px] text-muted">
                  <Lock className="size-3.5" /> Dibaca langsung dari ledger. Entri tidak bisa diubah atau dihapus.
                </p>
                {!logs ? <Empty>Memuat…</Empty> : <AuditList logs={logs} />}
              </TabsContent>
            )}

            <TabsContent value="versi">
              <ol className="divide-y divide-line">
                {[...doc.versions].reverse().map((v) => (
                  <li key={v.version} className="flex items-center gap-3.5 px-5 py-3.5">
                    <IconTile icon={FileText} tone={v.version === doc.version ? 'bg-accent/10 text-accent' : 'bg-panel-2 text-muted'} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                        Versi {v.version}
                        {v.version === doc.version && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11.5px] font-semibold text-accent">Terkini</span>}
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        {v.filename} · {(v.size / 1024).toFixed(1)} KB · {fmtDate(v.created_at)}
                      </p>
                    </div>
                    <code className="hidden rounded-md bg-panel-2 px-2 py-1 font-mono text-[11.5px] text-muted sm:block" title={v.sha256}>
                      {shortHash(v.sha256)}
                    </code>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </Tabs>
        </Panel>

        <div className="grid gap-6">
          <Panel>
            <PanelHead title="Catatan on-chain" description="Tercatat di Hyperledger Fabric" icon={Boxes} />
            <div className="px-5 pt-4">
              <p className="mb-1.5 text-[12.5px] text-muted">SHA-256 terkini</p>
              <HashBox value={doc.hash} />
            </div>
            <KV
              rows={[
                [
                  'Pembuat',
                  <>
                    {doc.ownerName} <span className="font-normal text-faint">({doc.ownerOrg})</span>
                  </>,
                ],
                ['Channel', <span className="font-mono text-[13px]">{doc.channel}</span>],
                ['Didaftarkan', fmtDate(doc.createdAt)],
                ['Diperbarui', fmtDate(doc.updatedAt)],
              ]}
            />
          </Panel>
          <VerifyBox docId={doc.docId} />
        </div>
      </div>
    </>
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
