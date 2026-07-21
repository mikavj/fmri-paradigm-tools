/* ======================================================================================
   7. RENDERING AND PLAYBACK
   ====================================================================================== */

const IMG_CACHE = new Map();    /* resolved path -> {img,w,h} or {missing:true} */
const URL_CACHE = new Map();    /* resolved path -> object url, for audio and video */

function assetUrl(model, ref) {
  const entry = resolvePath(model.source.baseDir, ref);
  if (!entry) return null;
  if (!URL_CACHE.has(entry.path)) URL_CACHE.set(entry.path, URL.createObjectURL(entry.file));
  return URL_CACHE.get(entry.path);
}

async function preloadImages(model) {
  const jobs = [];
  const want = new Set();
  for (const set of model.slideSets) for (const sl of set.slides) for (const p of (sl.pictures || [])) want.add(p.value);
  for (const ref of want) {
    const entry = resolvePath(model.source.baseDir, ref);
    if (!entry) { IMG_CACHE.set('ref:' + ref, { missing: true, ref }); continue; }
    if (IMG_CACHE.has(entry.path)) continue;
    jobs.push(new Promise(res => {
      const url = URL.createObjectURL(entry.file);
      const img = new Image();
      img.onload  = () => { IMG_CACHE.set(entry.path, { img, w: img.naturalWidth, h: img.naturalHeight, path: entry.path }); URL.revokeObjectURL(url); res(); };
      img.onerror = () => { IMG_CACHE.set(entry.path, { missing: true, ref, path: entry.path }); URL.revokeObjectURL(url); res(); };
      img.src = url;
    }));
  }
  await Promise.all(jobs);
}
function imgFor(model, ref) {
  const entry = resolvePath(model.source.baseDir, ref);
  if (!entry) return IMG_CACHE.get('ref:' + ref) || { missing: true, ref };
  return IMG_CACHE.get(entry.path) || { missing: true, ref };
}

/* Resolve a position name to a placement in the target screen.

   A position is either a keyword or a pair of numbers. The numeric form is a coordinate in
   the coordinate space the paradigm was authored against, which the file does not record.
   The assumed space is exposed in the interface and reported by validation rather than
   being silently baked in, because guessing it wrongly moves stimuli. */
function resolvePlacement(model, positionName, screenW, screenH) {
  const centre = { x: screenW / 2, y: screenH / 2, assumed: false };
  if (!positionName) return centre;
  const p = model.positions.find(q => q.name === positionName);
  if (!p) return centre;
  const space = model.positionSpace || [800, 600];
  const axis = (raw, screenExtent, spaceExtent, lowWord, highWord) => {
    if (raw == null) return { v: screenExtent / 2, assumed: false };
    const s = String(raw).trim().toLowerCase();
    if (s === 'center' || s === 'centre' || s === 'middle') return { v: screenExtent / 2, assumed: false };
    if (s === lowWord)  return { v: screenExtent * 0.25, assumed: false };
    if (s === highWord) return { v: screenExtent * 0.75, assumed: false };
    const n = toNum(s);
    if (n == null) return { v: screenExtent / 2, assumed: false };
    if (n >= 0 && n <= 1) return { v: n * screenExtent, assumed: false };
    return { v: (n / spaceExtent) * screenExtent, assumed: true };
  };
  const X = axis(p.horizontal, screenW, space[0], 'left', 'right');
  const Y = axis(p.vertical,   screenH, space[1], 'top', 'bottom');
  return { x: X.v, y: Y.v, assumed: X.assumed || Y.assumed };
}

/* Draw one stimulus to a canvas that represents the whole presentation screen. */
/* A paradigm may define its own colours by name with explicit components. Those take
   precedence over the built in names. */
function paradigmColor(model, c) {
  if (!c) return colorOf(c);
  const def = (model.colors || []).find(x => String(x.name).toLowerCase() === String(c).trim().toLowerCase());
  return def ? `rgb(${def.r},${def.g},${def.b})` : colorOf(c);
}

function drawSlide(ctx, cw, ch, screenW, screenH, slide, model, opts = {}) {
  const scale = cw / screenW;
  ctx.save();
  ctx.fillStyle = paradigmColor(model, (slide && slide.backGroundColor) || model.defaults.bg);
  ctx.fillRect(0, 0, cw, ch);
  if (!slide) { ctx.restore(); return { missing: [] }; }
  ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip();   /* the screen crops, so the preview crops */

  const missing = [];
  const pics = slide.pictures || [];
  let anyDrawn = false;

  for (const p of pics) {
    const im = imgFor(model, p.value);
    if (!im || im.missing) { missing.push(p.value); continue; }
    /* An explicit width and height, present in the JSON format, is the authored render
       size. Without one the picture is drawn at its native pixel size, which is what the
       legacy XML format means. */
    const w = (p.width  != null ? p.width  : im.w) * scale;
    const h = (p.height != null ? p.height : im.h) * scale;
    /* Placement, most specific first: explicit coordinates on the picture, then a position
       name belonging to that picture, then the position of the slide as a whole. */
    let place;
    if (p.horizontal != null || p.vertical != null) place = resolvePlacementRaw(model, p.horizontal, p.vertical, screenW, screenH);
    else place = resolvePlacement(model, p.position || slide.position, screenW, screenH);
    const cx = place.x * scale, cy = place.y * scale;
    ctx.drawImage(im.img, cx - w / 2, cy - h / 2, w, h);
    anyDrawn = true;
  }

  if (!pics.length && slide.video) {
    ctx.fillStyle = '#1c2230';
    ctx.fillRect(cw * 0.16, ch * 0.30, cw * 0.68, ch * 0.40);
    ctx.fillStyle = '#9cc4ff';
    ctx.font = `${Math.max(12, cw * 0.022)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('video: ' + String(slide.video.value).split(/[\\/]/).pop(), cw / 2, ch / 2);
  }

  if (missing.length && !anyDrawn) {
    ctx.fillStyle = '#3a1616';
    ctx.fillRect(cw * 0.18, ch * 0.36, cw * 0.64, ch * 0.28);
    ctx.fillStyle = '#f6a8a3';
    ctx.font = `${Math.max(11, cw * 0.02)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('missing file: ' + String(missing[0]).split(/[\\/]/).pop(), cw / 2, ch / 2);
  }

  /* Text. The structured form carries its own colour, size and placement per run. The
     plain form uses the paradigm defaults and the font size of the active version. */
  const runs = (slide.textRuns && slide.textRuns.length)
    ? slide.textRuns
    : (slide.text != null && String(slide.text) !== '' ? [{ value: slide.text }] : []);
  for (const r of runs) {
    const fs = (r.fontSize ?? toNum(slide.fontsize) ?? model.fontSizeByVersion[opts.version] ?? 48) * scale;
    ctx.fillStyle = paradigmColor(model, r.color || slide.color || model.defaults.fg);
    ctx.font = `${fs}px ${model.defaults.font || 'sans-serif'}, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const place = (r.horizontal != null || r.vertical != null)
      ? resolvePlacementRaw(model, r.horizontal, r.vertical, screenW, screenH)
      : resolvePlacement(model, slide.position, screenW, screenH);
    const lines = String(r.value).replace(/\r/g, '').split('\n');
    const lh = fs * 1.2;
    const y0 = place.y * scale - lh * (lines.length - 1) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, place.x * scale, y0 + i * lh));
  }

  if (opts.badges !== false) {
    const tags = [];
    if (pics.length > 1) tags.push(pics.length + ' layers');
    if (slide.sound) tags.push('audio');
    if (slide.video) tags.push('video');
    if (slide.expectedResponse) tags.push('response ' + ((slide.expectedResponse.keys || []).join(',') || 'expected'));
    if (tags.length) {
      const t = tags.join('   ');
      ctx.font = `${Math.max(10, cw * 0.017)}px sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const w = ctx.measureText(t).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,.58)';
      ctx.fillRect(cw * 0.012, cw * 0.012, w, Math.max(17, cw * 0.028));
      ctx.fillStyle = '#9cc4ff';
      ctx.fillText(t, cw * 0.012 + 7, cw * 0.012 + 3);
    }
  }
  ctx.restore();
  return { missing };
}
function resolvePlacementRaw(model, h, v, screenW, screenH) {
  const fake = '__inline__';
  const saved = model.positions.find(p => p.name === fake);
  const tmp = { name: fake, horizontal: h ?? 'center', vertical: v ?? 'center' };
  if (saved) Object.assign(saved, tmp); else model.positions.push(tmp);
  const out = resolvePlacement(model, fake, screenW, screenH);
  if (!saved) model.positions.pop();
  return out;
}

/* ---------- timeline chart ---------- */
function drawTimeline(host, tl, tr, opts = {}) {
  host.innerHTML = '';
  const W = Math.max(320, host.clientWidth || 900);
  const rowH = opts.compact ? 40 : 52, top = 10, axisH = 20, preH = tl.startMs < 0 ? 12 : 0;
  const H = top + rowH + axisH + preH + 4;
  const t0 = Math.min(0, tl.startMs), t1 = Math.max(tl.totalMs, t0 + 1);
  const span = t1 - t0;
  const x = ms => 5 + (W - 10) * (ms - t0) / span;
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tl', preserveAspectRatio: 'none' });
  svg.style.height = H + 'px';

  if (tr && span / tr < 2000) {
    const n = Math.ceil(tl.totalMs / tr);
    for (let i = 0; i <= n; i++) {
      const xx = x(i * tr);
      svg.appendChild(mk('line', { x1: xx, y1: top, x2: xx, y2: top + rowH, stroke: 'var(--line)', 'stroke-width': i % 5 ? 0.4 : 0.9 }));
    }
  }
  /* Pre trigger region, drawn behind and shaded. */
  if (tl.startMs < 0) {
    svg.appendChild(mk('rect', { x: x(tl.startMs), y: top, width: Math.max(1, x(0) - x(tl.startMs)), height: rowH, fill: 'var(--panel2)', opacity: .8 }));
    const lb = mk('text', { x: x(tl.startMs) + 3, y: top + 11, fill: 'var(--dim)', 'font-size': 9 });
    lb.textContent = 'before trigger'; svg.appendChild(lb);
  }
  for (const s of tl.segments) {
    if (s.kind === 'trigger' || s.missing) continue;
    if (!(s.dur > 0)) continue;
    const xa = x(s.t0), w = Math.max(1, x(s.t0 + s.dur) - xa);
    const r = mk('rect', { x: xa, y: top, width: w, height: rowH, rx: 3,
      fill: s.cond > 0 ? 'var(--active)' : 'var(--rest)', stroke: 'var(--bg)', 'stroke-width': 1 });
    const ti = document.createElementNS(NS, 'title');
    ti.textContent = `${s.label}  ${mmss(s.t0)} to ${mmss(s.t0 + s.dur)}  (${fmtDur(s.dur)}${tr ? `, ${(s.dur / tr).toFixed(1)} volumes` : ''})`;
    r.appendChild(ti); svg.appendChild(r);
    if (w > 36) {
      const t = mk('text', { x: xa + w / 2, y: top + rowH / 2 + 4, fill: s.cond > 0 ? '#e8f0ff' : 'var(--fg)', 'font-size': 10, 'text-anchor': 'middle' });
      t.textContent = s.label.length * 6.2 < w ? s.label : '';
      svg.appendChild(t);
    }
  }
  /* Trigger marker at time zero. */
  if (tl.hasTrigger) {
    const xx = x(0);
    svg.appendChild(mk('line', { x1: xx, y1: top - 3, x2: xx, y2: top + rowH + 3, stroke: 'var(--trig)', 'stroke-width': 2 }));
    const t = mk('text', { x: xx + 3, y: top + rowH + 12, fill: 'var(--trig)', 'font-size': 9 });
    t.textContent = 'trigger'; svg.appendChild(t);
  }
  /* Time axis. */
  const step = span > 600000 ? 120 : span > 240000 ? 60 : span > 60000 ? 30 : 10;
  for (let s = Math.ceil(t0 / (step * 1000)) * step * 1000; s <= t1; s += step * 1000) {
    const xx = x(s);
    svg.appendChild(mk('line', { x1: xx, y1: top + rowH, x2: xx, y2: top + rowH + 4, stroke: 'var(--dim)' }));
    const t = mk('text', { x: xx, y: top + rowH + 15, fill: 'var(--mut)', 'font-size': 9.5, 'text-anchor': 'middle' });
    t.textContent = mmss(s); svg.appendChild(t);
  }
  /* Playhead. */
  const head = mk('line', { x1: x(0), y1: top - 4, x2: x(0), y2: top + rowH + 4, stroke: 'var(--accent)', 'stroke-width': 1.5, opacity: 0 });
  head.setAttribute('id', 'playhead-' + (opts.id || 'main'));
  svg.appendChild(head);
  svg._x = x; svg._head = head;

  svg.addEventListener('click', ev => {
    const rect = svg.getBoundingClientRect();
    const frac = (ev.clientX - rect.left) / rect.width;
    const ms = t0 + frac * span;
    if (opts.onSeek) opts.onSeek(ms);
  });
  svg.style.cursor = 'pointer';
  host.appendChild(svg);
  host._svg = svg;
  return svg;
}
function movePlayhead(host, ms) {
  const svg = host && host._svg;
  if (!svg || !svg._x) return;
  const xx = svg._x(ms);
  svg._head.setAttribute('x1', xx); svg._head.setAttribute('x2', xx);
  svg._head.setAttribute('opacity', 1);
}

/* ---------- playback ----------
   The default rate is 1x, that is real time. A paradigm is a timing document and the
   first thing anyone needs to judge is whether the pacing is tolerable for a patient,
   which only real time shows. Faster rates remain available for scanning a long run. */
const PB = {
  playing: false, elapsed: 0, raf: null, speed: 1, lastTs: 0,
  lastEventKey: null, audio: null, audioOn: true, mode: 'run', heldSlide: null
};

function stopAudio() {
  if (PB.audio) { try { PB.audio.pause(); } catch (_) {} PB.audio = null; }
  PB.lastEventKey = null;
}
function playEventAudio(model, slide) {
  if (!PB.audioOn || !slide || !slide.sound) return;
  const url = assetUrl(model, slide.sound.value);
  if (!url) return;
  try {
    if (PB.audio) PB.audio.pause();
    const a = new Audio(url);
    /* Media element playback rate is only defined over a narrow range, so audio is left at
       normal speed once the visual playback runs faster than four times real time. */
    a.playbackRate = Math.min(Math.max(PB.speed, 0.25), 4);
    a.preservesPitch = false;
    PB.audio = a;
    a.play().catch(() => {});
  } catch (_) {}
}
