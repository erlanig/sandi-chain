import type { AuditLog } from '../documents/documents.service';

/**
 * Deteksi perilaku mencurigakan (insider threat) di atas jejak audit ledger.
 *
 * Murni dan deterministik: tanpa AI, tanpa state. Setiap aturan bisa dijelaskan dalam
 * satu kalimat dan menyebut txId buktinya, jadi hasilnya dapat diperiksa ulang di ledger.
 * Skor = jumlah poin aturan yang terpicu (maks 100).
 */

export type RiskLevel = 'rendah' | 'sedang' | 'tinggi' | 'kritis';

export interface Signal {
  rule: string;
  label: string;
  points: number;
  /** Jumlah kejadian yang memicu aturan ini. */
  count: number;
  detail: string;
  /** txId bukti (paling banyak 8, yang terbaru). */
  evidence: string[];
  /** Waktu bukti terakhir. */
  at: string;
}

export interface ActorRisk {
  actor: string;
  actorOrg: string;
  jabatan: string;
  score: number;
  level: RiskLevel;
  signals: Signal[];
  events: number;
  lastActivity: string;
}

export interface BehaviorOptions {
  /** Jam dinas WIB: [mulai, selesai). Di luar itu dihitung di luar jam dinas. */
  workStartHour: number;
  workEndHour: number;
}

export const DEFAULTS: BehaviorOptions = { workStartHour: 6, workEndHour: 18 };

const MIN = 60_000;
const ts = (l: AuditLog) => Date.parse(l.timestamp);
const hourWib = (ms: number) => (new Date(ms).getUTCHours() + 7) % 24;
const last = (ls: AuditLog[]) => ls[ls.length - 1];
const evidence = (ls: AuditLog[]) => ls.slice(-8).map((l) => l.txId);

/** Jendela geser: kelompok paling padat (menurut `score`) yang muat dalam `windowMs`. Input terurut naik. */
function densest(items: AuditLog[], windowMs: number, score: (g: AuditLog[]) => number): AuditLog[] {
  let best: AuditLog[] = [];
  let bestScore = 0;
  let lo = 0;
  for (let hi = 0; hi < items.length; hi++) {
    while (ts(items[hi]) - ts(items[lo]) > windowMs) lo++;
    const group = items.slice(lo, hi + 1);
    const s = score(group);
    if (s > bestScore) {
      best = group;
      bestScore = s;
    }
  }
  return best;
}

const distinctDocs = (g: AuditLog[]) => new Set(g.map((l) => l.docId)).size;

type Rule = (ev: AuditLog[], o: BehaviorOptions) => Signal | undefined;

const signal = (rule: string, label: string, points: number, group: AuditLog[], detail: string): Signal => ({
  rule,
  label,
  points,
  count: group.length,
  detail,
  evidence: evidence(group),
  at: last(group).timestamp,
});

const RULES: Rule[] = [
  // 1. Penolakan beruntun dalam waktu singkat: mencoba-coba akses.
  (ev) => {
    const g = densest(ev.filter((l) => l.action === 'ACCESS_DENIED'), 10 * MIN, (x) => x.length);
    if (g.length < 3) return;
    return signal('DENIED_BURST', 'Penolakan beruntun', Math.min(40, 30 + 5 * (g.length - 3)), g, `${g.length} akses ditolak dalam 10 menit`);
  },
  // 2. Menyisir banyak dokumen yang bukan haknya: pengintaian.
  (ev) => {
    const g = ev.filter((l) => l.action === 'ACCESS_DENIED');
    const n = distinctDocs(g);
    if (n < 3) return;
    return signal('DOC_PROBING', 'Menyisir banyak dokumen', 25, g, `${n} dokumen berbeda ditolak`);
  },
  // 3. Membuka banyak dokumen berbeda sekaligus: pengumpulan data massal.
  (ev) => {
    const g = densest(ev.filter((l) => l.action === 'ACCESS_GRANTED'), 15 * MIN, distinctDocs);
    const n = distinctDocs(g);
    if (n < 5) return;
    return signal('MASS_ACCESS', 'Membuka dokumen massal', 30, g, `${n} dokumen berbeda dibuka dalam 15 menit`);
  },
  // 4. Membuka dokumen yang sama berulang kali: kemungkinan menyalin lewat foto layar.
  (ev) => {
    const perDoc = new Map<string, AuditLog[]>();
    for (const l of ev) if (l.action === 'ACCESS_GRANTED') perDoc.set(l.docId, [...(perDoc.get(l.docId) ?? []), l]);
    let best: AuditLog[] = [];
    for (const ls of perDoc.values()) {
      const g = densest(ls, 10 * MIN, (x) => x.length);
      if (g.length > best.length) best = g;
    }
    if (best.length < 4) return;
    return signal('REOPEN_LOOP', 'Membuka dokumen berulang', 15, best, `satu dokumen dibuka ${best.length}× dalam 10 menit`);
  },
  // 5. Aktivitas di luar jam dinas.
  (ev, o) => {
    const g = ev.filter((l) => {
      if (l.action !== 'ACCESS_GRANTED' && l.action !== 'ACCESS_DENIED') return false;
      const h = hourWib(ts(l));
      return h < o.workStartHour || h >= o.workEndHour;
    });
    if (!g.length) return;
    return signal('OFF_HOURS', 'Di luar jam dinas', Math.min(24, 8 * g.length), g, `${g.length} akses di luar ${pad(o.workStartHour)}.00–${pad(o.workEndHour)}.00 WIB`);
  },
  // 6. Verifikasi salinan yang tidak cocok: membawa atau menguji salinan palsu.
  (ev) => {
    const g = ev.filter((l) => l.action === 'VERIFY_TAMPERED');
    if (!g.length) return;
    return signal('TAMPER_VERIFY', 'Salinan tidak cocok', g.length >= 2 ? 25 : 10, g, `${g.length} verifikasi salinan tidak cocok`);
  },
  // 7. Penolakan berulang sepanjang hari.
  (ev) => {
    const g = densest(ev.filter((l) => l.action === 'ACCESS_DENIED'), 24 * 60 * MIN, (x) => x.length);
    if (g.length < 5) return;
    return signal('DENIED_REPEAT', 'Penolakan berulang', 15, g, `${g.length} akses ditolak dalam 24 jam`);
  },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function levelOf(score: number): RiskLevel {
  if (score >= 75) return 'kritis';
  if (score >= 50) return 'tinggi';
  if (score >= 25) return 'sedang';
  return 'rendah';
}

export const LEVEL_ORDER: RiskLevel[] = ['rendah', 'sedang', 'tinggi', 'kritis'];

/** Hitung skor risiko tiap pelaku dari jejak audit. Urut dari paling berisiko. */
export function analyzeBehavior(logs: AuditLog[], opts: Partial<BehaviorOptions> = {}): ActorRisk[] {
  const o = { ...DEFAULTS, ...opts };
  const byActor = new Map<string, AuditLog[]>();
  for (const l of logs) {
    if (!l.actor || Number.isNaN(ts(l))) continue;
    byActor.set(l.actor, [...(byActor.get(l.actor) ?? []), l]);
  }

  const out: ActorRisk[] = [];
  for (const [actor, ls] of byActor) {
    const ev = [...ls].sort((a, b) => ts(a) - ts(b));
    const signals = RULES.map((r) => r(ev, o)).filter((s): s is Signal => !!s);
    const score = Math.min(100, signals.reduce((n, s) => n + s.points, 0));
    const lastLog = last(ev);
    out.push({
      actor,
      actorOrg: lastLog.actorOrg,
      jabatan: lastLog.jabatan,
      score,
      level: levelOf(score),
      signals: signals.sort((a, b) => b.points - a.points),
      events: ev.length,
      lastActivity: lastLog.timestamp,
    });
  }
  return out.sort((a, b) => b.score - a.score || b.lastActivity.localeCompare(a.lastActivity));
}

/**
 * Alert untuk pelaku berisiko tinggi. txId dibuat deterministik (pelaku + tingkat + aturan + hari)
 * sehingga pemindaian berulang tidak membanjiri alert yang sama.
 */
export function riskAlert(r: ActorRisk) {
  const rules = r.signals.map((s) => s.rule).sort().join('+');
  return {
    docId: '',
    actor: r.actor,
    org: r.actorOrg,
    txId: `risk:${r.actor}:${r.level}:${rules}:${r.lastActivity.slice(0, 10)}`,
    reason: `Skor risiko ${r.score} (${r.level}): ${r.signals.map((s) => `${s.label} — ${s.detail}`).join('; ')}`,
  };
}
