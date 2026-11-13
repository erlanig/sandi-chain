import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeBehavior, levelOf, riskAlert } from '../src/forensics/behavior';

let n = 0;
/** Jam diberikan dalam WIB (UTC+7) supaya tes mudah dibaca. */
const wib = (hhmm: string, day = '2026-11-10') => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h - 7, m)).toISOString();
};
const log = (actor: string, action: string, at: string, docId = 'DOC-1') => ({
  txId: `tx${String(++n).padStart(4, '0')}`.padEnd(64, '0'),
  docId, action, actor, actorOrg: 'Org2MSP', clearance: 'TERBATAS', jabatan: 'Staf TU', detail: '', timestamp: at,
});
const rule = (r: ReturnType<typeof analyzeBehavior>[number], id: string) => r.signals.find((s) => s.rule === id);

test('perilaku: aktivitas wajar di jam dinas tidak memicu apa pun', () => {
  const r = analyzeBehavior([log('letkol.arya', 'ACCESS_GRANTED', wib('09:00')), log('letkol.arya', 'ACCESS_GRANTED', wib('11:30'), 'DOC-2')]);
  assert.equal(r[0].score, 0);
  assert.equal(r[0].level, 'rendah');
  assert.equal(r[0].signals.length, 0);
});

test('perilaku: tiga penolakan dalam 10 menit = penolakan beruntun, dengan bukti txId', () => {
  const ls = [1, 3, 5].map((m) => log('serka.budi', 'ACCESS_DENIED', wib(`10:0${m}`)));
  const [r] = analyzeBehavior(ls);
  const s = rule(r, 'DENIED_BURST')!;
  assert.ok(s);
  assert.equal(s.count, 3);
  assert.deepEqual(s.evidence, ls.map((l) => l.txId));
  assert.ok(r.score >= 30);
});

test('perilaku: penolakan yang tersebar jauh tidak dianggap beruntun', () => {
  const ls = ['09:00', '10:00', '11:00'].map((t) => log('serka.budi', 'ACCESS_DENIED', wib(t)));
  assert.equal(rule(analyzeBehavior(ls)[0], 'DENIED_BURST'), undefined);
});

test('perilaku: menyisir tiga dokumen berbeda = pengintaian', () => {
  const ls = ['DOC-1', 'DOC-2', 'DOC-3'].map((d, i) => log('serka.budi', 'ACCESS_DENIED', wib(`1${i}:00`), d));
  const s = rule(analyzeBehavior(ls)[0], 'DOC_PROBING')!;
  assert.equal(s.points, 25);
});

test('perilaku: lima dokumen berbeda dibuka dalam 15 menit = pengumpulan massal', () => {
  const ls = [1, 2, 3, 4, 5].map((i) => log('kapten.andi', 'ACCESS_GRANTED', wib(`10:0${i}`), `DOC-${i}`));
  assert.equal(rule(analyzeBehavior(ls)[0], 'MASS_ACCESS')!.count, 5);
  // dokumen yang sama berkali-kali bukan "massal"
  const same = [1, 2, 3, 4, 5].map((i) => log('kapten.andi', 'ACCESS_GRANTED', wib(`10:0${i}`), 'DOC-1'));
  assert.equal(rule(analyzeBehavior(same)[0], 'MASS_ACCESS'), undefined);
});

test('perilaku: satu dokumen dibuka empat kali dalam 10 menit = kemungkinan difoto', () => {
  const ls = [0, 2, 4, 6].map((m) => log('mayor.dewi', 'ACCESS_GRANTED', wib(`10:0${m}`)));
  assert.equal(rule(analyzeBehavior(ls)[0], 'REOPEN_LOOP')!.count, 4);
});

test('perilaku: di luar jam dinas WIB memberi poin, dengan batas atas 24', () => {
  const [one] = analyzeBehavior([log('serka.budi', 'ACCESS_GRANTED', wib('23:10'))]);
  assert.equal(rule(one, 'OFF_HOURS')!.points, 8);
  const many = [1, 2, 3, 4, 5].map((i) => log('serka.budi', 'ACCESS_GRANTED', wib(`2${i}:00`, '2026-11-10').replace('T', 'T'), `DOC-${i}`));
  assert.equal(rule(analyzeBehavior(many)[0], 'OFF_HOURS')!.points, 24);
  // tepat pukul 06.00 WIB masih jam dinas; pukul 18.00 sudah di luar
  assert.equal(rule(analyzeBehavior([log('a', 'ACCESS_GRANTED', wib('06:00'))])[0], 'OFF_HOURS'), undefined);
  assert.ok(rule(analyzeBehavior([log('a', 'ACCESS_GRANTED', wib('18:00'))])[0], 'OFF_HOURS'));
});

test('perilaku: jam dinas bisa diatur', () => {
  const [r] = analyzeBehavior([log('a', 'ACCESS_GRANTED', wib('19:00'))], { workEndHour: 20 });
  assert.equal(rule(r, 'OFF_HOURS'), undefined);
});

test('perilaku: verifikasi salinan tidak cocok, satu = ringan, dua = berat', () => {
  assert.equal(rule(analyzeBehavior([log('kapten.andi', 'VERIFY_TAMPERED', wib('10:00'))])[0], 'TAMPER_VERIFY')!.points, 10);
  const two = [log('kapten.andi', 'VERIFY_TAMPERED', wib('10:00')), log('kapten.andi', 'VERIFY_TAMPERED', wib('10:30'))];
  assert.equal(rule(analyzeBehavior(two)[0], 'TAMPER_VERIFY')!.points, 25);
});

test('perilaku: skor dibatasi 100 dan tingkat mengikuti ambang', () => {
  assert.equal(levelOf(0), 'rendah');
  assert.equal(levelOf(24), 'rendah');
  assert.equal(levelOf(25), 'sedang');
  assert.equal(levelOf(50), 'tinggi');
  assert.equal(levelOf(75), 'kritis');
  const ls = [
    ...[0, 1, 2, 3, 4, 5].map((i) => log('x', 'ACCESS_DENIED', wib(`23:0${i}`), `DOC-${i}`)),
    log('x', 'VERIFY_TAMPERED', wib('23:20')), log('x', 'VERIFY_TAMPERED', wib('23:21')),
  ];
  const [r] = analyzeBehavior(ls);
  assert.equal(r.score, 100);
  assert.equal(r.level, 'kritis');
});

test('perilaku: hasil diurutkan dari paling berisiko; pelaku bersih tetap tercantum', () => {
  const ls = [
    log('bersih', 'ACCESS_GRANTED', wib('09:00')),
    ...[1, 2, 3].map((m) => log('nakal', 'ACCESS_DENIED', wib(`10:0${m}`), `DOC-${m}`)),
  ];
  const out = analyzeBehavior(ls);
  assert.deepEqual(out.map((r) => r.actor), ['nakal', 'bersih']);
});

test('perilaku: entri dengan waktu rusak diabaikan, tidak membuat analisis gagal', () => {
  const out = analyzeBehavior([log('a', 'ACCESS_DENIED', 'bukan-tanggal'), log('a', 'ACCESS_GRANTED', wib('09:00'))]);
  assert.equal(out[0].events, 1);
});

test('perilaku: alert deterministik per pelaku+tingkat+aturan+hari (tidak membanjiri)', () => {
  const ls = [1, 2, 3].map((m) => log('serka.budi', 'ACCESS_DENIED', wib(`10:0${m}`), `DOC-${m}`));
  const a = riskAlert(analyzeBehavior(ls)[0]);
  const b = riskAlert(analyzeBehavior(ls)[0]);
  assert.equal(a.txId, b.txId);
  assert.match(a.reason, /Penolakan beruntun/);
  assert.equal(a.actor, 'serka.budi');
});
