export type Klasifikasi = 'BIASA' | 'TERBATAS' | 'RAHASIA' | 'SANGAT_RAHASIA';

export const KLASIFIKASI: Klasifikasi[] = ['BIASA', 'TERBATAS', 'RAHASIA', 'SANGAT_RAHASIA'];

export interface User {
  username: string;
  nama: string;
  nrp: string;
  jabatan: string;
  clearance: Klasifikasi;
  role: 'user' | 'auditor' | 'admin';
  mspId: string;
}

export interface Doc {
  docId: string;
  nomor: string;
  perihal: string;
  hash: string;
  klasifikasi: Klasifikasi;
  ownerName: string;
  ownerOrg: string;
  version: number;
  history: string[];
  recipients: string[];
  revoked: boolean;
  createdAt: string;
  updatedAt: string;
  channel: string;
}

export interface DocDetail extends Doc {
  isOwner: boolean;
  versions: { version: number; filename: string; mime: string; size: number; sha256: string; created_at: string }[];
}

export interface AuditLog {
  txId: string;
  docId: string;
  action: string;
  actor: string;
  actorOrg: string;
  clearance: string;
  jabatan: string;
  detail: string;
  timestamp: string;
  channel?: string;
}

export interface Alert {
  id: number;
  type: 'UnauthorizedAccess' | 'DocumentTampered' | 'StorageIntegrity' | 'SuspiciousBehavior';
  doc_id: string;
  actor: string;
  org: string;
  reason: string;
  tx_id: string;
  channel: string;
  block: string;
  acknowledged: boolean;
  created_at: string;
}

export interface VerifyResult {
  authentic: boolean;
  matchedVersion: number;
  latestVersion: number;
  message: string;
  hash: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = Array.isArray(j.message) ? j.message.join(', ') : (j.message ?? msg);
    } catch {
      /* bukan JSON */
    }
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.location.href = '/login';
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export function fmtDate(s: string) {
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
}

export function klasLabel(k: string) {
  return k.replace('_', ' ');
}

export function shortHash(h: string, n = 10) {
  return h ? `${h.slice(0, n)}…${h.slice(-6)}` : '-';
}

export const ACTION_LABEL: Record<string, string> = {
  REGISTER: 'Didaftarkan',
  NEW_VERSION: 'Revisi baru',
  ACCESS_GRANTED: 'Dibuka',
  ACCESS_DENIED: 'Akses ditolak',
  VERIFY_OK: 'Verifikasi: asli',
  VERIFY_TAMPERED: 'Verifikasi: tidak cocok',
  DISPOSITION: 'Disposisi',
  REVOKE: 'Dicabut',
};

/* ------------------------------------------------------------------ forensik */

export type RiskLevel = 'rendah' | 'sedang' | 'tinggi' | 'kritis';

export interface RiskSignal {
  rule: string;
  label: string;
  points: number;
  count: number;
  detail: string;
  evidence: string[];
  at: string;
}

export interface ActorRisk {
  actor: string;
  actorOrg: string;
  jabatan: string;
  score: number;
  level: RiskLevel;
  signals: RiskSignal[];
  events: number;
  lastActivity: string;
}

export interface RiskReport {
  generatedAt: string;
  options?: { workStartHour: number; workEndHour: number };
  alertFrom: RiskLevel;
  actors: ActorRisk[];
}

export interface TracePerson {
  username: string;
  nama: string;
  nrp: string;
  jabatan: string;
  clearance: string;
  mspId: string;
}

export interface TraceReader {
  actor: string;
  actorOrg: string;
  jabatan: string;
  opens: number;
  last: string;
}

export interface TraceMatch {
  access: AuditLog;
  isAccessGrant: boolean;
  person: TracePerson | null;
  grantedBy: AuditLog | null;
  custody: AuditLog[];
  suspectActivity: AuditLog[];
  otherReaders: TraceReader[];
}

export interface TraceDoc {
  docId: string;
  nomor: string;
  perihal: string;
  klasifikasi: Klasifikasi;
  channel: string;
  ownerName: string;
  ownerOrg: string;
  revoked: boolean;
  version: number;
}

export interface TraceResult {
  status: 'found' | 'ambiguous' | 'not_found' | 'bad_query';
  message: string;
  matches: TraceMatch[];
  documents: Record<string, TraceDoc>;
  /** Hanya untuk unggahan PDF: jejak yang dibaca dari metadata. */
  source?: 'metadata';
  extracted?: { txId?: string; docId?: string; nrp?: string };
}
