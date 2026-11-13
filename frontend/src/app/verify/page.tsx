'use client';

import { useEffect, useState } from 'react';
import { FileSearch, ScanSearch, ShieldCheck } from 'lucide-react';
import { Empty, FilePick, HashBox, IconTile, K_ICON, Notice, PageHead, Panel, PanelHead, Stamp, Verdict } from '@/components/kit';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, Doc, post, shortHash, VerifyResult } from '@/lib/api';
import { expectAction, fileHash } from '@/lib/signer';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  BIASA: 'bg-k-biasa/10 text-k-biasa',
  TERBATAS: 'bg-k-terbatas/10 text-k-terbatas',
  RAHASIA: 'bg-k-rahasia/12 text-k-rahasia',
  SANGAT_RAHASIA: 'bg-k-sr/10 text-k-sr',
};

export default function VerifyPage() {
  return (
    <Shell>
      <Verify />
    </Shell>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2.5 text-[14px] font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-ink">{n}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

function Verify() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docId, setDocId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Doc[]>('/documents').then(setDocs).catch((e) => setError(e.message));
  }, []);

  const selected = docs.find((d) => d.docId === docId);

  async function run() {
    if (!file || !docId) return;
    setBusy(true);
    setRes(null);
    setError('');
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
    <>
      <PageHead title="Verifikasi keaslian">Cocokkan salinan yang beredar (cetak ulang, lampiran email, flashdisk) dengan catatan di ledger.</PageHead>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHead title="Pemeriksaan" description="Dua langkah, hasilnya tercatat di ledger" icon={ScanSearch} />
          <div className="grid gap-7 p-5">
            <Step n={1} title="Pilih dokumen acuan">
              <Select value={docId} onValueChange={setDocId}>
                <SelectTrigger aria-label="Dokumen acuan" className="h-10 rounded-xl">
                  <SelectValue placeholder="Pilih dokumen…" />
                </SelectTrigger>
                <SelectContent>
                  {docs.map((d) => (
                    <SelectItem key={d.docId} value={d.docId}>
                      {d.nomor} — {d.perihal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2/50 p-3">
                  <IconTile icon={K_ICON[selected.klasifikasi]} tone={TONE[selected.klasifikasi]} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{selected.nomor}</p>
                    <p className="truncate font-mono text-[11.5px] text-muted">
                      v{selected.version} · {shortHash(selected.hash)}
                    </p>
                  </div>
                  <Stamp k={selected.klasifikasi} className="max-sm:hidden" />
                </div>
              )}
            </Step>

            <Step n={2} title="Unggah salinan yang diperiksa">
              <FilePick file={file} onChange={setFile} hint="File apa pun yang ingin dicocokkan" large />
            </Step>

            {error && <Notice tone="bad">{error}</Notice>}
            <Button variant="primary" className="h-11 rounded-xl shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]" disabled={!file || !docId || busy} onClick={run}>
              <ShieldCheck /> {busy ? 'Memeriksa ledger…' : 'Verifikasi'}
            </Button>
          </div>
        </Panel>

        <Panel className={cn('lg:sticky lg:top-28')}>
          <PanelHead title="Hasil" icon={FileSearch} />
          {!res ? (
            <Empty icon={FileSearch} className="py-16">
              <span>
                <span className="block font-semibold text-ink">Belum ada pemeriksaan</span>
                Pilih dokumen dan unggah salinannya untuk mulai.
              </span>
            </Empty>
          ) : (
            <div className="grid gap-5 p-5">
              <Verdict authentic={res.authentic} message={res.message} />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line p-4">
                  <p className="text-[12.5px] text-muted">Cocok dengan</p>
                  <p className="mt-1 text-[22px] font-bold">{res.matchedVersion ? `v${res.matchedVersion}` : '–'}</p>
                </div>
                <div className="rounded-xl border border-line p-4">
                  <p className="text-[12.5px] text-muted">Versi terbaru</p>
                  <p className="mt-1 text-[22px] font-bold">v{res.latestVersion}</p>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[12.5px] text-muted">SHA-256 file yang diperiksa</p>
                <HashBox value={res.hash} />
              </div>
              {!res.authentic && <p className="text-[12.5px] text-faint">Hasil ini tercatat di ledger dan memicu alert ke unit pengamanan.</p>}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
