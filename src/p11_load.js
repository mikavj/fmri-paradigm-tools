/* ======================================================================================
   Loading and orchestration
   ====================================================================================== */

function readNeutralJson(json, entry) {
  const m = emptyModel();
  m.name = json.name || 'Paradigm';
  m.source = { kind: 'neutral', label: 'Neutral paradigm JSON', baseDir: entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '', mainPath: entry.path };
  const a = json.acquisition || {};
  m.acq = {
    trMs: a.repetitionTimeMs == null ? null : String(a.repetitionTimeMs),
    volumes: a.volumes == null ? null : String(a.volumes),
    slices: a.slices == null ? null : String(a.slices),
    ipiMs: a.interPulseIntervalMs == null ? null : String(a.interPulseIntervalMs),
    avgBlockMs: a.averageBlockLengthMs == null ? null : String(a.averageBlockLengthMs)
  };
  m.variables = json.variables || [];
  m.versions = json.versions || [];
  m.languages = json.languages || [];
  m.positions = json.positions || [];
  m.defaults = Object.assign(m.defaults, json.defaults || {});
  m.fontSizeByVersion = json.fontSizeByVersion || {};
  m.descriptions = json.descriptions || [];
  m.bold.contrasts = json.contrasts || [];
  m.slideSets = (json.stimulusSets || []).map(s => ({
    key: s.key, path: s.path, root: 'IncludeSlides',
    slides: (s.stimuli || []).map(x => ({
      name: x.name, condition: x.condition, text: x.text, textRuns: x.textRuns || [],
      pictures: x.pictures || [], sound: x.sound || null, video: x.video || null,
      position: x.position, duration: x.durationMs, fontsize: x.fontSize,
      backGroundColor: x.backGroundColor, expectedResponse: x.expectedResponse || null
    }))
  }));
  m.trials = (json.trials || []).map(t => ({ name: t.name, ops: t.operations || [] }));
  m.blocks = json.blocks || [];
  m.session = json.session || [];
  collectAssets(m, m.source.baseDir);
  return m;
}

/* Find everything openable in whatever was dropped. */
async function scanForParadigms() {
  const found = [];
  for (const entry of STORE.files) {
    const lower = entry.path.toLowerCase();

    if (lower.endsWith('.xml')) {
      let r;
      try { r = await readXmlEntry(entry); } catch (_) { continue; }
      const root = r.doc.documentElement;
      if (!root || root.tagName !== 'ParameterDescriptionFile') continue;
      if (!root.querySelector('Session')) continue;
      found.push({
        entry, kind: 'nnl-xml',
        label: (root.querySelector('Settings>Name')?.textContent || entry.path.split('/').pop().replace(/\.xml$/i, '')).trim(),
        load: () => readXmlPack(entry, r.doc, r.io, r.text)
      });
      continue;
    }

    if (lower.endsWith('.json')) {
      let json;
      try { json = JSON.parse((await readTextEntry(entry)).text); } catch (_) { continue; }
      if (json && json.format === 'fmri-paradigm-neutral') {
        found.push({ entry, kind: 'neutral', label: json.name || entry.path.split('/').pop(), load: async () => readNeutralJson(json, entry) });
        continue;
      }
      if (json && json.settings && json.session) {
        found.push({
          entry, kind: 'paradigm-json',
          label: String(json.settings.name || entry.path.split('/').pop().replace(/\.json$/i, '')),
          load: async () => readParadigmJson(json, entry)
        });
      }
      continue;
    }

    if (/_events\.tsv$/i.test(lower) || (lower.endsWith('.tsv') && /onset/i.test((await peek(entry)) || ''))) {
      const text = (await readTextEntry(entry)).text;
      let sidecar = null;
      const sc = STORE.byPath.get(entry.path.replace(/\.tsv$/i, '.json'));
      if (sc) { try { sidecar = JSON.parse((await readTextEntry(sc)).text); } catch (_) {} }
      const nm = entry.path.split('/').pop().replace(/_events\.tsv$/i, '').replace(/\.tsv$/i, '');
      found.push({ entry, kind: 'bids', label: nm + ' (BIDS events)', load: async () => readBidsEvents(text, nm, sidecar) });
      continue;
    }

    if (lower.endsWith('.1d')) {
      const text = (await readTextEntry(entry)).text;
      const nm = entry.path.split('/').pop().replace(/\.1d$/i, '');
      found.push({
        entry, kind: 'afni', label: nm + ' (AFNI stimulus times)',
        load: async () => {
          const { intervals, runs } = readAfniStimTimes(text, nm);
          const m = modelFromIntervals(intervals, { name: nm, kind: 'afni', label: 'AFNI stimulus times' });
          m.notes.push('AFNI stimulus times are read as local times, that is, relative to the start of the run.');
          if (runs > 1) m.notes.push(`The file contains ${runs} runs. Only the first was imported, because a paradigm describes one run.`);
          return m;
        }
      });
      continue;
    }

    if (lower.endsWith('.txt')) {
      /* An FSL explanatory variable file is three numeric columns and nothing else. */
      const text = (await readTextEntry(entry)).text;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 12);
      if (lines.length && lines.every(l => /^[-+0-9.eE]+([\s,]+[-+0-9.eE]+){1,2}$/.test(l))) {
        const nm = entry.path.split('/').pop().replace(/\.txt$/i, '');
        found.push({
          entry, kind: 'fsl', label: nm + ' (FSL three column EV)',
          load: async () => modelFromIntervals(readFslEv(text, nm), { name: nm, kind: 'fsl', label: 'FSL three column EV' })
        });
      }
    }
  }
  /* An XML package and a JSON copy of the same paradigm often sit in one folder. Both are
     listed, because they are not always in step with each other and the difference matters. */
  found.sort((a, b) => a.label.localeCompare(b.label));
  return found;
}
async function peek(entry) {
  try { return (await readTextEntry(entry)).text.slice(0, 400); } catch (_) { return ''; }
}

let FOUND = [];

async function onFiles(files) {
  $('#loadErr').textContent = '';
  $('#loadNote').textContent = '';
  if (!files.length) { $('#loadErr').textContent = 'No files were found in what you opened.'; return; }
  $('#loadNote').textContent = `Reading ${files.length} files...`;
  STORE = buildStore(files);
  IMG_CACHE.clear();
  for (const u of URL_CACHE.values()) URL.revokeObjectURL(u);
  URL_CACHE.clear();

  try { FOUND = await scanForParadigms(); }
  catch (e) { $('#loadErr').textContent = 'Failed while scanning: ' + e.message; return; }

  if (!FOUND.length) {
    $('#loadErr').textContent =
      'Nothing openable was found.\n\n' +
      'Expected one of:\n' +
      '  a main .xml containing <ParameterDescriptionFile> and <Session>\n' +
      '  a paradigm .json containing "settings" and "session"\n' +
      '  a BIDS _events.tsv with an onset column\n' +
      '  an FSL three column EV .txt, or an AFNI .1D stimulus times file\n\n' +
      'If you picked a single file that references pictures or audio, open the whole folder instead so that the media can be found.';
    return;
  }

  const sel = $('#selParadigm');
  sel.innerHTML = '';
  FOUND.forEach((f, i) => sel.appendChild(el('option', { value: i }, `${f.label}`)));
  $('#topctl').hidden = false;
  $('#btnReload').hidden = false;
  $('#btnExport').hidden = false;
  $('#loader').hidden = true;
  $('#app').hidden = false;
  await loadParadigm(0);
  selectTab('design');
}

async function loadParadigm(idx) {
  const f = FOUND[idx];
  try {
    M = await f.load();
    M.positionSpace = M.positionSpace || [800, 600];
    await preloadImages(M);
    await attachCompanionText(M);
    snapshotModel(M);

    ACTIVE.version = M.versions.includes(M.defaults.version) ? M.defaults.version : (M.versions[0] || M.defaults.version || 'LCD-HD');
    ACTIVE.language = M.languages.includes(M.defaults.language) ? M.defaults.language : (M.languages[0] || M.defaults.language || 'English');
    applyScreenPreset();

    const sv = $('#selVersion'); sv.innerHTML = '';
    (M.versions.length ? M.versions : [ACTIVE.version]).forEach(v => sv.appendChild(el('option', { value: v, selected: v === ACTIVE.version }, v)));
    const sl = $('#selLanguage'); sl.innerHTML = '';
    (M.languages.length ? M.languages : [ACTIVE.language]).forEach(l => sl.appendChild(el('option', { value: l, selected: l === ACTIVE.language }, l)));
    $('#fmtBadge').textContent = M.source.label;

    PB.elapsed = 0; PB.playing = false; PB.mode = 'run';
    $('#btnPlay').textContent = 'Play';
    $('#selPreviewMode').value = 'run';
    $('#selPreviewSlide').hidden = true;
    tabStimuli._set = 0;

    refreshAll();
    if (M.notes.length) toast(M.notes[0]);
  } catch (e) {
    console.error(e);
    $('#loadErr').textContent = 'Could not open that paradigm: ' + e.message;
    $('#loader').hidden = false;
    $('#app').hidden = true;
  }
}

function applyScreenPreset() {
  const p = SCREEN_PRESETS[ACTIVE.version] || DEFAULT_SCREEN;
  SCREEN = p.slice();
  const w = $('#scrW'), h = $('#scrH');
  if (w) w.value = SCREEN[0];
  if (h) h.value = SCREEN[1];
}

/* ======================================================================================
   Wiring
   ====================================================================================== */
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('#btnTheme').textContent = t === 'dark' ? 'Light' : 'Dark';
  try { localStorage.setItem('paradigmStudioTheme', t); } catch (_) {}
  if (M && TL) syncPreview();
}
$('#btnTheme').onclick = () =>
  setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

$('#btnPickDir').onclick = () => $('#fileDir').click();
$('#btnPickFiles').onclick = () => $('#fileAny').click();
$('#btnReload').onclick = () => { $('#fileDir').value = ''; $('#fileDir').click(); };
$('#fileDir').onchange = e => onFiles([...e.target.files]);
$('#fileAny').onchange = e => onFiles([...e.target.files]);
$('#selParadigm').onchange = e => loadParadigm(Number(e.target.value));
$('#selVersion').onchange = e => { ACTIVE.version = e.target.value; applyScreenPreset(); refreshAll(); };
$('#selLanguage').onchange = e => { ACTIVE.language = e.target.value; refreshAll(); };
$('#btnExport').onclick = openExport;
$('#exportCancel').onclick = () => $('#exportDlg').close();
$('#exportZip').onclick = doZip;
$('#exportFolder').onclick = doFolder;

$('#btnPlay').onclick = playPause;
$('#btnRestart').onclick = () => {
  PB.playing = false; cancelAnimationFrame(PB.raf); stopAudio();
  $('#btnPlay').textContent = 'Play';
  seekTo(Math.min(0, TL ? TL.startMs : 0));
};
$('#selSpeed').onchange = e => { PB.speed = Number(e.target.value) || 1; if (PB.audio) PB.audio.playbackRate = Math.min(Math.max(PB.speed, 0.25), 4); };
$('#chkAudio').onchange = e => { PB.audioOn = e.target.checked; if (!PB.audioOn) stopAudio(); };
$('#scrub').oninput = e => { if (PB.playing) playPause(); seekTo(Number(e.target.value)); };
$('#selPreviewMode').onchange = e => {
  PB.mode = e.target.value;
  $('#selPreviewSlide').hidden = PB.mode !== 'slide';
  if (PB.mode === 'slide' && PB.playing) playPause();
  drawPreviewAt(PB.elapsed);
};
$('#selPreviewSlide').onchange = () => drawPreviewAt(PB.elapsed);
$('#scrW').onchange = $('#scrH').onchange = () => {
  SCREEN = [Number($('#scrW').value) || 1, Number($('#scrH').value) || 1];
  sizePreviewCanvas();
  if (curTab === 'stimuli' || curTab === 'calibrate') renderTab(curTab);
};
$('#btnScrReset').onclick = () => { applyScreenPreset(); sizePreviewCanvas(); if (curTab === 'stimuli') renderTab('stimuli'); };

$$('#tabbar button').forEach(b => b.onclick = () => selectTab(b.dataset.tab));

/* Drag and drop, including whole folders. */
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('hot'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', async e => {
  const items = [...(e.dataTransfer.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (items.length) { const files = []; for (const it of items) await walkEntry(it, files); onFiles(files); }
  else onFiles([...e.dataTransfer.files]);
});

/* Keyboard transport, when the focus is not in a field. */
document.addEventListener('keydown', e => {
  if (!M || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); playPause(); }
  else if (e.key === 'ArrowLeft')  { e.preventDefault(); seekTo(PB.elapsed - (e.shiftKey ? 10000 : 1000)); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(PB.elapsed + (e.shiftKey ? 10000 : 1000)); }
  else if (e.key === 'Home') { e.preventDefault(); seekTo(Math.min(0, TL.startMs)); }
});

let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (!M || !TL) return;
    sizePreviewCanvas(); syncPreview();
    if (curTab === 'timeline') renderTab('timeline');
    if (curTab === 'calibrate') { updateFontPreview(); updateImagePreview(); }
  }, 140);
});
window.addEventListener('beforeunload', e => {
  if (M && M._edited) { e.preventDefault(); e.returnValue = ''; }
});

$('#btnDemo').onclick = openDemo;
$('#btnNew').onclick = openNewParadigm;
$('#pickCancel').onclick = () => $('#pickDlg').close();

/* The format guide is readable before anything is opened. */
$('#btnInfoOnly').onclick = () => selectTab('info');
$('#btnHome').onclick = backToStart;

try { setTheme(localStorage.getItem('paradigmStudioTheme') || 'dark'); } catch (_) { setTheme('dark'); }
