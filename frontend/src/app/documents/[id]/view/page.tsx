'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth';
import { Shell } from '@/components/shell';
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
      <div className="page-head">
        <div>
          <Link href={`/documents/${id}`} className="muted">
            ← Kembali ke detail
          </Link>
          <h1 style={{ marginTop: 6 }} className="mono">
            {id}
          </h1>
        </div>
        {txId && (
          <span className="pill pill-ok" title={txId}>
            <span className="dot" /> Akses tercatat · tx {txId.slice(0, 12)}
          </span>
        )}
      </div>

      {error ? (
        <div className={`notice ${error.status === 403 || error.status === 409 ? 'notice-bad' : ''}`}>
          <b>{error.status === 403 ? 'Akses ditolak' : error.status === 409 ? 'Integritas dokumen gagal' : 'Gagal membuka'}</b>
          <div>{error.message}</div>
          {error.status === 403 && <div className="faint" style={{ marginTop: 6 }}>Percobaan ini sudah tercatat di ledger dan diteruskan ke unit pengamanan.</div>}
        </div>
      ) : !url ? (
        <div className="empty">Meminta izin ke chaincode, mendekripsi, dan memberi watermark…</div>
      ) : (
        <div className="viewer" onContextMenu={(e) => e.preventDefault()}>
          <iframe src={`${url}#toolbar=0&navpanes=0`} title={`Dokumen ${id}`} />
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
