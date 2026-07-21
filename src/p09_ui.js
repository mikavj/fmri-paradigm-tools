/* ======================================================================================
   8. USER INTERFACE

   The editor and the preview are on screen together. Every edit recomputes the timeline
   and the validation, so the run length, the volume count and the on screen appearance
   respond immediately to a change in a duration or a block order.
   ====================================================================================== */

/* Display geometries.

   These are derived from the paradigm files themselves rather than assumed. The per
   version font sizes carried in the reference paradigms are 58, 104, 104 and 208 for
   VisualSystem, VisualSystem-HD, LCD-HD and LCD-4K. Font size scales with screen height,
   and 208 is exactly twice 104 while 58 is 104 multiplied by 600/1080. That fixes
   LCD-4K at 2160 lines, LCD-HD and VisualSystem-HD at 1080, and VisualSystem at 600,
   which is the 800 by 600 goggle display. The same 800 by 600 space explains the numeric
   stimulus positions found in the motor paradigms, where 150 and 550 sit a quarter and
   three quarters of the way across an 800 pixel wide screen. */
const SCREEN_PRESETS = {
  'VisualSystem':    [800, 600],
  'VisualSystem-HD': [1920, 1080],
  'LCD-HD':          [1920, 1080],
  'LCD-4K':          [3840, 2160]
};
const DEFAULT_SCREEN = [1920, 1080];

let MODELS = [];                 /* every paradigm found in the opened folder */
let M = null;                    /* the active model */
let TL = null;                   /* the active timeline */
let VAL = { errs: [], warns: [], notes: [] };
let ACTIVE = { version: '', language: '' };
let SCREEN = DEFAULT_SCREEN.slice();
let curTab = 'design';

const edit = fn => { fn(); markDirty(M, 'any'); refreshAll(); };

/* ---------- small form controls ---------- */
function txtIn(value, onChange, opts = {}) {
  return el('input', Object.assign({
    type: 'text', value: value ?? '',
    onchange: e => edit(() => onChange(e.target.value))
  }, opts.attrs || {}));
}
function numIn(value, onChange, opts = {}) {
  return el('input', Object.assign({
    type: 'text', inputmode: 'numeric', value: value ?? '',
    onchange: e => edit(() => onChange(e.target.value))
  }, opts.attrs || {}));
}
function selIn(value, options, onChange, opts = {}) {
  const s = el('select', Object.assign({ onchange: e => edit(() => onChange(e.target.value)) }, opts.attrs || {}));
  for (const o of options) {
    const v = typeof o === 'object' ? o.v : o;
    const t = typeof o === 'object' ? o.t : o;
    s.appendChild(el('option', { value: v, selected: String(v) === String(value) }, String(t)));
  }
  return s;
}
function field(label, input) { return el('div', { class: 'field' }, [el('label', { text: label }), input]); }
function reorderBtns(arr, i) {
  return el('div', { class: 'reorder' }, [
    el('button', { class: 'mini up', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => edit(() => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; }) }),
    el('button', { class: 'mini down', title: 'Move down', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: () => edit(() => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; }) })
  ]);
}
const delBtn = (onClick, title = 'Remove') => el('button', { class: 'mini danger', text: '\u00D7', title, 'aria-label': title, onclick: () => edit(onClick) });
function panel(title, tools) {
  return el('div', { class: 'panel' }, [el('h3', {}, [el('span', { text: title }), tools || el('span')])]);
}
function foldPanel(title, tools, open) {
  const d = el('details', { class: 'panel', open: !!open });
  d.appendChild(el('summary', {}, [
    el('span', {}, [el('span', { class: 'caret', text: '›' }), ' ' + title]),
    tools || el('span')
  ]));
  return d;
}

/* ---------- orchestration ---------- */
function refreshAll() {
  if (!M) return;
  TL = buildTimeline(M, ACTIVE.version, ACTIVE.language);
  VAL = validateModel(M, TL);
  renderStatus();
  renderTab(curTab);
  syncPreview();
}

function renderStatus() {
  const bar = $('#status');
  bar.hidden = false;
  bar.innerHTML = '';
  const tr = resolveNum(M.acq.trMs, varTable(M));
  const declared = resolveNum(M.acq.volumes, varTable(M));
  const computed = tr ? TL.totalMs / tr : null;
  const match = declared != null && computed != null && Math.abs(computed - declared) <= 0.5;

  const chip = html => bar.appendChild(el('div', { class: 'chip', html }));
  chip(`<span class="mut">Run</span> <b>${mmss(TL.totalMs)}</b>`);
  chip(`<span class="mut">Volumes</span> <b>${computed != null ? computed.toFixed(computed % 1 ? 2 : 0) : 'n/a'}</b> computed <span class="mut">of</span> <b>${declared ?? 'n/a'}</b> declared ${declared != null && computed != null ? (match ? '<span class="pill ok">match</span>' : '<span class="pill bad">mismatch</span>') : ''}`);
  if (!match && computed != null && declared != null) {
    const b = el('button', { class: 'mini good', text: `Set Volumes to ${Math.round(computed)}` });
    b.onclick = () => edit(() => { M.acq.volumes = String(Math.round(computed)); toast('Volumes set to ' + M.acq.volumes); });
    bar.appendChild(el('div', { class: 'chip' }, b));
  }
  chip(`<span class="mut">Active</span> <b>${mmss(TL.activeMs)}</b> <span class="mut">Rest</span> <b>${mmss(TL.restMs)}</b>`);
  chip(`<span class="mut">Duty</span> <b>${TL.activeMs + TL.restMs ? Math.round(100 * TL.activeMs / (TL.activeMs + TL.restMs)) + '%' : 'n/a'}</b>`);
  chip(`<span class="dot ${VAL.errs.length ? 'bad' : VAL.warns.length ? 'warn' : 'ok'}"></span> <b>${VAL.errs.length}</b> error${VAL.errs.length === 1 ? '' : 's'}, <b>${VAL.warns.length}</b> warning${VAL.warns.length === 1 ? '' : 's'}`);
  if (M._edited) chip(`<span class="pill warn">edited, not yet exported</span>`);
}

function renderTab(tab) {
  curTab = tab;
  const host = $('#tab-' + tab);
  if (!host) return;
  /* The Information tab is readable before anything is opened. The others need a paradigm,
     and say so rather than rendering an empty shell. */
  if (!M && tab !== 'info') {
    stashPreview();
    host.innerHTML = '';
    const p = panel('No paradigm is open');
    p.appendChild(el('div', { class: 'hint', text: 'This tab works on a paradigm. Open one, load a demonstration, or start from scratch. The Information tab is readable without any of those.' }));
    p.appendChild(el('div', { class: 'row', style: 'margin-top:9px' }, [
      el('button', { class: 'primary', text: 'Open a paradigm', onclick: backToStart }),
      el('button', { class: 'good', text: 'Open a working demo', onclick: openDemo }),
      el('button', { text: 'Start a new paradigm', onclick: openNewParadigm }),
      el('button', { class: 'ghost', text: 'Read the Information tab', onclick: () => selectTab('info') })
    ]));
    host.appendChild(p);
    return;
  }
  /* The preview is a single live element that is moved between tabs rather than rebuilt,
     so that the canvas, the transport state and the audio survive a re-render. It must be
     detached before a tab clears its contents, otherwise clearing the tab destroys it. */
  stashPreview();
  const fn = { design: tabDesign, stimuli: tabStimuli, timeline: tabTimeline, calibrate: tabCalibrate,
               convert: tabConvert, files: tabFiles, validate: tabValidate, info: tabInfo }[tab];
  if (fn) fn(host);
}

/* Switching tabs from code, used by the buttons that cross-reference another tab. */
function selectTab(tab) {
  $('#tabbar').hidden = false;
  $('#app').hidden = false;
  $('#loader').hidden = true;
  $$('#tabbar button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  $$('.tab').forEach(x => x.classList.remove('on'));
  const host = $('#tab-' + tab);
  if (host) host.classList.add('on');
  renderTab(tab);
  window.scrollTo(0, 0);
}
function backToStart() {
  $('#app').hidden = true;
  $('#loader').hidden = false;
  window.scrollTo(0, 0);
}

/* ---------- the shared preview, moved between the two editing tabs ---------- */
let PREVIEW_DOCK = null;
function stashPreview() {
  if (!PREVIEW_DOCK) PREVIEW_DOCK = document.getElementById('previewDock');
  if (PREVIEW_DOCK && PREVIEW_DOCK.parentElement !== document.body) {
    PREVIEW_DOCK.hidden = true;
    document.body.appendChild(PREVIEW_DOCK);
  }
}
function mountPreview(hostSel) {
  stashPreview();
  const host = $(hostSel);
  if (!host || !PREVIEW_DOCK) return;
  PREVIEW_DOCK.hidden = false;
  host.appendChild(PREVIEW_DOCK);
  sizePreviewCanvas();
}
function sizePreviewCanvas() {
  const cvs = $('#player');
  if (!cvs) return;
  const parent = cvs.parentElement;
  const cw = Math.max(240, (parent && parent.clientWidth ? parent.clientWidth : 480) - 26);
  cvs.width = cw;
  cvs.height = Math.round(cw * SCREEN[1] / SCREEN[0]);
  drawPreviewAt(PB.elapsed);
}

function syncPreview() {
  const scrub = $('#scrub');
  const sc = $('#screenNote');
  if (!scrub || !sc) return;      /* the preview is detached while a tab rebuilds itself */
  scrub.min = Math.round(Math.min(0, TL.startMs));
  scrub.max = Math.round(Math.max(TL.totalMs, 1));
  const preset = SCREEN_PRESETS[ACTIVE.version];
  sc.textContent = `Version ${ACTIVE.version || 'unset'}${preset ? ` is presented at ${preset[0]} by ${preset[1]} pixels` : ''}. Font size ${M.fontSizeByVersion[ACTIVE.version] ?? 'not set'}. Background ${M.defaults.bg}, foreground ${M.defaults.fg}. Pictures are drawn at the size the paradigm specifies, and the preview crops exactly as the screen would.`;
  const sel = $('#selPreviewSlide');
  if (sel) {
    const names = [...TL.slides.keys()].sort();
    const keep = sel.value;
    sel.innerHTML = '';
    for (const n of names) sel.appendChild(el('option', { value: n, selected: n === keep }, n));
  }
  drawPreviewAt(PB.elapsed);
  const mini = $('#miniTimeline');
  if (mini) {
    drawTimeline(mini, TL, resolveNum(M.acq.trMs, varTable(M)), { compact: true, id: 'mini', onSeek: ms => seekTo(ms) });
    movePlayhead(mini, PB.elapsed);
  }
}

function currentPreviewSlide(ms) {
  const holder = $('#selPreviewSlide');
  if (PB.mode === 'slide' && holder) {
    return { slide: TL.slides.get(holder.value) || null, ev: null };
  }
  const ev = eventAt(TL, ms);
  return { slide: ev ? ev.slide : null, ev };
}

function drawPreviewAt(ms) {
  if (!M || !TL) return;
  const cvs = $('#player');
  if (!cvs || !cvs.width) return;
  const { slide, ev } = currentPreviewSlide(ms);
  drawSlide(cvs.getContext('2d'), cvs.width, cvs.height, SCREEN[0], SCREEN[1], slide, M, { version: ACTIVE.version });
  const tr = resolveNum(M.acq.trMs, varTable(M));
  const vol = tr ? Math.floor(ms / tr) + 1 : null;
  const info = $('#nowInfo');
  if (PB.mode === 'slide') {
    info.innerHTML = `<span>Holding <b>${esc($('#selPreviewSlide').value || 'nothing')}</b></span>` +
      `<span class="mut">the transport is paused while a single stimulus is held</span>`;
  } else {
    info.innerHTML =
      `<span>Time <b>${ms < 0 ? '-' + mmss(-ms) : mmss(ms)}</b> of ${mmss(TL.totalMs)}</span>` +
      `<span>Volume <b>${ms < 0 ? 'before trigger' : (vol ?? 'n/a')}</b>${M.acq.volumes && ms >= 0 ? ` of ${M.acq.volumes}` : ''}</span>` +
      `<span>${ev ? (ev.t0 < 0 ? '<b class="mut">PRE SCAN</b>' : ev.cond > 0 ? '<b style="color:var(--accent)">ACTIVE</b>' : '<b class="mut">REST</b>') : ''}</span>` +
      `<span>${ev && ev.slideName ? 'Stimulus <b>' + esc(ev.slideName) + '</b>' : ''}</span>` +
      `<span class="mut">${ev ? esc([ev.blockName, ev.trialName].filter(Boolean).join(' / ')) : ''}</span>`;
  }
  $('#scrub').value = Math.round(ms);
  movePlayhead($('#miniTimeline'), ms);
  const note = $('#previewNote');
  if (note) note.textContent = ev && ev.nominal
    ? `This stimulus has no encoded duration. It is being shown for ${NOMINAL_HOLD_MS / 1000} s in the preview only, and would in reality remain until the next event or a key press.`
    : (TL.hasTrigger ? 'Time zero is the scanner trigger. In a real run the paradigm waits at that point; here it advances automatically.' : 'This paradigm defines no trigger wait, so time zero is the first stimulus.');
}

function seekTo(ms) {
  PB.elapsed = Math.max(Math.min(0, TL.startMs), Math.min(ms, TL.totalMs));
  stopAudio();
  drawPreviewAt(PB.elapsed);
}
function tick(ts) {
  if (!PB.playing) return;
  if (!PB.lastTs) { PB.lastTs = ts; PB.raf = requestAnimationFrame(tick); return; }
  /* Frame callbacks stop while the tab is in the background, so the first frame after
     coming back reports however long the user was away. Left unclamped that jumps the run
     forward by minutes. A quarter of a second is longer than any real frame interval and
     short enough that the jump is invisible. */
  const dt = Math.min(ts - PB.lastTs, 250);
  PB.lastTs = ts;
  PB.elapsed += dt * PB.speed;
  if (PB.elapsed >= TL.totalMs) {
    PB.elapsed = TL.totalMs; PB.playing = false;
    $('#btnPlay').textContent = 'Play'; stopAudio(); drawPreviewAt(PB.elapsed);
    return;
  }
  drawPreviewAt(PB.elapsed);
  const ev = eventAt(TL, PB.elapsed);
  const key = ev ? ev.t0 + ':' + (ev.slideName || '') : null;
  if (key !== PB.lastEventKey) {
    PB.lastEventKey = key;
    if (ev && ev.slide && ev.slide.sound) playEventAudio(M, ev.slide);
    else if (PB.audio) { try { PB.audio.pause(); } catch (_) {} PB.audio = null; }
  }
  PB.raf = requestAnimationFrame(tick);
}
function playPause() {
  if (PB.mode === 'slide') { toast('Switch the preview back to "Follow the run" to play.'); return; }
  PB.playing = !PB.playing;
  $('#btnPlay').textContent = PB.playing ? 'Pause' : 'Play';
  if (PB.playing) {
    if (PB.elapsed >= TL.totalMs) PB.elapsed = Math.min(0, TL.startMs);
    PB.lastTs = 0; PB.lastEventKey = null;
    PB.raf = requestAnimationFrame(tick);
  } else { cancelAnimationFrame(PB.raf); stopAudio(); }
}

/* ======================================================================================
   Tab: Design
   ====================================================================================== */
function tabDesign(host) {
  host.innerHTML = '<div class="split"><div class="leftcol" id="designLeft"></div><div class="rightcol" id="designRight"></div></div>';
  const L = $('#designLeft');

  /* --- acquisition --- */
  const pa = panel('Acquisition');
  const g = el('div', { class: 'grid2' });
  g.append(
    field('Paradigm name', txtIn(M.name, v => { M.name = v; })),
    field('Repetition time, ms', numIn(M.acq.trMs, v => M.acq.trMs = v)),
    field('Volumes', numIn(M.acq.volumes, v => M.acq.volumes = v)),
    field('Slices', numIn(M.acq.slices, v => M.acq.slices = v)),
    field('Inter pulse interval, ms', numIn(M.acq.ipiMs, v => M.acq.ipiMs = v)),
    field('Average block length, ms', numIn(M.acq.avgBlockMs, v => M.acq.avgBlockMs = v))
  );
  pa.appendChild(g);
  pa.appendChild(el('div', { class: 'hint', text: 'Volumes is what the scanner is told to acquire. The status bar above compares it against the length the block design actually produces.' }));
  pa.appendChild(hintPanel('What each of these fields does', hintElements));
  L.appendChild(pa);

  /* --- display and font size --- */
  const pfs = panel('Display and font size');
  pfs.appendChild(el('div', { class: 'hint', text: 'Font size is the height of the text in pixels on the actual display, held separately for each display version. A single stimulus can override it on the Stimuli tab. Use the Calibrate tab to choose a value against the real screen geometry.' }));
  const fsGrid = el('div', { class: 'grid2', style: 'margin-top:8px' });
  for (const v of (M.versions.length ? M.versions : [ACTIVE.version])) {
    const preset = SCREEN_PRESETS[v];
    const cur = M.fontSizeByVersion[v];
    fsGrid.append(field(
      `${v}${preset ? ` (${preset[0]} x ${preset[1]})` : ''}`,
      numIn(cur ?? '', val => {
        const n = toNum(val);
        if (n == null) delete M.fontSizeByVersion[v]; else M.fontSizeByVersion[v] = n;
        const df = (M.raw.defaultsFiles || []).find(f => f.version === v);
        if (df) df.fontSize = n == null ? '' : String(n);
      }, { attrs: { placeholder: 'not set' } })
    ));
  }
  pfs.appendChild(fsGrid);
  if (!M.versions.some(v => M.fontSizeByVersion[v] != null))
    pfs.appendChild(el('div', { class: 'hint', html: '<span class="pill warn">no font size is set</span> Text stimuli will fall back to 48 px in the preview, which is almost certainly too small on a scanner display. Set a value here or work one out on the Calibrate tab.' }));
  const dpv = (M.raw.defaultsFiles || []).filter(f => f.defaultPicture);
  if (dpv.length)
    pfs.appendChild(el('div', { class: 'hint', text: 'Default picture per version: ' + dpv.map(f => `${f.version} uses ${f.defaultPicture}`).join(', ') + '.' }));
  pfs.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [
    el('button', { class: 'mini', text: 'Open the Calibrate tab', onclick: () => {
      $$('#tabbar button').forEach(x => x.classList.remove('on'));
      $$('.tab').forEach(x => x.classList.remove('on'));
      document.querySelector('#tabbar button[data-tab=calibrate]').classList.add('on');
      $('#tab-calibrate').classList.add('on');
      renderTab('calibrate');
    } })
  ]));
  L.appendChild(pfs);

  /* --- session order --- */
  const trialNames = M.trials.map(t => t.name);
  const blockNames = M.blocks.map(b => b.name);
  const ps = panel('Session order', el('span', { class: 'tools' }, [
    el('button', { class: 'mini', text: '+ block', onclick: () => edit(() => M.session.push({ kind: 'block', ref: blockNames[0] || '' })) }),
    el('button', { class: 'mini', text: '+ trial', onclick: () => edit(() => M.session.push({ kind: 'trial', ref: trialNames[0] || '' })) })
  ]));
  M.session.forEach((s, i) => {
    const seg = TL.segments[i];
    ps.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
      reorderBtns(M.session, i),
      selIn(s.kind, [{ v: 'block', t: 'block' }, { v: 'trial', t: 'trial' }], v => s.kind = v, { attrs: { style: 'width:70px' } }),
      selIn(s.ref, (s.kind === 'trial' ? trialNames : blockNames).concat(
        (s.kind === 'trial' ? trialNames : blockNames).includes(s.ref) ? [] : [s.ref]), v => s.ref = v, { attrs: { style: 'flex:1;min-width:110px' } }),
      el('span', { class: 'mut mono nowrap', text: seg ? `${mmss(seg.t0 || 0)} +${fmtDur(seg.dur || 0)}` : '' }),
      el('span', { class: 'pill ' + (seg && seg.kind === 'trigger' ? 'info' : (seg && seg.cond > 0 ? 'active' : 'rest')), text: seg ? (seg.kind === 'trigger' ? 'trigger' : (seg.cond > 0 ? 'active' : 'rest')) : '' }),
      delBtn(() => M.session.splice(i, 1))
    ]));
  });
  L.appendChild(ps);

  /* --- blocks --- */
  const pb = foldPanel(`Blocks (${M.blocks.length})`, el('button', {
    class: 'mini', text: '+ add block',
    onclick: ev => { ev.preventDefault(); ev.stopPropagation(); edit(() => M.blocks.push({ name: 'Block' + (M.blocks.length + 1), condition: '1', trials: [trialNames[0] || ''], repetitions: '1', order: '0' })); }
  }), true);
  M.blocks.forEach((b, i) => {
    const table = varTable(M);
    const bd = blockDuration(M, b, TL.slides, table);
    const card = el('div', { class: 'item' });
    card.appendChild(el('div', { class: 'hd' }, [
      reorderBtns(M.blocks, i),
      el('span', { class: 'nm', text: 'name' }), txtIn(b.name, v => b.name = v, { attrs: { style: 'width:130px' } }),
      el('span', { class: 'nm', text: 'condition' }), txtIn(b.condition, v => b.condition = v, { attrs: { style: 'width:46px', title: '0 is baseline or rest. 1 and above are active conditions.' } }),
      el('span', { class: 'nm', text: 'repeats' }), txtIn(b.repetitions, v => b.repetitions = v, { attrs: { style: 'width:78px' } }),
      el('span', { class: 'nm', text: 'order' }),
      selIn(b.order, [{ v: '0', t: 'as written' }, { v: '1', t: 'random' }], v => b.order = v, {
        attrs: { style: 'width:104px', title: 'A value of 1 randomises the order of the trials within the block. A value of 0 keeps the order as listed.' } }),
      String(b.order) === '1' ? el('span', { class: 'pill warn', title: 'The preview shows the order as written. A randomised block is reordered at run time.', text: 'randomised' }) : null,
      el('span', { class: 'mut mono nowrap', text: `${fmtDur(bd.ms)}${bd.reps > 1 ? ` (${fmtDur(bd.one)} x ${bd.reps})` : ''}` }),
      bd.unresolved ? el('span', { class: 'pill bad', text: 'repeats unresolved' }) : null,
      delBtn(() => M.blocks.splice(i, 1))
    ]));
    const sub = el('div', { class: 'sublist' });
    b.trials.forEach((tn, j) => {
      sub.appendChild(el('div', { class: 'row', style: 'padding:1px 0' }, [
        reorderBtns(b.trials, j),
        selIn(tn, trialNames.includes(tn) ? trialNames : trialNames.concat([tn]), v => b.trials[j] = v, { attrs: { style: 'flex:1;min-width:110px' } }),
        el('span', { class: 'mut mono', text: fmtDur(trialDuration(M, M.trials.find(x => x.name === tn), TL.slides, table).ms) }),
        delBtn(() => b.trials.splice(j, 1))
      ]));
    });
    sub.appendChild(el('button', { class: 'mini', text: '+ trial', onclick: () => edit(() => b.trials.push(trialNames[0] || '')) }));
    card.appendChild(sub);
    pb.appendChild(card);
  });
  L.appendChild(pb);

  /* --- trials --- */
  const slideNames = [...TL.slides.keys()];
  const pt = foldPanel(`Trials (${M.trials.length})`, el('button', {
    class: 'mini', text: '+ add trial',
    onclick: ev => { ev.preventDefault(); ev.stopPropagation(); edit(() => M.trials.push({ name: 'Trial' + (M.trials.length + 1), ops: [{ type: 'show', item: slideNames[0] || '', duration: '1000', overlap: false }] })); }
  }), false);
  M.trials.forEach((t, i) => {
    const table = varTable(M);
    const d = trialDuration(M, t, TL.slides, table);
    const card = el('div', { class: 'item' });
    const cond = t.ops.find(o => o.type === 'condition');
    card.appendChild(el('div', { class: 'hd' }, [
      reorderBtns(M.trials, i),
      el('span', { class: 'nm', text: 'name' }), txtIn(t.name, v => t.name = v, { attrs: { style: 'width:130px' } }),
      el('span', { class: 'nm', text: 'condition' }),
      txtIn(cond ? cond.value : '', v => {
        const k = t.ops.findIndex(o => o.type === 'condition');
        if (v === '') { if (k >= 0) t.ops.splice(k, 1); }
        else if (k >= 0) t.ops[k].value = v;
        else t.ops.unshift({ type: 'condition', value: v });
      }, { attrs: { style: 'width:46px' } }),
      el('span', { class: 'mut mono nowrap', text: fmtDur(d.ms) + (d.indefinite ? ' plus an open ended hold' : '') }),
      trialIsTrigger(t) ? el('span', { class: 'pill info', text: 'waits for trigger' }) : null,
      delBtn(() => M.trials.splice(i, 1))
    ]));
    const sub = el('div', { class: 'sublist' });
    t.ops.forEach((op, j) => {
      if (op.type === 'condition') return;
      const row = el('div', { class: 'row', style: 'padding:1px 0' }, [
        reorderBtns(t.ops, j),
        selIn(op.type, ['show', 'wait', 'clear', 'register'], v => { op.type = v; }, { attrs: { style: 'width:82px' } })
      ]);
      if (op.type === 'show') {
        row.append(
          el('label', { text: 'stimulus' }),
          selIn(op.item, slideNames.includes(op.item) ? slideNames : slideNames.concat([op.item]), v => op.item = v, { attrs: { style: 'flex:1;min-width:100px' } }),
          el('label', { text: 'ms' }),
          txtIn(op.duration ?? '', v => op.duration = v === '' ? null : v, { attrs: { style: 'width:82px', placeholder: 'stimulus default' } }),
          el('label', {}, [el('input', { type: 'checkbox', checked: !!op.overlap, onchange: e => edit(() => op.overlap = e.target.checked) }), ' overlap'])
        );
      } else if (op.type === 'wait') {
        row.append(el('label', { text: 'ms' }), txtIn(op.ms, v => op.ms = v, { attrs: { style: 'width:100px' } }));
      } else if (op.type === 'clear') {
        row.append(el('label', { text: 'ms, blank for instant' }), txtIn(op.ms ?? '', v => op.ms = v, { attrs: { style: 'width:82px' } }));
      } else if (op.type === 'register') {
        row.append(el('label', { text: 'trigger keys' }), txtIn((op.keys || []).join(','), v => op.keys = v.split(',').map(s => s.trim()).filter(Boolean), { attrs: { style: 'width:100px' } }));
      } else if (op.type === 'raw') {
        row.append(el('span', { class: 'mut mono', text: String(op.xml).slice(0, 60) }));
      }
      row.append(delBtn(() => t.ops.splice(j, 1)));
      sub.appendChild(row);
    });
    sub.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'mini', text: '+ show', onclick: () => edit(() => t.ops.push({ type: 'show', item: slideNames[0] || '', duration: '1000', overlap: false })) }),
      el('button', { class: 'mini', text: '+ wait', onclick: () => edit(() => t.ops.push({ type: 'wait', ms: '1000' })) }),
      el('button', { class: 'mini', text: '+ clear', onclick: () => edit(() => t.ops.push({ type: 'clear', ms: '' })) }),
      el('button', { class: 'mini', text: '+ trigger wait', onclick: () => edit(() => t.ops.push({ type: 'register', keys: ['s'] })) })
    ]));
    card.appendChild(sub);
    pt.appendChild(card);
  });
  L.appendChild(pt);

  /* --- variables --- */
  const pv = foldPanel(`Variables (${M.variables.length})`, el('button', {
    class: 'mini', text: '+ add',
    onclick: ev => { ev.preventDefault(); ev.stopPropagation(); edit(() => M.variables.push({ key: 'NewVariable', value: '0' })); }
  }), false);
  M.variables.forEach((v, i) => {
    pv.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
      txtIn(v.key, nv => v.key = nv, { attrs: { style: 'width:170px' } }),
      el('span', { class: 'mut', text: '=' }),
      txtIn(v.value, nv => v.value = nv, { attrs: { style: 'width:120px' } }),
      el('span', { class: 'mut mono', text: '$' + v.key }),
      delBtn(() => M.variables.splice(i, 1))
    ]));
  });
  pv.appendChild(hintPanel('Names used in this family of paradigms', hintVariables));
  L.appendChild(pv);

  /* --- appearance and analysis --- */
  const pap = foldPanel('Appearance, positions and contrasts', null, false);
  pap.appendChild(el('div', { class: 'grid2' }, [
    field('Background', txtIn(M.defaults.bg, v => M.defaults.bg = v)),
    field('Foreground', txtIn(M.defaults.fg, v => M.defaults.fg = v)),
    field('Font family', txtIn(M.defaults.font || '', v => M.defaults.font = v)),
    field('Default position', selIn(M.defaults.defaultPosition, M.positions.map(p => p.name), v => M.defaults.defaultPosition = v)),
    field('Default version', selIn(M.defaults.version, M.versions, v => M.defaults.version = v)),
    field('Default language', selIn(M.defaults.language, M.languages, v => M.defaults.language = v))
  ]));
  pap.appendChild(el('h3', { style: 'margin-top:12px', text: 'Positions' }));
  pap.appendChild(el('div', { class: 'hint', text: `Numeric positions are coordinates in the space the paradigm was authored against, which the file does not record. This tool assumes ${(M.positionSpace || [800, 600]).join(' by ')} pixels, the goggle display size implied by the per version font sizes.` }));
  const psp = el('div', { class: 'row', style: 'margin:6px 0' }, [
    el('label', { text: 'Assumed coordinate space' }),
    numIn((M.positionSpace || [800, 600])[0], v => { M.positionSpace = [toNum(v) || 800, (M.positionSpace || [800, 600])[1]]; }, { attrs: { style: 'width:70px' } }),
    el('span', { class: 'mut', text: 'x' }),
    numIn((M.positionSpace || [800, 600])[1], v => { M.positionSpace = [(M.positionSpace || [800, 600])[0], toNum(v) || 600]; }, { attrs: { style: 'width:70px' } })
  ]);
  pap.appendChild(psp);
  M.positions.forEach((p, i) => {
    if (p.name === '__inline__') return;
    pap.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
      txtIn(p.name, v => p.name = v, { attrs: { style: 'width:110px' } }),
      el('label', { text: 'horizontal' }), txtIn(p.horizontal, v => p.horizontal = v, { attrs: { style: 'width:80px' } }),
      el('label', { text: 'vertical' }), txtIn(p.vertical, v => p.vertical = v, { attrs: { style: 'width:80px' } }),
      delBtn(() => M.positions.splice(i, 1))
    ]));
  });
  pap.appendChild(el('h3', { style: 'margin-top:12px', text: 'BOLD contrasts' }));
  M.bold.contrasts.forEach((c, i) => {
    pap.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
      txtIn(c.name, v => c.name = v, { attrs: { style: 'width:220px' } }),
      el('label', { text: 'weights' }), txtIn(c.weight, v => c.weight = v, { attrs: { style: 'width:110px' } }),
      delBtn(() => M.bold.contrasts.splice(i, 1))
    ]));
  });
  pap.appendChild(el('button', { class: 'mini', text: '+ contrast', onclick: () => edit(() => M.bold.contrasts.push({ name: 'New contrast', weight: '1' })) }));
  L.appendChild(pap);

  /* --- descriptions --- */
  if (M.descriptions.length) {
    const pd = foldPanel(`Description and patient instructions (${M.descriptions.length})`, null, false);
    for (const d of M.descriptions) {
      const ta = el('textarea', { rows: 8, onchange: e => edit(() => d.text = e.target.value) });
      ta.value = d.text || '';
      pd.appendChild(field(d.language, ta));
    }
    pd.appendChild(el('div', { class: 'hint', text: 'The Validate tab compares statements in this text, such as block lengths, cycle counts and repetition times, against what the design actually does.' }));
    L.appendChild(pd);
  }

  mountPreview('#designRight');
}

/* ======================================================================================
   Tab: Stimuli
   ====================================================================================== */
function tabStimuli(host) {
  host.innerHTML = '<div class="split"><div class="leftcol" id="stimLeft"></div><div class="rightcol" id="stimRight"></div></div>';
  const L = $('#stimLeft');
  if (!M.slideSets.length) { L.appendChild(el('div', { class: 'panel', text: 'This paradigm defines no stimulus sets.' })); mountPreview('#stimRight'); return; }

  tabStimuli._set = Math.min(tabStimuli._set || 0, M.slideSets.length - 1);
  const setSel = el('select', { onchange: e => { tabStimuli._set = Number(e.target.value); renderTab('stimuli'); } });
  M.slideSets.forEach((s, i) => {
    const k = s.key;
    const label = k.kind === 'none' ? 'shared base set'
      : k.kind === 'version' ? 'version: ' + k.version
      : k.kind === 'language' ? 'language: ' + k.language
      : k.kind === 'composite' ? `${k.language} / ${k.version}` : (s.jsonKey || 'set');
    setSel.appendChild(el('option', { value: i, selected: i === tabStimuli._set }, `${label} (${s.slides.length})`));
  });
  const set = M.slideSets[tabStimuli._set];

  const p = panel('Stimulus set', el('span', { class: 'tools' }, [
    setSel,
    el('button', { class: 'mini', text: '+ add stimulus', onclick: () => edit(() => set.slides.push({ name: 'stimulus' + (set.slides.length + 1), pictures: [], text: set.key.kind === 'language' ? '' : null })) })
  ]));
  p.appendChild(el('div', { class: 'hint', text: `Stored at ${set.path}. A paradigm keeps its pictures in the version sets and its wording in the language sets, and the preview merges the set for the version and language chosen in the header.` }));
  p.appendChild(hintPanel('How the stimulus sets fit together', h => {
    h.appendChild(el('p', { text: 'The same stimulus name appears in more than one set. A version set supplies the picture at that display resolution, a language set supplies the wording, and an optional base set supplies anything shared. At run time the sets are merged for the chosen version and language, with the more specific set winning, so a stimulus called Cross can have four different picture files and one shared duration.' }));
    h.appendChild(el('p', { text: 'This is why adding a picture to one version set is not enough. If a paradigm defines four display versions, every one of them needs its own copy of that picture at its own resolution, or the stimulus will be missing on the versions you did not update. The Validate tab reports that.' }));
  }));
  L.appendChild(p);

  for (let j = 0; j < set.slides.length; j++) {
    const sl = set.slides[j];
    const card = el('div', { class: 'item' });
    card.appendChild(el('div', { class: 'hd' }, [
      reorderBtns(set.slides, j),
      el('span', { class: 'nm', text: 'name' }), txtIn(sl.name, v => sl.name = v, { attrs: { style: 'width:140px' } }),
      el('span', { class: 'nm', text: 'duration ms' }), txtIn(sl.duration ?? '', v => sl.duration = v === '' ? null : v, { attrs: { style: 'width:82px', placeholder: 'set by trial' } }),
      el('span', { class: 'nm', text: 'position' }),
      selIn(sl.position ?? '', [''].concat(M.positions.filter(q => q.name !== '__inline__').map(q => q.name)), v => sl.position = v || null, { attrs: { style: 'width:100px' } }),
      el('span', { class: 'nm', text: 'font px' }),
      txtIn(sl.fontsize ?? '', v => sl.fontsize = v === '' ? null : v, {
        attrs: { style: 'width:70px', placeholder: String(M.fontSizeByVersion[ACTIVE.version] ?? 'default'),
                 title: 'Overrides the per version default font size for this stimulus only. Leave blank to inherit.' } }),
      el('button', { class: 'mini', text: 'preview', title: 'Hold this stimulus in the preview', onclick: () => { PB.mode = 'slide'; $('#selPreviewMode').value = 'slide'; $('#selPreviewSlide').hidden = false; $('#selPreviewSlide').value = sl.name; drawPreviewAt(PB.elapsed); } }),
      delBtn(() => set.slides.splice(j, 1))
    ]));
    const sub = el('div', { class: 'sublist' });

    if (sl.text != null || set.key.kind === 'language' || set.key.kind === 'composite') {
      const ta = el('textarea', { rows: 2, onchange: e => edit(() => { sl.text = e.target.value; if (sl.textRuns && sl.textRuns.length) sl.textRuns[0].value = e.target.value; }) });
      ta.value = sl.text || '';
      sub.appendChild(field('Text', ta));
    }
    (sl.pictures || []).forEach((pic, k) => {
      const im = imgFor(M, pic.value);
      sub.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
        el('span', { class: 'mut mono nowrap', text: (sl.pictures.length > 1 ? `layer ${k + 1}` : 'picture') }),
        txtIn(pic.value, v => pic.value = v, { attrs: { style: 'flex:1;min-width:150px' } }),
        el('span', { class: im && !im.missing ? 'mut mono nowrap' : 'pill bad', text: im && !im.missing ? `${im.w} x ${im.h} px` : 'file missing' }),
        el('button', { class: 'mini', text: 'replace', onclick: () => pickFile('image/*', f => edit(() => { const rel = 'Pictures/' + f.name; if (!M.assets.some(a => a.rel === rel)) M.assets.push({ rel, file: f, size: f.size }); pic.value = './' + rel; })) }),
        delBtn(() => sl.pictures.splice(k, 1))
      ]));
    });
    const media = el('div', { class: 'row' }, [
      el('button', { class: 'mini', text: '+ picture', onclick: () => pickFile('image/*', f => edit(() => { const rel = 'Pictures/' + f.name; if (!M.assets.some(a => a.rel === rel)) M.assets.push({ rel, file: f, size: f.size }); (sl.pictures = sl.pictures || []).push({ value: './' + rel }); })) }),
      sl.sound ? null : el('button', { class: 'mini', text: '+ audio', onclick: () => pickFile('audio/*', f => edit(() => { const rel = 'audio/' + f.name; if (!M.assets.some(a => a.rel === rel)) M.assets.push({ rel, file: f, size: f.size }); sl.sound = { value: './' + rel }; })) }),
      sl.video ? null : el('button', { class: 'mini', text: '+ video', onclick: () => pickFile('video/*', f => edit(() => { const rel = 'video/' + f.name; if (!M.assets.some(a => a.rel === rel)) M.assets.push({ rel, file: f, size: f.size }); sl.video = { value: './' + rel }; })) })
    ]);
    if (sl.sound) {
      sub.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
        el('span', { class: 'mut mono', text: 'audio' }),
        txtIn(sl.sound.value, v => sl.sound.value = v, { attrs: { style: 'flex:1;min-width:150px' } }),
        el('span', { class: resolvePath(M.source.baseDir, sl.sound.value) ? 'mut' : 'pill bad', text: resolvePath(M.source.baseDir, sl.sound.value) ? 'present' : 'file missing' }),
        el('button', { class: 'mini', text: 'listen', onclick: () => { const u = assetUrl(M, sl.sound.value); if (u) { stopAudio(); PB.audio = new Audio(u); PB.audio.play().catch(() => {}); } } }),
        delBtn(() => sl.sound = null)
      ]));
    }
    if (sl.video) {
      sub.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
        el('span', { class: 'mut mono', text: 'video' }),
        txtIn(sl.video.value, v => sl.video.value = v, { attrs: { style: 'flex:1;min-width:150px' } }),
        delBtn(() => sl.video = null)
      ]));
    }
    sub.appendChild(el('div', { class: 'row', style: 'padding:2px 0' }, [
      el('label', {}, [el('input', { type: 'checkbox', checked: !!sl.expectedResponse, onchange: e => edit(() => sl.expectedResponse = e.target.checked ? { keys: (sl.expectedResponse && sl.expectedResponse.keys) || [] } : null) }), ' expect a response']),
      sl.expectedResponse ? el('label', { text: 'keys' }) : null,
      sl.expectedResponse ? txtIn((sl.expectedResponse.keys || []).join(','), v => sl.expectedResponse.keys = v.split(',').map(s => s.trim()).filter(Boolean), { attrs: { style: 'width:110px', placeholder: 'A,B' } }) : null
    ]));
    sub.appendChild(media);
    card.appendChild(sub);
    L.appendChild(card);
  }

  /* The same controls repeat at the foot of the list, so a long set does not have to be
     scrolled back to the top to add to it. */
  const foot = panel('Add to this set', null);
  foot.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'primary mini', text: '+ add stimulus', onclick: () => edit(() => set.slides.push({ name: uniqueStimulusName(set), pictures: [], text: set.key.kind === 'version' ? null : '' })) }),
    el('button', { class: 'mini', text: '+ add from pictures', onclick: () => pickFiles('image/*', fs => edit(() => {
      for (const f of fs) {
        const rel = 'Pictures/' + f.name;
        if (!M.assets.some(a => a.rel === rel)) M.assets.push({ rel, file: f, size: f.size });
        set.slides.push({ name: uniqueStimulusName(set, f.name.replace(/\.[^.]+$/, '')), pictures: [{ value: './' + rel }], text: null });
      }
      preloadImages(M);
    })) }),
    el('button', { class: 'mini', text: 'Import a list', onclick: () => openStimulusImport(set) })
  ]));
  foot.appendChild(hintPanel('Importing a list of stimuli', h => {
    h.appendChild(el('p', { text: 'Paste or open a list to create many stimuli at once. One stimulus per line. A line may be just the text, or several fields separated by commas, tabs or semicolons.' }));
    h.appendChild(el('pre', { class: 'code', text: 'happy\nsad\nangry\n\nor with fields:\n\nname,text,duration,picture\nW01,happy,3000,\nW02,sad,3000,\nP01,,3000,./Pictures/face1.png' }));
    h.appendChild(el('p', { text: 'A first row containing the word name or text is treated as a header and used to map the columns. Without a header, a single column is taken as the text and the names are generated. Words separated only by spaces on one line are also accepted, one stimulus per word.' }));
  }));
  L.appendChild(foot);

  /* sizing report */
  const pz = panel(`Sizing against ${SCREEN[0]} by ${SCREEN[1]} pixels`);
  const tbl = el('table', {}, [el('thead', {}, el('tr', {}, [
    el('th', { text: 'Stimulus' }), el('th', { text: 'File' }),
    el('th', { class: 'num', text: 'Native px' }), el('th', { class: 'num', text: 'Drawn px' }),
    el('th', { class: 'num', text: '% width' }), el('th', { class: 'num', text: '% height' }), el('th', { text: 'Status' })
  ]))]);
  const tb = el('tbody'); tbl.appendChild(tb);
  let warnN = 0, badN = 0;
  for (const [name, sl] of TL.slides) {
    for (const p of (sl.pictures || [])) {
      const im = imgFor(M, p.value);
      const dw = p.width != null ? p.width : (im.missing ? null : im.w);
      const dh = p.height != null ? p.height : (im.missing ? null : im.h);
      let st = ['ok', 'ok'];
      if (im.missing) { st = ['bad', 'file missing']; badN++; }
      else if (dw > SCREEN[0] || dh > SCREEN[1]) { st = ['warn', 'larger than the screen, will be cropped']; warnN++; }
      else if (dw / SCREEN[0] < 0.05 && dh / SCREEN[1] < 0.05) { st = ['warn', 'very small on this screen']; warnN++; }
      tb.appendChild(el('tr', {}, [
        el('td', { html: `<b>${esc(name)}</b>` }),
        el('td', { class: 'mono mut', text: String(p.value).split(/[\\/]/).pop() }),
        el('td', { class: 'num', text: im.missing ? 'n/a' : `${im.w} x ${im.h}` }),
        el('td', { class: 'num', text: dw == null ? 'n/a' : `${Math.round(dw)} x ${Math.round(dh)}` }),
        el('td', { class: 'num', text: dw == null ? 'n/a' : (100 * dw / SCREEN[0]).toFixed(0) + '%' }),
        el('td', { class: 'num', text: dh == null ? 'n/a' : (100 * dh / SCREEN[1]).toFixed(0) + '%' }),
        el('td', { html: `<span class="pill ${st[0]}">${esc(st[1])}</span>` })
      ]));
    }
  }
  if (!tb.children.length) tb.appendChild(el('tr', {}, el('td', { colspan: 7, class: 'mut', text: 'This stimulus set uses no pictures.' })));
  pz.appendChild(el('div', { class: 'scroll' }, tbl));
  pz.appendChild(el('div', { class: 'hint', text: badN ? `${badN} picture file${badN > 1 ? 's are' : ' is'} missing from the folder.` : warnN ? `${warnN} picture${warnN > 1 ? 's have' : ' has'} a sizing warning.` : 'Every picture sizes cleanly on this screen.' }));
  L.appendChild(pz);

  mountPreview('#stimRight');
}

function pickFile(accept, cb) {
  const inp = el('input', { type: 'file', accept, style: 'display:none' });
  document.body.appendChild(inp);
  inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); inp.remove(); };
  inp.click();
}

/* ======================================================================================
   Tab: Timeline
   ====================================================================================== */
function tabTimeline(host) {
  host.innerHTML = '';
  const tr = resolveNum(M.acq.trMs, varTable(M));
  const declared = resolveNum(M.acq.volumes, varTable(M));
  const computed = tr ? TL.totalMs / tr : null;

  if (declared != null && computed != null) {
    const diff = computed - declared;
    const ok = Math.abs(diff) <= 0.5;
    host.appendChild(el('div', { class: 'banner ' + (ok ? 'ok' : 'bad') }, el('div', {
      html: ok
        ? `<b>The design and the declared acquisition agree.</b> The run is ${mmss(TL.totalMs)}, which is ${computed.toFixed(2)} volumes at a repetition time of ${tr} ms, matching the declared ${declared}.`
        : `<b>The design and the declared acquisition disagree.</b> The run is ${mmss(TL.totalMs)}, which is ${computed.toFixed(2)} volumes at a repetition time of ${tr} ms, but the paradigm declares ${declared} volumes. The difference is ${diff > 0 ? '+' : ''}${diff.toFixed(2)} volumes, or ${diff > 0 ? '+' : ''}${(diff * tr / 1000).toFixed(1)} seconds.`
    })));
  }

  const cards = el('div', { class: 'cards' });
  const card = (k, v, sub) => cards.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'k', text: k }), el('div', { class: 'v', html: v + (sub ? ` <small>${sub}</small>` : '') })
  ]));
  card('Run length', mmss(TL.totalMs), `${(TL.totalMs / 1000).toFixed(1)} s`);
  card('Computed volumes', computed != null ? computed.toFixed(1) : 'n/a', tr ? `TR ${tr} ms` : '');
  card('Declared volumes', String(declared ?? 'n/a'));
  card('Active', mmss(TL.activeMs), tr ? `${Math.round(TL.activeMs / tr)} vol` : '');
  card('Rest', mmss(TL.restMs), tr ? `${Math.round(TL.restMs / tr)} vol` : '');
  card('Blocks', String(TL.segments.filter(s => s.kind === 'block').length));
  card('Events', String(TL.events.filter(e => e.t0 >= 0).length));
  card('Trigger', TL.hasTrigger ? 'yes' : 'no');
  host.appendChild(cards);

  const pt = panel('Block design');
  const tlHost = el('div');
  pt.appendChild(tlHost);
  pt.appendChild(el('div', { class: 'legend', html: '<span><i style="background:var(--rest)"></i>rest</span><span><i style="background:var(--active)"></i>active</span><span><i style="background:var(--trig)"></i>trigger</span><span class="mut">click to move the preview</span>' }));
  host.appendChild(pt);
  drawTimeline(tlHost, TL, tr, { onSeek: ms => { seekTo(ms); toast('Preview moved to ' + mmss(ms)); } });

  const ps = panel('Session segments');
  const t1 = el('table', {}, [el('thead', {}, el('tr', {}, [
    el('th', { text: '#' }), el('th', { text: 'Item' }), el('th', { text: 'Type' }),
    el('th', { class: 'num', text: 'Start' }), el('th', { class: 'num', text: 'Duration' }),
    el('th', { class: 'num', text: 'Volumes' }), el('th', { text: 'Condition' })
  ]))]);
  const b1 = el('tbody'); t1.appendChild(b1);
  TL.segments.forEach((s, i) => {
    b1.appendChild(el('tr', {}, [
      el('td', { class: 'num', text: i + 1 }),
      el('td', { html: `<b>${esc(s.label)}</b>` }),
      el('td', { text: s.kind + (s.reps > 1 ? ` x${s.reps}` : '') }),
      el('td', { class: 'num', text: s.missing ? 'n/a' : mmss(s.t0 || 0) }),
      el('td', { class: 'num', text: s.missing ? 'n/a' : fmtDur(s.dur || 0) }),
      el('td', { class: 'num', text: tr && !s.missing ? ((s.dur || 0) / tr).toFixed(1) : 'n/a' }),
      el('td', { html: s.missing ? '<span class="pill bad">missing</span>' : s.kind === 'trigger' ? '<span class="pill info">trigger</span>' : s.cond > 0 ? '<span class="pill active">active</span>' : '<span class="pill rest">rest</span>' })
    ]));
  });
  ps.appendChild(el('div', { class: 'scroll' }, t1));
  host.appendChild(ps);

  const pe = panel(`Expanded events (${TL.events.length})`);
  const t2 = el('table', {}, [el('thead', {}, el('tr', {}, [
    el('th', { class: 'num', text: 'Onset s' }), el('th', { class: 'num', text: 'Dur s' }),
    el('th', { text: 'Stimulus' }), el('th', { text: 'Trial' }), el('th', { text: 'Block' }), el('th', { text: 'Condition' })
  ]))]);
  const b2 = el('tbody'); t2.appendChild(b2);
  for (const e of TL.events.slice(0, 4000)) {
    b2.appendChild(el('tr', {}, [
      el('td', { class: 'num', text: sec3(e.t0) }),
      el('td', { class: 'num', text: sec3(e.visMs != null ? e.visMs : e.dur) }),
      el('td', { text: e.slideName || (e.kind === 'trigger' ? 'trigger' : 'blank') }),
      el('td', { class: 'mut', text: e.trialName || '' }),
      el('td', { class: 'mut', text: e.blockName || '' }),
      el('td', { html: e.t0 < 0 ? '<span class="pill rest">pre scan</span>' : e.kind === 'trigger' ? '<span class="pill info">trigger</span>' : e.cond > 0 ? '<span class="pill active">' + e.cond + '</span>' : '<span class="pill rest">0</span>' })
    ]));
  }
  pe.appendChild(el('div', { class: 'scroll' }, t2));
  pe.appendChild(el('div', { class: 'hint', text: 'Onsets are in seconds from the scanner trigger. Negative onsets are material shown before the run starts, which contributes no scan time.' }));
  host.appendChild(pe);
}

/* ======================================================================================
   Tab: Validate
   ====================================================================================== */
function tabValidate(host) {
  host.innerHTML = '';
  const cls = VAL.errs.length ? 'bad' : VAL.warns.length ? 'warn' : 'ok';
  host.appendChild(el('div', { class: 'banner ' + cls }, el('div', {
    html: VAL.errs.length
      ? `<b>${VAL.errs.length} error${VAL.errs.length > 1 ? 's' : ''}.</b> The paradigm refers to something that does not exist, or will not run as written. Resolve these before using it on a scanner.`
      : VAL.warns.length
        ? `<b>No errors, ${VAL.warns.length} warning${VAL.warns.length > 1 ? 's' : ''}.</b> The paradigm is internally consistent, but something is unusual or depends on an assumption.`
        : `<b>No errors or warnings.</b> The paradigm is internally consistent and its declared acquisition matches its design.`
  })));
  const sect = (title, list, kind, icon) => {
    const p = panel(`${title} (${list.length})`);
    if (!list.length) p.appendChild(el('div', { class: 'mut', text: 'None.' }));
    else for (const msg of list) p.appendChild(el('div', { class: 'vrow ' + kind }, [el('span', { class: 'ic', text: icon }), el('span', { text: msg })]));
    host.appendChild(p);
  };
  sect('Errors', VAL.errs, 'err', '!');
  sect('Warnings', VAL.warns, 'warn', '?');
  sect('Notes', VAL.notes, 'ok', 'i');
}
