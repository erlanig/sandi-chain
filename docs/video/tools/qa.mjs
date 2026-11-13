// QA: (1) determinisme: 5 bingkai acak per adegan dirender dua kali (urutan berbeda), hash PNG dibandingkan.
//     (2) tata letak: tiap 0,5 detik, kotak teks yang terlihat dicek terhadap margin aman dan tumpukan antar teks.
// Pakai: node tools/qa.mjs  -> out/qa/qa.json
import fs from 'node:fs';
import crypto from 'node:crypto';
import { launch } from './cdp.mjs';
const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
const tl = JSON.parse(fs.readFileSync(ROOT + 'timeline.json', 'utf8'));
fs.mkdirSync(ROOT + 'out/qa', { recursive: true });
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const report = { determinism: [], layout: [] };

const LAYOUT = `(() => {
  const st = document.getElementById('stage'); const out = [];
  const vis = (e) => { for (let n = e; n && n !== st; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.5) return false; } return true; };
  const walker = document.createTreeWalker(st, NodeFilter.SHOW_TEXT);
  const boxes = [];
  for (let n; (n = walker.nextNode()); ) {
    if (!n.textContent.trim()) continue;
    const e = n.parentElement; if (!vis(e) || e.closest('.shot')) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) { if (b.width < 2) continue; boxes.push({ text: n.textContent.trim().slice(0, 40), x0: b.left, y0: b.top, x1: b.right, y1: b.bottom, sub: !!e.closest('#sub'), fs: parseFloat(getComputedStyle(e).fontSize), el: e }); }
  }
  for (const b of boxes) {
    const m = b.sub ? { x0: 120, y0: 80, x1: 1800, y1: 1040 } : { x0: 118, y0: 78, x1: 1802, y1: 1002 };
    if (b.x0 < m.x0 || b.x1 > m.x1 || b.y0 < m.y0 || b.y1 > m.y1) out.push({ kind: 'margin', text: b.text, box: [b.x0, b.y0, b.x1, b.y1].map(Math.round) });
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; if (a.el === b.el) continue;
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 3 && oy > 3) out.push({ kind: 'overlap', a: a.text, b: b.text });
  }
  return out;
})()`;

const ONLY = process.argv.slice(2);
for (const s of tl.scenes) {
  const id = 's' + String(s.scene).padStart(2, '0');
  if (ONLY.length && !ONLY.includes(id)) continue;
  const c = await launch();
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const loaded = c.once('Page.loadEventFired');
  await c.send('Page.navigate', { url: `http://127.0.0.1:8765/scenes/${id}.html?render` });
  await loaded;
  for (let i = 0; i < 400 && !(await c.evaluate('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 50));
  const pngs = {};
  const shot = async (t) => {
    await c.evaluate(`window.seek(${t})`);
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    const b = Buffer.from(r.data, 'base64'); const h = crypto.createHash('sha256').update(b).digest('hex');
    if (pngs[t] && pngs[t].h !== h) { fs.writeFileSync(`${ROOT}out/qa/det_${id}_${t}_a.png`, pngs[t].b); fs.writeFileSync(`${ROOT}out/qa/det_${id}_${t}_b.png`, b); }
    pngs[t] = { h, b };
    return h;
  };
  const ts = Array.from({ length: 5 }, () => +(rnd() * s.duration).toFixed(3));
  const a = []; for (const t of ts) a.push(await shot(t));
  const b = []; for (const t of [...ts].reverse()) b.unshift(await shot(t));
  ts.forEach((t, i) => report.determinism.push({ scene: s.scene, t, same: a[i] === b[i] }));
  const seen = new Set();
  for (let t = 0; t <= s.duration; t += 0.5) {
    await c.evaluate(`window.seek(${t})`);
    for (const p of await c.evaluate(LAYOUT)) {
      const k = JSON.stringify({ ...p, box: undefined });
      if (seen.has(k)) continue; seen.add(k);
      report.layout.push({ scene: s.scene, t, ...p });
    }
  }
  c.close();
  console.log(id, 'det', a.every((x, i) => x === b[i]) ? 'OK' : 'BEDA', 'layout', report.layout.filter((l) => l.scene === s.scene).length);
}
fs.writeFileSync(ROOT + 'out/qa/qa.json', JSON.stringify(report, null, 1));
