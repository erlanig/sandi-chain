'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth';

// Akun demo fiktif (lihat backend/config/users.seed.json)
const DEMO = [
  ['letkol.arya', 'Danyon', 'SANGAT RAHASIA'],
  ['mayor.dewi', 'Kasi Intel', 'RAHASIA'],
  ['kapten.andi', 'Pasi Ops', 'SANGAT RAHASIA'],
  ['serka.budi', 'Staf TU', 'TERBATAS'],
  ['auditor.pam', 'Unit Pam (auditor)', 'RAHASIA'],
];

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="class-banner" data-k="TERBATAS">
        SISTEM INFORMASI TERBATAS — HANYA UNTUK PERSONEL BERWENANG
      </div>
      <div className="login-wrap">
        <div className="login">
          <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
            <span className="brand-mark">S</span>
            SANDI-CHAIN
          </div>
          <form className="card card-pad stack" onSubmit={submit}>
            <div>
              <h1>Masuk</h1>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Transaksi Anda ditandatangani dengan sertifikat X.509 milik Anda.
              </p>
            </div>
            <div className="field">
              <label htmlFor="u">Username</label>
              <input id="u" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="p">Password</label>
              <input id="p" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <div className="notice notice-bad">{error}</div>}
            <button className="btn btn-primary" disabled={busy || !username || !password}>
              {busy ? 'Memverifikasi…' : 'Masuk'}
            </button>
          </form>

          <div className="card card-pad demo-users">
            <h3 style={{ marginBottom: 8 }}>Akun demo · password sandi123</h3>
            {DEMO.map(([u, j, c]) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setUsername(u);
                  setPassword('sandi123');
                }}
              >
                <span className="mono">{u}</span>
                <span className="faint">
                  {j} · {c}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
