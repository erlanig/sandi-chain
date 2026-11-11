'use client';

import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth } from '@/components/auth';
import { ClassBanner, Logo, Notice, ThemeToggle } from '@/components/kit';
import { cn } from '@/lib/utils';
// Foto disimpan di repo supaya tetap tampil di jaringan air-gapped
import soldier from '@/assets/soldier.webp';

// Terang: putih bersih. Gelap: mengikuti token tema.
const field =
  'h-11 w-full rounded-lg border border-transparent bg-[#f1f2ee] pl-10 text-[14px] text-ink placeholder:text-faint transition-colors hover:border-line focus-visible:border-ink focus-visible:bg-white focus-visible:outline-none dark:bg-panel-2 dark:focus-visible:border-accent dark:focus-visible:bg-panel-2';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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
    <div className="flex min-h-screen flex-col bg-white dark:bg-bg">
      <ClassBanner k="TERBATAS">Sistem informasi terbatas — hanya untuk personel berwenang</ClassBanner>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <main className="flex flex-col px-2 py-4 sm:px-8 lg:px-12 lg:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo className="h-7" />
              <span className="font-display text-xl font-bold tracking-[0.14em]">SANDI-CHAIN</span>
            </div>
            <ThemeToggle />
          </div>

          <div className="mx-auto my-auto w-full max-w-[380px] py-12">
            <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.02em]">Selamat datang</h1>
            <p className="mt-2 text-muted">Masuk dengan akun dinas Anda.</p>

            <form className="mt-8 grid gap-3" onSubmit={submit}>
              <label className="relative block">
                <span className="sr-only">Username</span>
                <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
                <input
                  className={field}
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  spellCheck={false}
                />
              </label>
              <label className="relative block">
                <span className="sr-only">Password</span>
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
                <input
                  className={cn(field, 'pr-11')}
                  type={show ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-faint hover:text-ink"
                  aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </label>

              {error && <Notice tone="bad">{error}</Notice>}

              <button
                type="submit"
                disabled={busy || !username || !password}
                className="group mt-2 flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink shadow-[inset_0_-3px_0_rgba(0,0,0,0.22)] transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Memverifikasi…' : 'Masuk'}
                {!busy && <ArrowRight className="size-4 transition-transform group-enabled:group-hover:translate-x-0.5" />}
              </button>
            </form>
          </div>
        </main>

        <aside
          className="relative hidden overflow-hidden bg-[#f4f5f0] lg:block"
          style={{ clipPath: 'polygon(48px 0, 100% 0, 100% calc(100% - 48px), calc(100% - 48px) 100%, 0 100%, 0 48px)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={soldier.src} alt="" className="absolute inset-0 size-full object-cover object-[50%_35%] dark:brightness-[0.82]" draggable={false} />
        </aside>
      </div>
    </div>
  );
}
