'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth';
import { Shell } from '@/components/shell';
import { ACTION_LABEL, Alert, api, AuditLog, fmtDate, post } from '@/lib/api';

const TYPE_LABEL: Record<string, string> = {
  UnauthorizedAccess: 'Akses tidak sah',
  DocumentTampered: 'Dokumen palsu / diubah',
  StorageIntegrity: 'Storage dimanipulasi',
};

export default function SecurityPage() {
  return (
    <Shell>
      <Security />
    </Shell>
  );
}

function Security() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState<Alert | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'alert' | 'audit'>('alert');

  const allowed = user?.role === 'auditor' || user?.role === 'admin';

  useEffect(() => {
    if (!allowed) return;
    api<Alert[]>('/alerts').then(setAlerts).catch((e) => setError(e.message));
    api<AuditLog[]>('/audit').then(setLogs).catch((e) => setError(e.message));

    const es = new EventSource('/api/alerts/stream');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('alert', (ev) => {
      const a = JSON.parse((ev as MessageEvent).data) as Alert;
      setAlerts((prev) => [a, ...prev.filter((p) => p.id !== a.id)]);
      setFresh((prev) => new Set(prev).add(a.id));
      setToast(a);
      setTimeout(() => setToast((t) => (t?.id === a.id ? null : t)), 8000);
    });
    return () => es.close();
  }, [allowed]);

  const stats = useMemo(() => {
    const open = alerts.filter((a) => !a.acknowledged).length;
    const denied = (logs ?? []).filter((l) => l.action === 'ACCESS_DENIED').length;
    const granted = (logs ?? []).filter((l) => l.action === 'ACCESS_GRANTED').length;
    return { open, denied, granted, total: logs?.length ?? 0 };
  }, [alerts, logs]);

  async function ack(id: number) {
    await post(`/alerts/${id}/ack`);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }

  if (!allowed) return <div className="notice notice-bad">Halaman ini khusus unit pengamanan (role auditor).</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pusat pengamanan</h1>
          <p>Alert dikirim chaincode lewat event blockchain dan masuk ke sini secara real time.</p>
        </div>
        <span className={`live ${live ? '' : 'off'}`}>
          <span className="dot" /> {live ? 'LIVE' : 'TERPUTUS'}
        </span>
      </div>

      {error && <div className="notice notice-bad" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="stats">
        <div className="card stat">
          <b style={{ color: stats.open ? 'var(--bad)' : undefined }}>{stats.open}</b>
          <span>Alert belum ditindaklanjuti</span>
        </div>
        <div className="card stat">
          <b>{stats.denied}</b>
          <span>Akses ditolak</span>
        </div>
        <div className="card stat">
          <b>{stats.granted}</b>
          <span>Dokumen dibuka</span>
        </div>
        <div className="card stat">
          <b>{stats.total}</b>
          <span>Total entri ledger</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="filters">
            <button className="chip" aria-pressed={tab === 'alert'} onClick={() => setTab('alert')}>
              Alert
            </button>
            <button className="chip" aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>
              Seluruh jejak akses
            </button>
          </div>
        </div>

        {tab === 'alert' &&
          (alerts.length === 0 ? (
            <div className="empty">Belum ada alert.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Pelaku</th>
                  <th>Dokumen</th>
                  <th>Keterangan</th>
                  <th>Waktu</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className={`alert-row ${fresh.has(a.id) ? 'new' : ''}`}>
                    <td>
                      <span className={`pill ${a.acknowledged ? '' : 'pill-bad'}`}>
                        <span className="dot" /> {TYPE_LABEL[a.type] ?? a.type}
                      </span>
                    </td>
                    <td>
                      <b>{a.actor}</b>
                      <div className="faint">{a.org}</div>
                    </td>
                    <td>
                      <Link href={`/documents/${a.doc_id}`} className="mono">
                        {a.doc_id}
                      </Link>
                      <div className="faint">{a.channel}</div>
                    </td>
                    <td className="muted">{a.reason}</td>
                    <td className="muted">{fmtDate(a.created_at)}</td>
                    <td>
                      {!a.acknowledged && (
                        <button className="btn btn-sm" onClick={() => ack(a.id)}>
                          Tindak lanjut
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'audit' &&
          (!logs ? (
            <div className="empty">Membaca ledger…</div>
          ) : (
            <ul className="timeline">
              {logs.map((l) => (
                <li key={l.txId}>
                  <span className="mark" data-a={l.action} />
                  <div>
                    <div className="row wrap">
                      <b>{ACTION_LABEL[l.action] ?? l.action}</b>
                      <Link href={`/documents/${l.docId}`} className="mono muted">
                        {l.docId}
                      </Link>
                    </div>
                    <div className="muted">
                      {l.actor} · {l.jabatan || '-'} · {l.actorOrg} · clearance {l.clearance.replace('_', ' ')}
                    </div>
                    <div className="muted">{l.detail}</div>
                    <div className="faint mono">
                      {fmtDate(l.timestamp)} · {l.channel} · tx {l.txId.slice(0, 16)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </div>

      {toast && (
        <div className="toast" role="alert">
          <b>⚠ {TYPE_LABEL[toast.type] ?? toast.type}</b>
          {toast.actor} ({toast.org}) pada {toast.doc_id}
          <div style={{ opacity: 0.8, marginTop: 4 }}>{toast.reason}</div>
        </div>
      )}
    </>
  );
}
