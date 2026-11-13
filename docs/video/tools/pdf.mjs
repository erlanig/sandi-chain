// Cetak HTML lokal ke PDF A4 lewat Chrome (CDP pipe). Pakai: node tools/pdf.mjs <masuk.html> <keluar.pdf>
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';
const [inp, out] = process.argv.slice(2).map((p) => path.resolve(p));
const c = await launch();
const l = c.once('Page.loadEventFired');
await c.send('Page.navigate', { url: 'file://' + inp });
await l;
await c.evaluate('document.fonts.ready.then(() => true)');
const r = await c.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
c.close();
console.log('pdf', out);
