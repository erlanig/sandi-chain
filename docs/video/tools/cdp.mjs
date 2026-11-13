// Klien CDP minimal: Node 23 + Chrome headless lewat --remote-debugging-pipe (fd 3/4). Tanpa paket tambahan.
// (Port TCP debug tidak dibuka oleh Chrome di mesin ini, jadi dipakai transport pipe.)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch(_port, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-color-profile=srgb', '--font-render-hinting=none', '--allow-file-access-from-files',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    // rasterisasi deterministik: tanpa GPU, tanpa raster parsial, semua tahap compositor sebelum gambar
    '--disable-gpu', '--disable-partial-raster', '--disable-lcd-text', '--run-all-compositor-stages-before-draw', '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-checker-imaging', '--disable-font-subpixel-positioning',
    ...extra, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const w = proc.stdio[3], r = proc.stdio[4];
  let id = 0, buf = '', session = null;
  const pending = new Map();
  const listeners = [];
  r.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.id && pending.has(m.id)) {
        const { ok, no } = pending.get(m.id); pending.delete(m.id);
        m.error ? no(new Error(m.error.message)) : ok(m.result);
      } else if (m.method) listeners.forEach((l) => l(m));
    }
  });
  const raw = (method, params = {}, sessionId) => new Promise((ok, no) => {
    const i = ++id; pending.set(i, { ok, no });
    w.write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  const { targetInfos } = await raw('Target.getTargets');
  const page = targetInfos.find((t) => t.type === 'page');
  session = (await raw('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
  const send = (method, params = {}) => raw(method, params, session);
  const once = (method) => new Promise((ok) => { const l = (m) => { if (m.method === method) { listeners.splice(listeners.indexOf(l), 1); ok(m.params); } }; listeners.push(l); });
  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  };
  const close = () => { proc.kill('SIGKILL'); setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 500); };
  await send('Page.enable');
  await send('Runtime.enable');
  return { send, once, evaluate, close };
}
