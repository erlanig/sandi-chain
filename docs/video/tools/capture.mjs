// Tangkap UI sungguhan (build produksi, tema gelap, DPR 2) untuk adegan 5 dan 6.
// Prasyarat: mock API di :4010, `next start -p 3200` dengan BACKEND_URL=http://127.0.0.1:4010.
// Pakai: node tools/capture.mjs   -> assets/ui/*.png + assets/ui/rects.json
import fs from 'node:fs';
import { launch } from './cdp.mjs';

const APP = 'http://127.0.0.1:3200';
const OUT = decodeURIComponent(new URL('../assets/ui/', import.meta.url).pathname);
const TX = 'e4bc38b0d391f396';
const rects = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await fetch('http://127.0.0.1:4010/api/__as/auditor.pam');
const c = await launch(9333);
await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });

async function go(url) {
  const loaded = c.once('Page.loadEventFired');
  await c.send('Page.navigate', { url: APP + url });
  await loaded;
}
async function settle(ms = 700) {
  await c.evaluate('document.fonts.ready.then(() => true)');
  await sleep(ms);
}
// matikan transisi/animasi supaya tangkapan bersih, sembunyikan toast
const CALM = `(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important} [data-sonner-toaster]{display:none!important}'; document.head.appendChild(s); return true })()`;
async function shot(name, { full = false } = {}) {
  let clip;
  if (full) {
    const h = await c.evaluate('document.documentElement.scrollHeight');
    clip = { x: 0, y: 0, width: 1920, height: h, scale: 1 };
  }
  const r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  fs.writeFileSync(OUT + name + '.png', Buffer.from(r.data, 'base64'));
  console.log('ok', name);
}
// kotak batas elemen (koordinat CSS 1920x1080, relatif dokumen)
async function rect(key, js) {
  rects[key] = await c.evaluate(`(() => { const el = ${js}; if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
  if (!rects[key]) console.warn('rect kosong', key);
}
const byText = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().includes(${JSON.stringify(txt)}))`;

// sesi dan tema
await go('/login');
await c.evaluate(`localStorage.setItem('sandi.theme','dark'); true`);

// ---------- Pengamanan, tab Risiko ----------
await go('/security?tab=risiko');
await c.evaluate(CALM); await settle(1200);
await shot('risk_list');
await rect('risk_row_budi', byText('button[aria-expanded]', 'serka.budi') + `|| ${byText('button[aria-expanded]', 'Budi')}`);
await rect('risk_row_andi', byText('button[aria-expanded]', 'kapten.andi') + `|| ${byText('button[aria-expanded]', 'Andi')}`);
await c.evaluate(`(${byText('button[aria-expanded]', 'Budi')} || ${byText('button[aria-expanded]', 'serka.budi')}).click(); true`);
await settle(800);
await shot('risk_open');
await rect('risk_open_panel', `(${byText('button[aria-expanded="true"]', '')}).parentElement`);
await rect('risk_chip', `[...document.querySelectorAll('a[href*="/forensics?txId="]')][0]`);
rects.risk_chip_href = await c.evaluate(`document.querySelector('a[href*="/forensics?txId="]')?.getAttribute('href')`);

// ---------- Telusuri ----------
await go('/forensics');
await c.evaluate(CALM); await settle(1000);
await shot('trace_empty');
await rect('trace_input', `document.querySelector('#tx')`);
await rect('trace_button', byText('button', 'Telusuri'));
await c.evaluate(`document.querySelector('#tx').focus(); true`);
for (let i = 1; i <= TX.length; i++) {
  await c.send('Input.insertText', { text: TX[i - 1] });
  await sleep(60);
  await shot('trace_type_' + String(i).padStart(2, '0'));
}
await c.evaluate(`(${byText('button[type="submit"]', 'Telusuri')} || ${byText('button', 'Telusuri')}).click(); true`);
await settle(1500);
await shot('trace_result');
await rect('trace_person', byText('p,h2,h3,span', 'Andi Saputra'));
await rect('trace_grant', byText('p,span,div', 'letkol.arya'));
await shot('trace_full', { full: true });
rects.trace_full_h = await c.evaluate('document.documentElement.scrollHeight');
await rect('trace_timeline_hl', `document.querySelector('[data-highlight="true"]') || document.querySelector('[aria-current="true"]')`);

// ---------- Unggah PDF ----------
await go('/forensics');
await c.evaluate(CALM); await settle(800);
await c.evaluate(`(${byText('button', 'Unggah PDF')}).click(); true`);
await settle(400);
await c.send('DOM.enable');
const { root } = await c.send('DOM.getDocument', { depth: -1 });
const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
await c.send('DOM.setFileInputFiles', { nodeId, files: [OUT + 'leak.pdf'] });
await settle(600);
const clicked = await c.evaluate(`(() => { const b = ${byText('button[type="submit"]', 'Telusuri')} || ${byText('button', 'Telusuri')}; if (b && !b.disabled) { b.click(); return true } return false })()`);
console.log('pdf submit', clicked);
await settle(1800);
await shot('trace_pdf');
await rect('trace_pdf_notice', byText('p', 'Jejak terbaca dari metadata PDF'));

fs.writeFileSync(OUT + 'rects.json', JSON.stringify(rects, null, 1));
c.close();
console.log(rects);
