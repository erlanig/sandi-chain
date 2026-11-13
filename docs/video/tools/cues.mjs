// Kumpulkan cue efek suara dari tiap adegan (window.__cues), tulis out/audio/cues.json dengan waktu absolut.
import fs from 'node:fs';
import { launch } from './cdp.mjs';
const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
const tl = JSON.parse(fs.readFileSync(ROOT + 'timeline.json', 'utf8'));
const c = await launch();
const all = [];
for (const s of tl.scenes) {
  const id = 's' + String(s.scene).padStart(2, '0');
  const loaded = c.once('Page.loadEventFired');
  await c.send('Page.navigate', { url: `http://127.0.0.1:8765/scenes/${id}.html?render` });
  await loaded;
  for (let i = 0; i < 300 && !(await c.evaluate('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 50));
  const cues = await c.evaluate('window.__cues');
  for (const q of cues) if (q.t >= 0 && q.t <= s.duration) all.push({ scene: s.scene, type: q.type, t: +(s.start + q.t).toFixed(3) });
}
c.close();
fs.writeFileSync(ROOT + 'out/audio/cues.json', JSON.stringify(all, null, 1));
console.log(all.length, 'cue');
