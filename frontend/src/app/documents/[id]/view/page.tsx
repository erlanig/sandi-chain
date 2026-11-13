'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileLock2, Loader2, ShieldAlert, ShieldX, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/components/auth';
import { IconTile, Panel } from '@/components/kit';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { expectAction } from '@/lib/signer';

export default function ViewerPage() {
  return (
    <Shell>
      <Viewer />
    </Shell>
  );
}

function Viewer() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [txId, setTxId] = useState('');
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Satu permintaan = satu transaksi RequestAccess di ledger. Hindari dobel di StrictMode.
    if (started.current) return;
    started.current = true;
    let objectUrl: string | null = null;
    expectAction('RequestAccess', [id]);

    fetch(`/api/documents/${id}/view`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({ message: res.statusText }));
          throw { status: res.status, message: j.message };
        }
        setTxId(res.headers.get('X-Access-Tx') ?? '');
        objectUrl = URL.createObjectURL(await res.blob());
        setUrl(objectUrl);
      })
      .catch((e) => setError({ status: e.status ?? 0, message: e.message ?? String(e) }));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const mark = user ? `${user.nama} · ${user.nrp}` : '';

  return (
    <>
      <Link href={`/documents/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Kembali ke detail
      </Link>

      <Panel className="mb-5 flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={FileLock2} tone="bg-accent/10 text-accent" />
          <div className="min-w-0">
            <p className="truncate font-mono text-[14px] font-semibold">{id}</p>
            <p className="truncate text-[12.5px] text-muted">Watermark atas nama {mark}</p>
          </div>
        </div>
        {txId && (
          <span className="inline-flex items-center gap-2 rounded-full bg-ok/10 px-3 py-1.5 text-[12.5px] font-semibold text-ok" title={txId}>
            <span className="size-1.5 rounded-full bg-current" />
            Akses tercatat · <span className="font-mono font-medium">tx {txId.slice(0, 12)}</span>
          </span>
        )}
      </Panel>

      {error ? (
        <ViewerError status={error.status} message={error.message} id={id} />
      ) : !url ? (
        <Panel className="grid h-[calc(100vh-300px)] min-h-[420px] place-items-center">
          <div className="flex flex-col items-center gap-3 text-center text-[13.5px] text-muted">
            <Loader2 className="size-6 animate-spin text-accent" />
            Meminta izin ke chaincode, mendekripsi, dan memberi watermark…
          </div>
        </Panel>
      ) : (
        <div
          className="relative h-[calc(100vh-260px)] min-h-[520px] overflow-hidden rounded-2xl border border-line bg-[#3a3f3a]"
          onContextMenu={(e) => e.preventDefault()}
        >
          <iframe className="size-full border-0" src={`${url}#toolbar=0&navpanes=0`} title={`Dokumen ${id}`} />
          {/* Lapisan kedua di atas watermark PDF: ikut tertangkap saat layar difoto */}
          <div className="viewer-overlay" aria-hidden>
            {Array.from({ length: 60 }).map((_, i) => (
              <span key={i}>{mark}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ViewerError({ status, message, id }: { status: number; message: string; id: string }) {
  const denied = status === 403;
  const integrity = status === 409;
  const Icon = denied ? ShieldX : integrity ? ShieldAlert : TriangleAlert;
  return (
    <Panel className="flex flex-col items-center px-6 py-14 text-center">
      <IconTile icon={Icon} tone={denied || integrity ? 'bg-bad/10 text-bad' : 'bg-panel-2 text-muted'} className="size-14 rounded-2xl [&_svg]:size-7" />
      <h2 className="mt-5 text-[18px] font-bold">{denied ? 'Akses ditolak' : integrity ? 'Integritas dokumen gagal' : 'Gagal membuka dokumen'}</h2>
      <p className="mt-1.5 max-w-md text-[14px] text-muted">{message}</p>
      {denied && <p className="mt-3 max-w-md text-[12.5px] text-faint">Percobaan ini sudah tercatat di ledger dan diteruskan ke unit pengamanan.</p>}
      <Button asChild className="mt-6 h-10 rounded-xl">
        <Link href={`/documents/${id}`}>Kembali ke detail</Link>
      </Button>
    </Panel>
  );
}
