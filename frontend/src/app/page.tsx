'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Shell, Stamp } from '@/components/shell';
import { api, Doc, fmtDate, KLASIFIKASI, klasLabel } from '@/lib/api';

export default function DocumentsPage() {
  return (
    <Shell>
      <DocumentList />
    </Shell>
  );
}

function DocumentList() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('SEMUA');
  const [q, setQ] = useState('');

  useEffect(() => {
    api<Doc[]>('/documents').then(setDocs).catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const s = q.toLowerCase();
    return (docs ?? []).filter(
      (d) =>
        (filter === 'SEMUA' || d.klasifikasi === filter) &&
        (!s || [d.nomor, d.perihal, d.docId, d.ownerName].some((v) => v.toLowerCase().includes(s))),
    );
  }, [docs, filter, q]);

  const count = (k: string) => (docs ?? []).filter((d) => d.klasifikasi === k).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dokumen</h1>
          <p>Hanya dokumen dengan klasifikasi sesuai clearance Anda yang tampil. Daftar ini disaring oleh chaincode, bukan oleh frontend.</p>
        </div>
        <Link href="/documents/new" className="btn btn-primary">
          + Registrasi dokumen
        </Link>
      </div>

      <div className="stats">
        {KLASIFIKASI.map((k) => (
          <div key={k} className="card stat">
            <b>{docs ? count(k) : '–'}</b>
            <Stamp k={k} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="filters">
            {['SEMUA', ...KLASIFIKASI].map((k) => (
              <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {klasLabel(k)}
              </button>
            ))}
          </div>
          <input className="input" style={{ maxWidth: 260, height: 30 }} placeholder="Cari nomor, perihal, pembuat…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {error && <div className="empty err">{error}</div>}
        {!error && !docs && <div className="empty">Mengambil data dari ledger…</div>}
        {docs && shown.length === 0 && <div className="empty">Belum ada dokumen.</div>}
        {shown.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Nomor / Perihal</th>
                <th>Klasifikasi</th>
                <th>Versi</th>
                <th>Pembuat</th>
                <th>Diperbarui</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.docId} className="click" onClick={() => router.push(`/documents/${d.docId}`)}>
                  <td>
                    <b>{d.nomor}</b>
                    <div className="muted">{d.perihal}</div>
                    <div className="faint mono">{d.docId}</div>
                  </td>
                  <td>
                    <Stamp k={d.klasifikasi} />
                    {d.revoked && (
                      <div style={{ marginTop: 6 }}>
                        <span className="pill pill-warn">dicabut</span>
                      </div>
                    )}
                  </td>
                  <td className="mono">v{d.version}</td>
                  <td>
                    {d.ownerName}
                    <div className="faint">{d.ownerOrg}</div>
                  </td>
                  <td className="muted">{fmtDate(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
