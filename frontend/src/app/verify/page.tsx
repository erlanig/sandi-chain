'use client';

import { useEffect, useState } from 'react';
import { FilePick, Shell, Stamp } from '@/components/shell';
import { api, Doc, post, shortHash, VerifyResult } from '@/lib/api';

export default function VerifyPage() {
  return (
    <Shell>
      <Verify />
    </Shell>
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
      setRes(await post<VerifyResult>(`/documents/${docId}/verify`, fd));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Verifikasi keaslian dokumen</h1>
          <p>Cocokkan salinan yang beredar (hasil cetak ulang, lampiran email, flashdisk) dengan catatan di ledger.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad stack">
          <div className="field">
            <label>Dokumen acuan</label>
            <select className="input" value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="">Pilih dokumen…</option>
              {docs.map((d) => (
                <option key={d.docId} value={d.docId}>
                  {d.nomor} — {d.perihal}
                </option>
              ))}
            </select>
          </div>
          {selected && (
            <div className="row wrap">
              <Stamp k={selected.klasifikasi} />
              <span className="faint mono">v{selected.version} · {shortHash(selected.hash)}</span>
            </div>
          )}
          <FilePick file={file} onChange={setFile} hint="File yang ingin diperiksa" />
          <button className="btn btn-primary" disabled={!file || !docId || busy} onClick={run}>
            {busy ? 'Memeriksa ledger…' : 'Verifikasi'}
          </button>
          {error && <div className="notice notice-bad">{error}</div>}
        </div>

        <div className="card card-pad stack">
          <h3>Hasil</h3>
          {!res && <p className="muted">Belum ada pemeriksaan.</p>}
          {res && (
            <>
              <div className={`notice ${res.authentic ? 'notice-ok' : 'notice-bad'}`} style={{ fontSize: 15 }}>
                <b style={{ fontSize: 18 }}>{res.authentic ? '✓ ASLI' : '✕ TIDAK COCOK'}</b>
                <div>{res.message}</div>
              </div>
              <dl className="kv">
                <dt>SHA-256 file</dt>
                <dd className="mono">{res.hash}</dd>
                <dt>Cocok dengan</dt>
                <dd>{res.matchedVersion ? `v${res.matchedVersion}` : '–'}</dd>
                <dt>Versi terbaru</dt>
                <dd>v{res.latestVersion}</dd>
              </dl>
              {!res.authentic && (
                <p className="faint" style={{ margin: 0 }}>
                  Hasil ini tercatat di ledger dan memicu alert ke unit pengamanan.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
