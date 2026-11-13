// Ambil still dari adegan untuk pemeriksaan: node tools/still.mjs s01 1.5 4 9 [--out dir] [--sheet]
// --sheet: gabungkan ke satu lembar (via Python/Pillow) dengan lebar thumbnail 480.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch } from './cdp.mjs';

const args = process.argv.slice(2);
const scene = args.shift();
let out = '/private/tmp/claude-501/-Users-Luthfi-Project-PT--Teknalogi-Transformasi-Digital-sandi-chain/7887a2ef-d04f-46f3-a01f-22cb4bc00352/scratchpad/stills';
const oi = args.indexOf('--out'); if (oi >= 0) { out = args[oi + 1]; args.splice(oi, 2); }
const sheet = args.includes('--sheet'); const times = args.filter((a) => a !== '--sheet').map(Number);
fs.mkdirSync(out, { recursive: true });
const c = await launch();
await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const loaded = c.once('Page.loadEventFired');
await c.send('Page.navigate', { url: `http://127.0.0.1:8765/scenes/${scene}.html?render` });
await loaded;
for (let i = 0; i < 200 && !(await c.evaluate('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 50));
const dur = await c.evaluate('window.__duration');
const files = [];
for (const t of times.length ? times : [0]) {
  await c.evaluate(`window.seek(${t})`);
  await c.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  const f = `${out}/${scene}_${t.toFixed(2)}.png`;
  fs.writeFileSync(f, Buffer.from(r.data, 'base64')); files.push(f);
}
const errs = await c.evaluate('window.__errs || []');
c.close();
console.log(scene, 'durasi', dur, files.length, 'still', errs.length ? errs : '');
if (sheet) {
  const py = `import sys\nfrom PIL import Image, ImageDraw\nfs=sys.argv[2:]\nW=640;H=360;cols=3\nrows=(len(fs)+cols-1)//cols\nS=Image.new('RGB',(cols*W,rows*(H+28)),'#222')\nd=ImageDraw.Draw(S)\nfor i,f in enumerate(fs):\n  im=Image.open(f).convert('RGB').resize((W,H));x=(i%cols)*W;y=(i//cols)*(H+28);S.paste(im,(x,y+28));d.text((x+8,y+6),f.split('_')[-1],fill='#fff')\nS.save(sys.argv[1])`;
  execFileSync('python3', ['-c', py, `${out}/${scene}_sheet.png`, ...files]);
  console.log(`${out}/${scene}_sheet.png`);
}
