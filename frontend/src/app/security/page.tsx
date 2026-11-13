'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, DatabaseZap, Eye, FileWarning, Info, Radar, ScanSearch, ShieldX, Siren, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth';
import { AuditList, Empty, IconTile, Notice, PageHead, Panel, StatCard, StatGroup } from '@/components/kit';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActorRisk, Alert, api, AuditLog, fmtDate, post, RiskLevel, RiskReport } from '@/lib/api';
import { cn } from '@/lib/utils';

const TYPE: Record<string, { label: string; icon: LucideIcon }> = {
  UnauthorizedAccess: { label: 'Akses tidak sah', icon: ShieldX },
  DocumentTampered: { label: 'Dokumen palsu / diubah', icon: FileWarning },
  StorageIntegrity: { label: 'Storage dimanipulasi', icon: DatabaseZap },
  SuspiciousBehavior: { label: 'Perilaku mencurigakan', icon: Radar },
};

const LEVEL: Record<RiskLevel, { label: string; bar: string; badge: string }> = {
  rendah: { label: 'Rendah', bar: 'bg-ok', badge: 'bg-ok/10 text-ok' },
  sedang: { label: 'Sedang', bar: 'bg-warn', badge: 'bg-warn/10 text-warn' },
  tinggi: { label: 'Tinggi', bar: 'bg-k-rahasia', badge: 'bg-k-rahasia/12 text-k-rahasia' },
  kritis: { label: 'Kritis', bar: 'bg-bad', badge: 'bg-bad/10 text-bad' },
};

const RULES = (start: number, end: number): [string, string][] => [
  ['Penolakan beruntun', '3 akses ditolak atau lebih dalam 10 menit (+30, tiap tambahan +5, maks 40)'],
  ['Menyisir banyak dokumen', '3 dokumen berbeda atau lebih ditolak (+25)'],
  ['Membuka dokumen massal', '5 dokumen berbeda atau lebih dibuka dalam 15 menit (+30)'],
  ['Membuka dokumen berulang', 'satu dokumen dibuka 4× atau lebih dalam 10 menit (+15)'],
  ['Di luar jam dinas', `akses di luar ${String(start).padStart(2, '0')}.00–${String(end).padStart(2, '0')}.00 WIB (+8 per akses, maks 24)`],
  ['Salinan tidak cocok', 'verifikasi salinan tidak cocok: 1× (+10), 2× atau lebih (+25)'],
  ['Penolakan berulang', '5 akses ditolak atau lebih dalam 24 jam (+15)'],
];

const STEP = 50;

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
  const [error, setError] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [alertLimit, setAlertLimit] = useState(STEP);
  const [logLimit, setLogLimit] = useState(STEP);
  const [risk, setRisk] = useState<RiskReport | null>(null);
  const [tab, setTab] = useState('alert');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'risiko') setTab('risiko');
  }, []);

  const allowed = user?.role === 'auditor' || user?.role === 'admin';

  useEffect(() => {
    if (!allowed) return;
    api<Alert[]>('/alerts').then(setAlerts).catch((e) => setError(e.message));
    api<AuditLog[]>('/audit').then(setLogs).catch((e) => setError(e.message));
    api<RiskReport>('/forensics/risk').then(setRisk).catch(() => undefined);

    const es = new EventSource('/api/alerts/stream');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('alert', (ev) => {
      const a = JSON.parse((ev as MessageEvent).data) as Alert;
      setAlerts((prev) => [a, ...prev.filter((p) => p.id !== a.id)]);
      setFresh((prev) => new Set(prev).add(a.id));
      toast.error(TYPE[a.type]?.label ?? a.type, {
        id: `alert-${a.id}`,
        duration: 8000,
        description: (
          <>
            {a.actor} ({a.org}) pada <span className="font-mono">{a.doc_id}</span>
            <br />
            {a.reason}
          </>
        ),
      });
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
    try {
      await post(`/alerts/${id}/ack`);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
    } catch (e) {
      toast.error('Gagal menandai alert', { description: (e as Error).message });
    }
  }

  if (!allowed)
    return (
      <Panel>
        <Empty icon={ShieldX}>Halaman ini khusus unit pengamanan (role auditor).</Empty>
      </Panel>
    );

  const listed = openOnly ? alerts.filter((a) => !a.acknowledged) : alerts;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <>
      <PageHead
        title="Pusat pengamanan"
        actions={
          <span
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold',
              live ? 'bg-ok/10 text-ok' : 'bg-panel-2 text-muted',
            )}
            role="status"
          >
            <span className={cn('size-2 rounded-full bg-current', live && 'live-dot')} aria-hidden />
            {live ? 'Terhubung · real time' : 'Terputus'}
          </span>
        }
      >
        Alert dikirim chaincode lewat event blockchain dan masuk ke sini secara real time.
      </PageHead>

      {error && (
        <Notice tone="bad" className="mb-5">
          {error}
        </Notice>
      )}

      <StatGroup title="Ringkasan" className="mb-6">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Alert terbuka" value={pad(stats.open)} note="perlu ditindaklanjuti" icon={Siren} tone="bg-bad/10 text-bad" />
          <StatCard label="Akses ditolak" value={pad(stats.denied)} note="tercatat di ledger" icon={ShieldX} tone="bg-warn/10 text-warn" />
          <StatCard label="Dokumen dibuka" value={pad(stats.granted)} note="akses berhasil" icon={Eye} tone="bg-ok/10 text-ok" />
          <StatCard label="Personel berisiko" value={risk ? pad(risk.actors.filter((a) => a.level === 'tinggi' || a.level === 'kritis').length) : '–'} note="tingkat tinggi atau kritis" icon={Radar} tone="bg-k-rahasia/12 text-k-rahasia" />
        </div>
      </StatGroup>

      <Panel className="overflow-hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pr-4">
            <TabsList className="border-b-0">
              <TabsTrigger value="alert">
                Alert <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">{alerts.length}</span>
              </TabsTrigger>
              <TabsTrigger value="risiko">
                Risiko personel
                {risk && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">{risk.actors.filter((a) => a.score > 0).length}</span>}
              </TabsTrigger>
              <TabsTrigger value="audit">
                Seluruh jejak akses
                {logs && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">{logs.length}</span>}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="alert">
            <div className="flex items-center gap-1 border-b border-line px-5 py-2.5" role="group" aria-label="Saring alert">
              {[
                [false, 'Semua'],
                [true, 'Belum ditindaklanjuti'],
              ].map(([v, l]) => (
                <button
                  key={String(v)}
                  aria-pressed={openOnly === v}
                  onClick={() => setOpenOnly(v as boolean)}
                  className={cn(
                    'h-8 rounded-lg px-3 text-[13px] font-medium transition-colors',
                    openOnly === v ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-panel-2 hover:text-ink',
                  )}
                >
                  {l as string}
                </button>
              ))}
            </div>

            {listed.length === 0 ? (
              <Empty icon={Check}>{alerts.length === 0 ? 'Belum ada alert.' : 'Semua alert sudah ditindaklanjuti.'}</Empty>
            ) : (
              <ol className="divide-y divide-line">
                {listed.slice(0, alertLimit).map((a) => {
                  const t = TYPE[a.type] ?? { label: a.type, icon: Siren };
                  return (
                    <li key={a.id} className={cn('flex flex-wrap items-start gap-3.5 px-5 py-4 sm:flex-nowrap', fresh.has(a.id) && 'row-new')}>
                      <IconTile icon={t.icon} tone={a.acknowledged ? 'bg-panel-2 text-muted' : 'bg-bad/10 text-bad'} />
                      <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-54px)]">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className={cn('text-[14px] font-semibold', a.acknowledged ? 'text-ink' : 'text-bad')}>{t.label}</span>
                          {a.acknowledged ? (
                            <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11.5px] font-semibold text-ok">Selesai</span>
                          ) : (
                            <span className="rounded-full bg-bad/10 px-2 py-0.5 text-[11.5px] font-semibold text-bad">Terbuka</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[13.5px]">
                          <span className="font-medium">{a.actor}</span>
                          <span className="text-muted"> · {a.org}</span>
                        </p>
                        <p className="mt-0.5 text-[13px] break-words text-muted">{a.reason}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-faint">
                          {a.doc_id ? (
                            <Link href={`/documents/${a.doc_id}`} className="rounded-md bg-panel-2 px-1.5 py-0.5 text-muted hover:text-ink">
                              {a.doc_id}
                            </Link>
                          ) : (
                            <Link href="/security?tab=risiko" className="rounded-md bg-panel-2 px-1.5 py-0.5 text-muted hover:text-ink">
                              tab Risiko personel
                            </Link>
                          )}
                          <span>{a.channel}</span>
                          <span className="font-sans">{fmtDate(a.created_at)}</span>
                        </div>
                      </div>
                      {!a.acknowledged && (
                        <Button size="sm" className="h-9 rounded-xl px-3.5 max-sm:ml-[54px]" onClick={() => ack(a.id)}>
                          <Check /> Tindak lanjut
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <More shown={alertLimit} total={listed.length} onMore={() => setAlertLimit((n) => n + STEP)} />
          </TabsContent>

          <TabsContent value="risiko">
            <RiskPanel risk={risk} />
          </TabsContent>

          <TabsContent value="audit">
            {!logs ? <Empty>Membaca ledger…</Empty> : <AuditList logs={logs.slice(0, logLimit)} showDoc />}
            <More shown={logLimit} total={logs?.length ?? 0} onMore={() => setLogLimit((n) => n + STEP)} />
          </TabsContent>
        </Tabs>
      </Panel>
    </>
  );
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (total <= shown) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
      <span>
        {shown} dari {total}
      </span>
      <Button variant="ghost" size="sm" className="rounded-lg" onClick={onMore}>
        Tampilkan lebih banyak
      </Button>
    </div>
  );
}

function RiskPanel({ risk }: { risk: RiskReport | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!risk) return <Empty>Menghitung skor dari jejak ledger…</Empty>;

  const rows = risk.actors.filter((a) => a.score > 0);
  const clean = risk.actors.length - rows.length;
  const o = risk.options ?? { workStartHour: 6, workEndHour: 18 };

  return (
    <>
      <p className="flex items-start gap-2 border-b border-line bg-panel-2/50 px-5 py-2.5 text-[12.5px] text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Skor 0–100 dihitung dari aturan yang bisa dijelaskan atas jejak ledger (bukan kotak hitam). Alert otomatis muncul mulai tingkat <b className="text-ink">{risk.alertFrom}</b>. Dihitung {fmtDate(risk.generatedAt)}.
        </span>
      </p>

      {rows.length === 0 ? (
        <Empty icon={Check}>Tidak ada perilaku mencurigakan terdeteksi{clean ? ` (${clean} personel dipantau)` : ''}.</Empty>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((a) => (
            <RiskRow key={a.actor} a={a} open={open === a.actor} onToggle={() => setOpen(open === a.actor ? null : a.actor)} />
          ))}
        </ol>
      )}

      <details className="group border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-[13.5px] font-medium hover:bg-panel-2/50">
          Cara skor dihitung
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <ul className="divide-y divide-line border-t border-line text-[13px]">
          {RULES(o.workStartHour, o.workEndHour).map(([t, d]) => (
            <li key={t} className="grid gap-x-4 px-5 py-2.5 sm:grid-cols-[200px_minmax(0,1fr)]">
              <span className="font-medium">{t}</span>
              <span className="text-muted">{d}</span>
            </li>
          ))}
          <li className="px-5 py-2.5 text-muted">Tingkat: rendah &lt; 25, sedang 25–49, tinggi 50–74, kritis ≥ 75.</li>
        </ul>
      </details>
    </>
  );
}

function RiskRow({ a, open, onToggle }: { a: ActorRisk; open: boolean; onToggle: () => void }) {
  const lv = LEVEL[a.level];
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-panel-2/50 sm:flex-nowrap">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-[12px] font-bold text-accent">{a.actor.slice(0, 2).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">{a.actor}</span>
          <span className="block truncate text-[12.5px] text-muted">
            {a.jabatan || '-'} · {a.actorOrg} · {a.events} aktivitas
          </span>
        </span>
        <span className="flex w-full shrink-0 items-center gap-3 sm:w-[260px]">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2" role="meter" aria-valuenow={a.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Skor risiko ${a.actor}`}>
            <span className={cn('block h-full rounded-full', lv.bar)} style={{ width: `${a.score}%` }} />
          </span>
          <span className="w-8 text-right text-[15px] font-bold tabular-nums">{a.score}</span>
          <span className={cn('w-[68px] rounded-full py-1 text-center text-[12px] font-semibold', lv.badge)}>{lv.label}</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-line bg-panel-2/40 px-5 py-4 sm:pl-[76px]">
          <ul className="grid gap-3">
            {a.signals.map((s) => (
              <li key={s.rule} className="rounded-xl border border-line bg-panel p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[14px] font-semibold">{s.label}</p>
                  <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[12px] font-semibold tabular-nums">+{s.points}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">{s.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11.5px] text-faint">Bukti:</span>
                  {s.evidence.map((tx) => (
                    <Link
                      key={tx}
                      href={`/forensics?txId=${tx}`}
                      title="Telusuri entri ini"
                      className="inline-flex items-center gap-1 rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[11.5px] text-muted hover:bg-accent/10 hover:text-accent"
                    >
                      <ScanSearch className="size-3" />
                      {tx.slice(0, 10)}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
