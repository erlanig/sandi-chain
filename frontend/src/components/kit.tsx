'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Ban, CircleCheck, CircleX, Eye, FilePlus2, FileText, History, Moon, Send, Shield, ShieldAlert, ShieldCheck, ShieldX, Sun, Upload, type LucideIcon } from 'lucide-react';
import { ACTION_LABEL, AuditLog, fmtDate, klasLabel } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

/* ------------------------------------------------------------------ klasifikasi */

export const K_BG: Record<string, string> = {
  BIASA: 'bg-k-biasa',
  TERBATAS: 'bg-k-terbatas',
  RAHASIA: 'bg-k-rahasia',
  SANGAT_RAHASIA: 'bg-k-sr',
};

const K_TONE: Record<string, string> = {
  BIASA: 'bg-k-biasa/12 text-k-biasa ring-k-biasa/25',
  TERBATAS: 'bg-k-terbatas/12 text-k-terbatas ring-k-terbatas/25',
  RAHASIA: 'bg-k-rahasia/12 text-k-rahasia ring-k-rahasia/25',
  // tingkat tertinggi: merah penuh supaya paling menonjol
  SANGAT_RAHASIA: 'bg-k-sr text-white ring-k-sr shadow-[0_1px_6px_-1px] shadow-k-sr/50',
};

export const K_ICON: Record<string, LucideIcon> = { BIASA: FileText, TERBATAS: Shield, RAHASIA: ShieldCheck, SANGAT_RAHASIA: ShieldAlert };

/** "SANGAT_RAHASIA" -> "Sangat Rahasia" */
export const klasTitle = (k: string) => klasLabel(k).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Badge klasifikasi: pil berwarna dengan ikon perisai. Satu komponen untuk seluruh portal. */
export function Stamp({ k, className }: { k: string; className?: string }) {
  const Icon = K_ICON[k] ?? FileText;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-[12px] leading-none font-semibold whitespace-nowrap ring-1 ring-inset',
        K_TONE[k] ?? 'bg-panel-2 text-muted ring-line',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2.25} />
      {klasTitle(k)}
    </span>
  );
}

// Banner memakai warna tetap di kedua tema: ia penanda sesi, bukan bagian dari tema.
const BANNER: Record<string, string> = {
  BIASA: 'bg-[#35733f] text-white',
  TERBATAS: 'bg-[#1f5d94] text-white',
  RAHASIA: 'bg-[#d68a2c] text-[#1a1206]',
  SANGAT_RAHASIA: 'bg-[#a3211d] text-white',
};

export function ClassBanner({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className={cn('px-3 py-1 text-center font-mono text-[11px] leading-4 font-semibold tracking-[0.22em] uppercase', BANNER[k])}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ merek & tema */

/**
 * Lambang: elang bersayap tiga garis dengan bintang di dada (ruang kosong) dan chevron di ekor.
 * Garis atas + kepala merah, bintang putih/kosong (merah putih), sayap hijau, chevron emas.
 * Warna diambil dari --logo-red / --logo-wing / --logo-gold supaya bisa diganti per konteks.
 * Geometri yang sama dipakai di src/app/icon.svg; ubah keduanya bersamaan.
 */
export function Logo({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 240 100" className={cn('h-7 w-auto shrink-0', className)} role="img" aria-label="Lambang SANDI-Chain">
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="100">
        <rect width="240" height="100" fill="#fff" />
        <g fill="#000" stroke="#000" strokeWidth="5">
          <path d="M120 20 126.8 40.7 148.5 40.7 130.9 53.6 137.6 74.3 120 61.5 102.4 74.3 109.1 53.6 91.5 40.7 113.2 40.7Z" />
          <path d="M99.3 84 102.4 74.3 120 61.5 137.6 74.3 140.7 84V100H99.3Z" />
        </g>
        <path fill="#000" d="M0 0H1.1L45.6 100H0ZM240 0H238.9L194.4 100H240Z" />
      </mask>
      <g mask={`url(#${id})`} fill="none" strokeLinejoin="round" strokeWidth="13">
        <path stroke="var(--logo-red)" d="M4 22H70L86 38H154L170 22H236" />
        <path fill="var(--logo-red)" stroke="none" d="M106 33 112 13Q113.5 7 120 7H128Q131 7 132 10L133 13H139L142 21H133.5L137 33Z" />
        <path stroke="var(--logo-wing)" d="M12 40H62L78 56H112M228 40H178L162 56H128" />
        <path stroke="var(--logo-wing)" d="M20 58H54L70 74H110M220 58H186L170 74H130" />
      </g>
      <path fill="none" stroke="var(--logo-gold)" strokeWidth="7" d="M103 87 120 72 137 87" />
      <path fill="var(--logo-gold)" d="M108 98 120 87.5 132 98Z" />
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('sandi.theme', next);
    } catch {
      /* penyimpanan diblokir: tema tetap berganti untuk sesi ini */
    }
  }
  return (
    <Button variant="ghost" size="icon" className={className} onClick={toggle} aria-label="Ganti tema terang/gelap" title="Ganti tema">
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

/* ------------------------------------------------------------------ tata letak */

export function PageHead({
  title,
  eyebrow,
  children,
  actions,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-3 flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] break-words">{title}</h1>
        {children && <p className="mt-1 max-w-[70ch] text-[14px] text-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('rounded-2xl border border-line bg-panel', className)} {...props} />;
}

export function PanelHead({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel-2 text-muted">
            <Icon className="size-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description && <p className="text-[12.5px] text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Kotak ikon berwarna lembut. */
export function IconTile({ icon: Icon, tone = 'bg-panel-2 text-muted', className }: { icon: LucideIcon; tone?: string; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone, className)}>
      <Icon className="size-[18px]" />
    </span>
  );
}

/** Kumpulan kartu statistik dalam satu wadah abu tipis. */
export function StatGroup({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-panel-2/60 p-2', className)}>
      {title && <h2 className="px-3 pt-2 pb-3 text-[15px] font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function StatCard({ label, value, note, icon: Icon, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; icon: LucideIcon; tone: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tone)}>
          <Icon className="size-4" />
        </span>
        <span className="truncate text-[13px] font-medium text-muted">{label}</span>
      </div>
      <p className="mt-4 text-[28px] leading-none font-bold tracking-[-0.02em] tabular-nums">{value}</p>
      {note && <p className="mt-2 truncate text-[12.5px] text-faint">{note}</p>}
    </div>
  );
}

export function Empty({ children, className, icon: Icon }: { children: React.ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-12 text-center text-[13.5px] text-muted', className)}>
      {Icon && <IconTile icon={Icon} className="size-12 rounded-2xl" />}
      {children}
    </div>
  );
}

const NOTICE = {
  plain: 'border-line bg-panel-2',
  ok: 'border-ok/30 bg-ok/8',
  bad: 'border-bad/30 bg-bad/8',
  warn: 'border-warn/30 bg-warn/8',
};

export function Notice({ tone = 'plain', className, ...props }: React.ComponentProps<'div'> & { tone?: keyof typeof NOTICE }) {
  return <div role={tone === 'bad' ? 'alert' : undefined} className={cn('rounded-xl border px-4 py-3 text-[13.5px]', NOTICE[tone], className)} {...props} />;
}

/** Daftar kunci–nilai rapat untuk data ledger. */
export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-line text-[13.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Nilai hash dalam kotak mono, mudah dipindai. */
export function HashBox({ value, className }: { value: string; className?: string }) {
  return <code className={cn('block rounded-lg bg-panel-2 px-3 py-2 font-mono text-[12px] leading-relaxed font-normal break-all text-ink', className)}>{value}</code>;
}

/* ------------------------------------------------------------------ berkas */

export function FilePick({
  file,
  onChange,
  hint,
  accept = 'application/pdf,image/png,image/jpeg',
  label = 'Pilih file',
  large,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  hint?: string;
  accept?: string;
  label?: string;
  large?: boolean;
}) {
  const sub = file ? `${(file.size / 1024).toFixed(1)} KB · klik untuk ganti` : (hint ?? 'PDF, PNG, atau JPG · maks 25 MB');
  return (
    <label
      className={cn(
        'flex cursor-pointer rounded-xl border border-dashed transition-colors focus-within:outline-2 focus-within:outline-accent hover:border-accent hover:bg-accent/5',
        file ? 'border-accent bg-accent/5' : 'border-line-strong',
        large ? 'flex-col items-center gap-3 px-6 py-9 text-center' : 'items-center gap-3 px-3.5 py-3',
      )}
    >
      <input type="file" className="sr-only" accept={accept} onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <IconTile icon={file ? FileText : Upload} tone={file ? 'bg-accent/12 text-accent' : 'bg-panel-2 text-muted'} className={large ? 'size-12 rounded-2xl' : undefined} />
      <span className="min-w-0">
        <span className={cn('block truncate font-semibold', large && 'text-[15px]')}>{file ? file.name : large ? 'Klik untuk memilih file' : label}</span>
        <span className="block text-[12.5px] text-muted">{sub}</span>
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ putusan verifikasi */

/** Hasil verifikasi: blok berwarna dengan ikon, judul, dan pesan. */
export function Verdict({ authentic, message, className }: { authentic: boolean; message?: React.ReactNode; className?: string }) {
  const Icon = authentic ? CircleCheck : CircleX;
  return (
    <div className={cn('flex items-start gap-3.5 rounded-xl border p-4', authentic ? 'border-ok/30 bg-ok/8' : 'border-bad/30 bg-bad/8', className)}>
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl text-white', authentic ? 'bg-ok' : 'bg-bad')}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className={cn('text-[17px] font-bold', authentic ? 'text-ok' : 'text-bad')}>{authentic ? 'Dokumen asli' : 'Tidak cocok'}</p>
        {message && <p className="mt-0.5 text-[13.5px] text-muted">{message}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ jejak akses */

const ACTION_STYLE: Record<string, { icon: LucideIcon; tone: string; text: string }> = {
  ACCESS_DENIED: { icon: ShieldX, tone: 'bg-bad/10 text-bad', text: 'text-bad' },
  VERIFY_TAMPERED: { icon: CircleX, tone: 'bg-bad/10 text-bad', text: 'text-bad' },
  ACCESS_GRANTED: { icon: Eye, tone: 'bg-ok/10 text-ok', text: 'text-ink' },
  VERIFY_OK: { icon: CircleCheck, tone: 'bg-ok/10 text-ok', text: 'text-ink' },
  REGISTER: { icon: FilePlus2, tone: 'bg-accent/10 text-accent', text: 'text-ink' },
  NEW_VERSION: { icon: History, tone: 'bg-accent/10 text-accent', text: 'text-ink' },
  DISPOSITION: { icon: Send, tone: 'bg-k-terbatas/10 text-k-terbatas', text: 'text-ink' },
  REVOKE: { icon: Ban, tone: 'bg-warn/10 text-warn', text: 'text-warn' },
};
const ACTION_DEFAULT = { icon: FileText, tone: 'bg-panel-2 text-muted', text: 'text-ink' };

/** Entri ledger sebagai daftar aktivitas: ikon aksi, pelaku, keterangan, waktu, tx. */
export function AuditList({ logs, showDoc }: { logs: AuditLog[]; showDoc?: boolean }) {
  if (logs.length === 0) return <Empty icon={History}>Belum ada entri.</Empty>;
  return (
    <ol className="divide-y divide-line">
      {logs.map((l) => {
        const st = ACTION_STYLE[l.action] ?? ACTION_DEFAULT;
        return (
          <li key={l.txId} className="flex gap-3.5 px-5 py-3.5">
            <IconTile icon={st.icon} tone={st.tone} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="text-[14px]">
                  <span className={cn('font-semibold', st.text)}>{ACTION_LABEL[l.action] ?? l.action}</span>
                  <span className="text-muted"> oleh </span>
                  <span className="font-medium">{l.actor}</span>
                  <span className="text-muted">
                    {' '}
                    · {l.jabatan || '-'} · {l.actorOrg}
                  </span>
                </p>
                <time className="text-[12.5px] whitespace-nowrap text-faint" dateTime={l.timestamp}>
                  {fmtDate(l.timestamp)}
                </time>
              </div>
              {l.detail && <p className="mt-0.5 text-[13px] break-words text-muted">{l.detail}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-faint">
                {showDoc && (
                  <Link href={`/documents/${l.docId}`} className="rounded-md bg-panel-2 px-1.5 py-0.5 text-muted hover:text-ink">
                    {l.docId}
                  </Link>
                )}
                {showDoc && l.channel && <span>{l.channel}</span>}
                {showDoc && <span>clearance {klasLabel(l.clearance)}</span>}
                <span title={l.txId}>tx {l.txId.slice(0, 16)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ linimasa jejak akses */

const dayKey = (s: string) => new Date(s).toLocaleDateString('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' });
const clock = (s: string) => new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/** Jejak akses sebagai linimasa vertikal: dikelompokkan per tanggal, tiap entri berupa simpul berikon. */
export function AuditTimeline({ logs, highlight }: { logs: AuditLog[]; highlight?: string }) {
  if (logs.length === 0) return <Empty icon={History}>Tidak ada entri untuk saringan ini.</Empty>;

  const groups: { day: string; items: AuditLog[] }[] = [];
  for (const l of logs) {
    const day = dayKey(l.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(l);
    else groups.push({ day, items: [l] });
  }

  return (
    <div className="px-5 pt-2 pb-5 sm:px-6">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="sticky top-[88px] z-10 -mx-1 bg-panel/95 px-1 py-3 text-[12px] font-semibold tracking-[0.08em] text-faint uppercase backdrop-blur">{g.day}</h3>
          <ol className="relative">
            {/* garis linimasa */}
            <span className="absolute top-2 bottom-2 left-[19px] w-0.5 rounded-full bg-line" aria-hidden />
            {g.items.map((l) => {
              const st = ACTION_STYLE[l.action] ?? ACTION_DEFAULT;
              const bad = l.action === 'ACCESS_DENIED' || l.action === 'VERIFY_TAMPERED';
              return (
                <li key={l.txId} className="relative flex gap-4 pb-4 last:pb-0">
                  {/* alas buram supaya garis linimasa tidak tembus di balik ikon */}
                  <span className="relative z-[1] h-fit shrink-0 rounded-xl bg-panel ring-4 ring-panel">
                    <IconTile icon={st.icon} tone={st.tone} />
                  </span>
                  <div
                    className={cn(
                      'min-w-0 flex-1 rounded-xl border p-3.5',
                      l.txId === highlight ? 'border-accent bg-accent/[0.06] ring-1 ring-accent' : bad ? 'border-bad/25 bg-bad/[0.04]' : 'border-line',
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <p className={cn('text-[14px] font-semibold', st.text)}>{ACTION_LABEL[l.action] ?? l.action}</p>
                      <time className="font-mono text-[12px] text-faint" dateTime={l.timestamp}>
                        {clock(l.timestamp)} WIB
                      </time>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">{l.actor.slice(0, 2).toUpperCase()}</span>
                      <span className="font-medium">{l.actor}</span>
                      <span className="text-muted">
                        {l.jabatan || '-'} · {l.actorOrg}
                      </span>
                    </p>
                    {l.detail && <p className="mt-1.5 text-[13px] break-words text-muted">{l.detail}</p>}
                    <p className="mt-2 inline-block rounded-md bg-panel-2 px-2 py-0.5 font-mono text-[11.5px] text-faint" title={l.txId}>
                      tx {l.txId.slice(0, 20)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
