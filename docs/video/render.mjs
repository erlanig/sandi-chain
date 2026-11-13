// Render film: node render.mjs [s04 s06 ...] [--force]
// Prasyarat: `python3 -m http.server 8765 --bind 127.0.0.1` dari docs/video, out/audio/mix.wav sudah dibuat (tools/mix.py).
// Tiap adegan dibagi ke 4 instance Chrome (CDP lewat pipe), PNG dialirkan ke ffmpeg, lalu potongan disambung.
// Bingkai global: adegan n memuat bingkai round(start*30) .. round(end*30)-1, waktu lokal = f/30 - start.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { launch } from './tools/cdp.mjs';

const ROOT = decodeURIComponent(new URL('.', import.meta.url).pathname);
const OUT = ROOT + 'out/';
const FPS = 30, WORKERS = 4;
const tl = JSON.parse(fs.readFileSync(ROOT + 'timeline.json', 'utf8'));
const args = process.argv.slice(2), force = args.includes('--force');
const only = args.filter((a) => /^s\d\d$/.test(a));
fs.mkdirSync(OUT + 'scenes', { recursive: true });

const shared = ['film/lib.js', 'film/film.css', 'film/fonts.css', 'timeline.json', 'facts.json', 'assets/ui/rects.json'].map((f) => fs.readFileSync(ROOT + f)).join('');
const sceneHash = (id) => crypto.createHash('sha256').update(shared + fs.readFileSync(`${ROOT}scenes/${id}.html`)).digest('hex');

const X264 = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

async function worker(id, from, to, start, file) {
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...X264, '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, no) => ff.on('close', (c) => (c === 0 ? ok() : no(new Error('ffmpeg ' + c)))));
  const c = await launch();
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const loaded = c.once('Page.loadEventFired');
  await c.send('Page.navigate', { url: `http://127.0.0.1:8765/scenes/${id}.html?render` });
  await loaded;
  for (let i = 0; i < 400 && !(await c.evaluate('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 50));
  for (let f = from; f < to; f++) {
    const t = f / FPS - start;
    await c.evaluate(`window.seek(${t.toFixed(6)})`);
    const r = await c.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    const buf = Buffer.from(r.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once('drain', ok));
  }
  ff.stdin.end();
  c.close();
  await done;
}

for (const s of tl.scenes) {
  const id = 's' + String(s.scene).padStart(2, '0');
  if (only.length && !only.includes(id)) continue;
  const h = sceneHash(id), hf = `${OUT}scenes/${id}.hash`, mp4 = `${OUT}scenes/${id}.mp4`;
  if (!force && fs.existsSync(mp4) && fs.existsSync(hf) && fs.readFileSync(hf, 'utf8') === h) { console.log(id, 'tidak berubah, dilewati'); continue; }
  const f0 = Math.round(s.start * FPS), f1 = Math.round(s.end * FPS);
  const per = Math.ceil((f1 - f0) / WORKERS);
  const t0 = Date.now();
  console.log(id, 'mulai', f1 - f0, 'bingkai');
  const parts = [];
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => {
    const a = f0 + w * per, b = Math.min(f1, a + per);
    if (a >= b) return null;
    const file = `${OUT}scenes/${id}_part${w}.mp4`; parts.push([w, file]);
    return worker(id, a, b, s.start, file);
  }));
  parts.sort((a, b) => a[0] - b[0]);
  fs.writeFileSync(`${OUT}scenes/${id}_list.txt`, parts.map(([, f]) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${OUT}scenes/${id}_list.txt`, '-c', 'copy', mp4]);
  parts.forEach(([, f]) => fs.unlinkSync(f));
  fs.writeFileSync(hf, h);
  console.log(id, f1 - f0, 'bingkai', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
}

// sambung adegan + audio
const list = tl.scenes.map((s) => `file '${(OUT + 'scenes/s' + String(s.scene).padStart(2, '0') + '.mp4').replace(/'/g, "'\\''")}'`).join('\n');
fs.writeFileSync(OUT + 'scenes/all.txt', list);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', OUT + 'scenes/all.txt', '-i', OUT + 'audio/mix.wav',
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart',
  OUT + 'pasukan-bima-sandi-chain.mp4']);
console.log('selesai:', OUT + 'pasukan-bima-sandi-chain.mp4');
