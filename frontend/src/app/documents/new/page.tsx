'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { FilePick, Shell, Stamp } from '@/components/shell';
import { Doc, KLASIFIKASI, klasLabel, post } from '@/lib/api';

const LEVEL: Record<string, number> = { BIASA: 1, TERBATAS: 2, RAHASIA: 3, SANGAT_RAHASIA: 4 };

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
  const [file, setFile] = useState<File | null>(null);
  const [nomor, setNomor] = useState('');
  const [perihal, setPerihal] = useState('');
  const [klas, setKlas] = useState('TERBATAS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const allowed = KLASIFIKASI.filter((k) => LEVEL[k] <= LEVEL[user?.clearance ?? 'BIASA']);

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
      const doc = await post<Doc>('/documents', fd);
      router.push(`/documents/${doc.docId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Registrasi dokumen</h1>
          <p>File dienkripsi AES-256-GCM sebelum disimpan. Ledger hanya menerima sidik jari SHA-256-nya.</p>
        </div>
      </div>

      <div className="grid-2">
        <form className="card card-pad stack" onSubmit={submit}>
          <FilePick file={file} onChange={setFile} />
          <div className="field">
            <label>Nomor surat</label>
            <input className="input" placeholder="mis. B/123/XI/2026" value={nomor} onChange={(e) => setNomor(e.target.value)} required />
          </div>
          <div className="field">
            <label>Perihal</label>
            <input className="input" placeholder="Perihal dokumen" value={perihal} onChange={(e) => setPerihal(e.target.value)} required />
          </div>
          <div className="field">
            <label>Klasifikasi</label>
            <select className="input" value={klas} onChange={(e) => setKlas(e.target.value)}>
              {allowed.map((k) => (
                <option key={k} value={k}>
                  {klasLabel(k)}
                </option>
              ))}
            </select>
            <span className="faint" style={{ fontSize: 12 }}>
              Anda hanya dapat mendaftarkan sampai tingkat clearance Anda. Dokumen SANGAT RAHASIA hanya bisa dibuka penerima disposisi.
            </span>
          </div>
          {error && <div className="notice notice-bad">{error}</div>}
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !file || !nomor || !perihal}>
              {busy ? 'Mengenkripsi & menulis ke ledger…' : 'Daftarkan ke ledger'}
            </button>
            <Stamp k={klas} />
          </div>
        </form>

        <div className="card card-pad stack">
          <h3>Yang terjadi saat Anda menekan tombol</h3>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            <li>SHA-256 dihitung dari file asli.</li>
            <li>Kunci dokumen (DEK) dibuat Vault; file dienkripsi AES-256-GCM.</li>
            <li>Ciphertext disimpan ke object storage; DEK disimpan dalam bentuk terbungkus.</li>
            <li>
              Chaincode <code>RegisterDocument</code> ditandatangani sertifikat Anda dan di-endorse peer kedua organisasi.
            </li>
            <li>Kalau transaksi blockchain gagal, metadata ikut dibatalkan.</li>
          </ol>
        </div>
      </div>
    </>
  );
}
