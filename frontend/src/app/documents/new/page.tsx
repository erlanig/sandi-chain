'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Check, FileUp, Lock, Upload } from 'lucide-react';
import { useAuth } from '@/components/auth';
import { FilePick, K_ICON, KV, Notice, PageHead, Panel, PanelHead, Stamp } from '@/components/kit';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Doc, KLASIFIKASI, klasLabel, post } from '@/lib/api';
import { expectAction, fileHash } from '@/lib/signer';
import { cn } from '@/lib/utils';

const LEVEL: Record<string, number> = { BIASA: 1, TERBATAS: 2, RAHASIA: 3, SANGAT_RAHASIA: 4 };
const CHANNEL: Record<string, string> = { BIASA: 'ch-umum', TERBATAS: 'ch-umum', RAHASIA: 'ch-rahasia', SANGAT_RAHASIA: 'ch-rahasia' };
const TONE: Record<string, string> = {
  BIASA: 'bg-k-biasa/10 text-k-biasa',
  TERBATAS: 'bg-k-terbatas/10 text-k-terbatas',
  RAHASIA: 'bg-k-rahasia/12 text-k-rahasia',
  SANGAT_RAHASIA: 'bg-k-sr/10 text-k-sr',
};

const STEPS = [
  'SHA-256 dihitung dari file asli di perangkat Anda.',
  'File dienkripsi AES-256-GCM dengan kunci dari Vault.',
  'Ciphertext disimpan di object storage.',
  'RegisterDocument ditandatangani sertifikat Anda dan di-endorse dua organisasi.',
  'Jika transaksi gagal, metadata ikut dibatalkan.',
];

export default function NewDocumentPage() {
  return (
    <Shell>
      <NewDocument />
    </Shell>
  );
}

function NewDocument() {
  const { user } = useAuth();
  const router = useRouter();
  const clearance = LEVEL[user?.clearance ?? 'BIASA'];
  const [file, setFile] = useState<File | null>(null);
  const [nomor, setNomor] = useState('');
  const [perihal, setPerihal] = useState('');
  const [klas, setKlas] = useState(clearance >= LEVEL.TERBATAS ? 'TERBATAS' : 'BIASA');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('nomor', nomor);
    fd.append('perihal', perihal);
    fd.append('klasifikasi', klas);
    try {
      expectAction('RegisterDocument', [null, nomor.trim(), await fileHash(file), klas]);
      const doc = await post<Doc>('/documents', fd);
      router.push(`/documents/${doc.docId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const ready = !!file && !!nomor && !!perihal;

  return (
    <>
      <Link href="/documents" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Daftar dokumen
      </Link>
      <PageHead title="Registrasi dokumen">File dienkripsi sebelum disimpan. Ledger hanya menerima sidik jari SHA-256-nya.</PageHead>

      <form onSubmit={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="overflow-hidden">
          <PanelHead title="Berkas" description="PDF, PNG, atau JPG · maks 25 MB" icon={Upload} />
          <div className="p-5">
            <FilePick file={file} onChange={setFile} large />
          </div>

          <PanelHead title="Detail surat" className="border-t" icon={FileUp} />
          <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Field label="Nomor surat" htmlFor="nomor">
              <Input id="nomor" className="h-10 rounded-xl font-mono" placeholder="B/123/XI/2026" value={nomor} onChange={(e) => setNomor(e.target.value)} required />
            </Field>
            <Field label="Perihal" htmlFor="perihal">
              <Input id="perihal" className="h-10 rounded-xl" placeholder="Perihal dokumen" value={perihal} onChange={(e) => setPerihal(e.target.value)} required />
            </Field>
          </div>

          <PanelHead title="Klasifikasi" description="Maksimal setingkat clearance Anda" className="border-t" icon={Lock} />
          <div role="radiogroup" aria-label="Klasifikasi" className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {KLASIFIKASI.map((k) => {
              const allowed = LEVEL[k] <= clearance;
              const on = klas === k;
              const Icon = K_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!allowed}
                  title={allowed ? undefined : 'Di atas clearance Anda'}
                  onClick={() => setKlas(k)}
                  className={cn(
                    'relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    on ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-line hover:border-line-strong',
                  )}
                >
                  <span className={cn('grid size-9 place-items-center rounded-lg', TONE[k])}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold first-letter:uppercase">{klasLabel(k).toLowerCase()}</span>
                    <span className="block font-mono text-[11.5px] text-faint">{CHANNEL[k]}</span>
                  </span>
                  {on && (
                    <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-accent text-accent-ink">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {klas === 'SANGAT_RAHASIA' && (
            <p className="-mt-2 px-5 pb-5 text-[12.5px] text-muted">Dokumen Sangat Rahasia hanya bisa dibuka personel yang didisposisikan.</p>
          )}
        </Panel>

        <div className="grid gap-6 xl:sticky xl:top-28">
          <Panel>
            <PanelHead title="Ringkasan" />
            <KV
              rows={[
                ['Berkas', file ? file.name : <span className="font-normal text-faint">Belum dipilih</span>],
                ['Ukuran', file ? `${(file.size / 1024).toFixed(1)} KB` : '–'],
                ['Nomor', nomor ? <span className="font-mono">{nomor}</span> : '–'],
                ['Perihal', perihal || '–'],
                ['Klasifikasi', <Stamp k={klas} />],
                ['Channel', <span className="font-mono text-[13px]">{CHANNEL[klas]}</span>],
              ]}
            />
            <div className="grid gap-3 border-t border-line p-5">
              {error && <Notice tone="bad">{error}</Notice>}
              <Button type="submit" variant="primary" className="h-11 rounded-xl shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]" disabled={busy || !ready}>
                {busy ? 'Mengenkripsi & menulis ke ledger…' : 'Daftarkan ke ledger'}
              </Button>
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Yang terjadi saat mendaftar" />
            <ol className="relative grid gap-4 p-5">
              {STEPS.map((s, i) => (
                <li key={i} className="relative flex gap-3 text-[13px] text-muted">
                  {i < STEPS.length - 1 && <span className="absolute top-7 bottom-[-16px] left-[11px] w-px bg-line" aria-hidden />}
                  <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-panel-2 text-[11.5px] font-semibold text-ink">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </form>
    </>
  );
}
