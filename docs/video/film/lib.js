// Pustaka adegan: satu jam (window.seek), easing, teks kata demi kata, subtitel, cue efek suara.
// Tidak ada setTimeout, animasi CSS, atau Math.random di jalur render.
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d));
  const E = {
    lin: (p) => p,
    oc: (p) => 1 - Math.pow(1 - p, 3),
    ioc: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    oq: (p) => 1 - Math.pow(1 - p, 5),
    // pegas kecil: overshoot sekitar 4%, lalu tenang
    spring: (p) => (p >= 1 ? 1 : 1 - Math.exp(-9 * p) * Math.cos(9 * p)),
  };
  const FR = 1 / 30;

  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(tag, attrs, parent) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function css(e, o) { for (const k in o) e.style[k] = o[k]; return e; }

  // pecah teks ke kata bertopeng; kembalikan span dalam
  function words(target, text) {
    target.textContent = '';
    const out = [];
    text.split(/(\s+)/).forEach((w) => {
      if (/^\s+$/.test(w)) { target.appendChild(document.createTextNode(' ')); return; }
      if (!w) return;
      const m = el('span', 'wm', target);
      out.push(el('span', '', m, w.replace(/&/g, '&amp;').replace(/</g, '&lt;')));
    });
    return out;
  }
  function reveal(spans, t, t0, { stagger = 5 * FR, dur = 0.5, dy = 12, out = null } = {}) {
    spans.forEach((s, i) => {
      const k = E.oc(prog(t, t0 + i * stagger, dur));
      let o = k, y = (1 - k) * dy;
      if (out != null) { const q = E.ioc(prog(t, out + i * 2 * FR, 0.4)); o *= 1 - q; y -= q * dy; }
      // keadaan akhir dinormalisasi supaya raster tidak bergantung pada riwayat seek
      s.style.transform = Math.abs(y) < 1e-6 ? 'none' : `translateY(${y}px)`;
      s.style.opacity = o >= 1 ? '' : o;
    });
  }
  function show(e, t, t0, { dur = 0.5, dy = 0, dx = 0, out = null, outDur = 0.4, ease = E.oc, scale = 0 } = {}) {
    let k = ease(prog(t, t0, dur));
    let o = clamp(k * 1.4);
    if (out != null) { const q = E.ioc(prog(t, out, outDur)); o *= 1 - q; }
    e.style.opacity = o >= 1 ? '' : o;
    e.style.transform = k >= 1 ? 'none' : `translate(${(1 - k) * dx}px, ${(1 - k) * dy}px)` + (scale ? ` scale(${lerp(1 - scale, 1, k)})` : '');
    return k;
  }
  // garis SVG ditarik dengan stroke-dashoffset
  function draw(path, t, t0, dur, ease = E.ioc) {
    if (!path.__len) { path.__len = path.getTotalLength(); path.style.strokeDasharray = path.__len + ' ' + path.__len; }
    const k = ease(prog(t, t0, dur));
    path.style.strokeDashoffset = path.__len * (1 - k);
    path.style.opacity = k > 0 ? 1 : 0;
    return k;
  }
  // cap jatuh: skala dari besar, overshoot kecil, bayangan menegang 6 frame
  function stamp(e, t, t0, rot = -4) {
    const k = prog(t, t0, 0.42);
    if (t < t0) { e.style.opacity = 0; return 0; }
    const s = lerp(1.9, 1, E.spring(k));
    const press = prog(t, t0 + 0.28, 6 * FR);
    const sh = press < 1 ? 18 * (1 - press) : 0;
    e.style.opacity = clamp(k * 3);
    e.style.transform = `rotate(${rot}deg) scale(${s})`;
    e.style.filter = `drop-shadow(0 ${sh}px ${sh * 1.4}px rgba(0,0,0,${0.35 * (1 - press)}))`;
    return k;
  }
  // angka berhitung
  function count(e, t, t0, dur, to, pad = 0) {
    const v = Math.round(to * E.oc(prog(t, t0, dur)));
    e.textContent = String(v).padStart(pad, '0');
  }
  // kursor berkedip (deterministik dari t)
  const blink = (t, rate = 1.06) => (Math.floor(t / (rate / 2)) % 2 === 0 ? 1 : 0);

  // ---------- data & subtitel ----------
  const F = { clamp, lerp, prog, E, FR, el, svg, css, words, reveal, show, draw, stamp, count, blink, cues: [] };
  F.cue = (type, t) => F.cues.push({ type, t: +t.toFixed(3) });

  function chunks(text) {
    if (text.length <= 78) return [text];
    // pecah di tanda baca terdekat dari tengah, rekursif
    const mid = text.length / 2;
    let best = -1;
    for (let i = 0; i < text.length; i++) if (/[,.:?]/.test(text[i]) && text[i + 1] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    if (best < 0) { best = text.lastIndexOf(' ', mid); }
    return [...chunks(text.slice(0, best + 1).trim()), ...chunks(text.slice(best + 1).trim())];
  }
  F.subChunks = chunks;

  F.boot = async function (n, build) {
    const q = new URLSearchParams(location.search);
    const render = location.search.includes('render');
    const [tl, facts, rects] = await Promise.all(['../timeline.json', '../facts.json', '../assets/ui/rects.json'].map((u) => fetch(u).then((r) => r.json())));
    const sc = tl.scenes.find((s) => s.scene === n);
    F.scene = sc; F.facts = facts; F.rects = rects; F.render = render;
    F.S = (id) => sc.sentences.find((s) => s.id === id).rel;
    F.Se = (id) => { const s = sc.sentences.find((x) => x.id === id); return s.end - sc.start; };
    const stage = el('div', '', document.body); stage.id = 'stage';
    const sub = el('div', '', stage); sub.id = 'sub';
    // subtitel per potongan, waktunya dibagi menurut jumlah karakter
    const subs = [];
    for (const s of sc.sentences) {
      const cs = chunks(s.text), total = cs.reduce((a, c) => a + c.length, 0);
      let a = s.rel; const d = s.end - s.start;
      cs.forEach((c) => { const len = (d * c.length) / total; subs.push({ a, b: a + len, text: c }); a += len; });
    }
    // subtitel S24a..d digabung bertahap agar terbaca
    F.subs = subs;
    const update = await build(stage, F);
    stage.appendChild(sub);
    const imgs = [...stage.querySelectorAll('img')];
    await Promise.all(imgs.map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((ok) => { i.onload = i.onerror = ok; }))));
    await Promise.all(['700 40px "Barlow Condensed"', '400 40px "Plus Jakarta Sans"', '500 40px "Plus Jakarta Sans"', '600 40px "Plus Jakarta Sans"', '700 40px "Plus Jakarta Sans"', '400 40px "IBM Plex Mono"', '500 40px "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    let lastSub = null;
    window.__duration = sc.duration;
    window.__cues = F.cues;
    window.seek = (t) => {
      t = Math.max(0, Math.min(sc.duration, t));
      update(t);
      const cur = subs.find((s) => t >= s.a - 0.04 && t < s.b + 0.25);
      const txt = cur ? cur.text : '';
      if (txt !== lastSub) {
        sub.textContent = txt; lastSub = txt; sub.style.width = '';
        if (txt) { // pelat selebar teks: ukur baris hasil wrap
          const r = document.createRange(); r.selectNodeContents(sub);
          const w = Math.max(...[...r.getClientRects()].map((b) => b.width));
          sub.style.width = Math.ceil(w) + 48 + 'px';
        }
      }
      return true;
    };
    window.seek(q.has('t') ? +q.get('t') : 0);
    window.__ready = true;
    if (!render) {
      const fit = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); stage.style.transform = `scale(${s})`; };
      fit(); addEventListener('resize', fit);
      const t0 = performance.now() - (q.has('t') ? +q.get('t') * 1000 : 0);
      const loop = () => { window.seek(((performance.now() - t0) / 1000) % sc.duration); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  };
  window.F = F;
})();
