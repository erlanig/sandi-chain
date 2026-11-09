'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth';
import { FilePick, Shell, Stamp } from '@/components/shell';
import { ACTION_LABEL, api, AuditLog, DocDetail, fmtDate, post, shortHash, VerifyResult } from '@/lib/api';

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

  if (error) return <div className="notice notice-bad">{error}</div>;
  if (!doc) return <div className="empty">Membaca ledger…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ marginBottom: 6 }}>
            <Stamp k={doc.klasifikasi} />
            {doc.revoked && <span className="pill pill-warn">DICABUT</span>}
            <span className="faint mono">{doc.docId}</span>
          </div>
          <h1>{doc.nomor}</h1>
          <p>{doc.perihal}</p>
        </div>
        {doc.revoked ? (
          <button className="btn" disabled>
            Dokumen dicabut
          </button>
        ) : (
          <Link href={`/documents/${doc.docId}/view`} className="btn btn-primary">
            Buka dokumen
          </Link>
        )}
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card card-pad">
            <h3 style={{ marginBottom: 12 }}>Catatan on-chain</h3>
            <dl className="kv">
              <dt>SHA-256 terkini</dt>
              <dd className="mono">{doc.hash}</dd>
              <dt>Versi</dt>
              <dd>v{doc.version}</dd>
              <dt>Pembuat</dt>
              <dd>
                {doc.ownerName} <span className="faint">({doc.ownerOrg})</span>
              </dd>
              <dt>Channel</dt>
              <dd className="mono">{doc.channel}</dd>
              <dt>Didaftarkan</dt>
              <dd>{fmtDate(doc.createdAt)}</dd>
              <dt>Disposisi</dt>
              <dd>{doc.recipients.length ? doc.recipients.join(', ') : <span className="faint">–</span>}</dd>
            </dl>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Riwayat versi</h2>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Versi</th>
                  <th>File</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {doc.versions.map((v) => (
                  <tr key={v.version}>
                    <td className="mono">v{v.version}</td>
                    <td>
                      {v.filename}
                      <div className="faint">
                        {(v.size / 1024).toFixed(1)} KB · {fmtDate(v.created_at)}
                      </div>
                    </td>
                    <td className="mono" title={v.sha256}>
                      {shortHash(v.sha256)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canAudit && (
            <div className="card">
              <div className="card-head">
                <h2>Jejak akses (immutable)</h2>
                <button className="btn btn-sm btn-ghost" onClick={loadLogs}>
                  Muat ulang
                </button>
              </div>
              {!logs ? (
                <div className="empty">Memuat…</div>
              ) : (
                <ul className="timeline">
                  {logs.map((l) => (
                    <li key={l.txId}>
                      <span className="mark" data-a={l.action} />
                      <div>
                        <div className="row wrap">
                          <b>{ACTION_LABEL[l.action] ?? l.action}</b>
                          <span className="muted">
                            {l.actor} · {l.jabatan || '-'} · {l.actorOrg}
                          </span>
                        </div>
                        <div className="muted">{l.detail}</div>
                        <div className="faint mono">
                          {fmtDate(l.timestamp)} · tx {l.txId.slice(0, 16)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="stack">
          <VerifyBox docId={doc.docId} />
          {doc.isOwner && !doc.revoked && (
            <>
              <DispositionBox docId={doc.docId} sr={doc.klasifikasi === 'SANGAT_RAHASIA'} onDone={refresh} />
              <VersionBox docId={doc.docId} onDone={refresh} />
              <RevokeBox docId={doc.docId} onDone={refresh} />
            </>
          )}
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
      setRes(await post<VerifyResult>(`/documents/${docId}/verify`, fd));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad stack">
      <h3>Verifikasi keaslian</h3>
      <p className="muted" style={{ margin: 0 }}>
        Unggah salinan yang beredar. Sidik jarinya dibandingkan dengan ledger.
      </p>
      <FilePick file={file} onChange={setFile} hint="File pembanding (apa pun formatnya)" />
      <button className="btn" disabled={!file || busy} onClick={run}>
        {busy ? 'Memeriksa…' : 'Verifikasi'}
      </button>
      {error && <div className="notice notice-bad">{error}</div>}
      {res && (
        <div className={`notice ${res.authentic ? 'notice-ok' : 'notice-bad'}`}>
          <b>{res.authentic ? 'ASLI' : 'TIDAK COCOK'}</b>
          <div>{res.message}</div>
          <div className="faint mono" style={{ marginTop: 4 }}>
            {shortHash(res.hash, 16)}
          </div>
        </div>
      )}
    </div>
  );
}

function DispositionBox({ docId, sr, onDone }: { docId: string; sr: boolean; onDone: () => void }) {
  const [people, setPeople] = useState<{ username: string; nama: string; jabatan: string; clearance: string }[]>([]);
  const [recipient, setRecipient] = useState('');
  const [catatan, setCatatan] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<typeof people>('/auth/personel').then(setPeople).catch(() => undefined);
  }, []);

  async function send() {
    setMsg('');
    try {
      await post(`/documents/${docId}/disposition`, { recipient, catatan });
      setMsg('Disposisi tercatat di ledger.');
      setRecipient('');
      setCatatan('');
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="card card-pad stack">
      <h3>Disposisi</h3>
      {sr && <p className="muted" style={{ margin: 0 }}>Dokumen SANGAT RAHASIA hanya bisa dibuka personel yang didisposisikan.</p>}
      <select className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
        <option value="">Pilih personel…</option>
        {people.map((p) => (
          <option key={p.username} value={p.username}>
            {p.nama} — {p.jabatan} ({p.clearance.replace('_', ' ')})
          </option>
        ))}
      </select>
      <textarea className="input" placeholder="Catatan disposisi" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      <button className="btn" disabled={!recipient} onClick={send}>
        Kirim disposisi
      </button>
      {msg && <div className="notice">{msg}</div>}
    </div>
  );
}

function VersionBox({ docId, onDone }: { docId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!file) return;
    setBusy(true);
    setMsg('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      await post(`/documents/${docId}/versions`, fd);
      setFile(null);
      setMsg('Versi baru tercatat. Hash versi lama tetap tersimpan di ledger.');
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad stack">
      <h3>Revisi</h3>
      <FilePick file={file} onChange={setFile} />
      <button className="btn" disabled={!file || busy} onClick={send}>
        {busy ? 'Menyimpan…' : 'Unggah versi baru'}
      </button>
      {msg && <div className="notice">{msg}</div>}
    </div>
  );
}

function RevokeBox({ docId, onDone }: { docId: string; onDone: () => void }) {
  const [alasan, setAlasan] = useState('');
  const [confirm, setConfirm] = useState(false);

  async function send() {
    await post(`/documents/${docId}/revoke`, { alasan });
    onDone();
  }

  return (
    <div className="card card-pad stack">
      <h3>Cabut dokumen</h3>
      <p className="muted" style={{ margin: 0 }}>
        Setelah dicabut, dokumen tidak bisa dibuka siapa pun. Tidak bisa dibatalkan.
      </p>
      <input className="input" placeholder="Alasan pencabutan" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
      {!confirm ? (
        <button className="btn btn-danger" disabled={!alasan} onClick={() => setConfirm(true)}>
          Cabut…
        </button>
      ) : (
        <div className="row">
          <button className="btn btn-danger" onClick={send}>
            Ya, cabut permanen
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
            Batal
          </button>
        </div>
      )}
    </div>
  );
}
