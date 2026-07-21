/* ======================================================================================
   4. FORMAT READERS

   Each reader turns one on disk representation into the neutral model. Readers keep the
   original bytes of every file they consume, together with a per file "dirty" flag. On
   export, a file that was never edited is written back byte for byte rather than being
   regenerated, so opening a paradigm and saving it again cannot perturb formatting,
   comments, indentation or encoding.
   ====================================================================================== */

/* Which files need regenerating on export.

   Rather than asking every control in the interface to declare what it touched, the parts
   of the model that map one to one onto a file are fingerprinted when the paradigm is
   loaded and compared again at export time. A file whose fingerprint is unchanged is
   written back from its original bytes, so editing a volume count rewrites the main file
   and leaves the fourteen description files and twenty stimulus files untouched. */
function markDirty(model, area) {
  if (!model) return;
  model._edited = true;
}
function fingerprintModel(m) {
  const fp = { slides: {}, desc: {}, defaults: {} };
  fp.main = JSON.stringify({
    name: m.name, acq: m.acq, instruction: m.instruction, variables: m.variables,
    defaults: m.defaults, positions: m.positions, colors: m.colors, languages: m.languages, versions: m.versions,
    bold: m.bold, blocks: m.blocks, session: m.session, sessionName: m.sessionName,
    slidePaths: m.slideSets.map(s => [s.path, s.key]),
    trialsPath: m.raw.trialsFile && m.raw.trialsFile.path,
    descPaths: m.descriptions.map(d => d.path),
    defaultsPaths: (m.raw.defaultsFiles || []).map(d => [d.version, d.path])
  });
  fp.trials = JSON.stringify(m.trials);
  for (const set of m.slideSets) fp.slides[set.path] = JSON.stringify(set.slides);
  for (const d of m.descriptions) fp.desc[d.language] = JSON.stringify(d.text ?? '');
  for (const d of (m.raw.defaultsFiles || [])) fp.defaults[d.version] = JSON.stringify([d.fontSize, d.defaultPicture, d.extra]);
  return fp;
}
function snapshotModel(m) { m._snap = fingerprintModel(m); }
function changedSince(m, path) {
  if (!m._snap) return true;
  const now = fingerprintModel(m);
  const [kind, key] = path;
  if (kind === 'main' || kind === 'trials') return now[kind] !== m._snap[kind];
  return now[kind][key] !== m._snap[kind][key];
}
const isDirty = (model, area) => !!model._edited;

/* ---------------------------------------------------------------------------
   4a. Legacy paradigm folder, XML
   Main .xml with <ParameterDescriptionFile> and <Session>, plus included
   trials, per version and per language slide files, per version defaults
   files and per language description files.
   --------------------------------------------------------------------------- */

/* Capture the document order of a node's children, including comments, so that a file can
   be rebuilt without shuffling elements. This matters: a <position> element sitting
   between two <Picture> elements is not decorative, moving it changes which picture the
   position applies to. */
function childOrder(node) {
  const order = [];
  for (const n of node.childNodes) {
    if (n.nodeType === 1) order.push({ t: 'el', tag: n.tagName });
    else if (n.nodeType === 8) order.push({ t: 'comment', text: n.nodeValue });
  }
  return order;
}
function topComments(node) {
  /* Comments at the top level of the main file, keyed by the tag they precede. */
  const out = [];
  let pending = [];
  for (const n of node.childNodes) {
    if (n.nodeType === 8) pending.push(n.nodeValue);
    else if (n.nodeType === 1) { if (pending.length) { out.push({ before: n.tagName, comments: pending }); pending = []; } }
  }
  if (pending.length) out.push({ before: null, comments: pending });
  return out;
}

function parseXmlSlide(s) {
  const known = ['name', 'condition', 'text', 'Picture', 'Sound', 'Video', 'position',
                 'fontsize', 'FontSize', 'duration', 'expectedResponse', 'backGroundColor',
                 'color', 'font', 'width', 'clear'];
  const er = cNodes(s, 'expectedResponse')[0];
  const textNodes = cNodes(s, 'text');

  /* A slide may hold several items, and a position may be given for each of them. The
     position element binds to the item it follows, which is why the element order matters:
     a picture, then a position, then a second picture places only the first picture. A
     position appearing before any item is the default for the whole slide. */
  const pictures = [];
  let slidePosition = null, lastItem = null;
  for (const c of s.children) {
    if (c.tagName === 'Picture') { lastItem = { value: c.textContent.trim() }; pictures.push(lastItem); }
    else if (c.tagName === 'text') { lastItem = { _text: true }; }
    else if (c.tagName === 'position') {
      const v = c.textContent.trim();
      /* Bound to the picture it follows. Anything else, including a position that follows
         text or precedes every item, is the default for the slide. */
      if (lastItem && !lastItem._text) lastItem.position = v;
      else slidePosition = v;
    }
  }

  return {
    name: cTrim(s, 'name') || '',
    condition: cTrim(s, 'condition'),
    text: textNodes.length ? textNodes[0].textContent : null,
    pictures,
    sound: cTrim(s, 'Sound') != null ? { value: cTrim(s, 'Sound') } : null,
    video: cTrim(s, 'Video') != null ? { value: cTrim(s, 'Video') } : null,
    position: slidePosition,
    duration: cTrim(s, 'duration'),
    fontsize: cTrim(s, 'fontsize') ?? cTrim(s, 'FontSize'),
    backGroundColor: cTrim(s, 'backGroundColor'),
    color: cTrim(s, 'color'),
    expectedResponse: er ? { keys: cNodes(er, 'key').map(k => k.textContent.trim()), raw: er.innerHTML.trim() } : null,
    _order: childOrder(s),
    _extra: [...s.children].filter(c => !known.includes(c.tagName)).map(c => c.outerHTML)
  };
}

function parseXmlTrial(t) {
  const ops = [];
  for (const c of t.children) {
    const tg = c.tagName;
    if (tg === 'name') continue;
    if (tg === 'show') {
      ops.push({
        type: 'show',
        item: cTrim(c, 'item') || '',
        duration: cTrim(c, 'duration'),
        overlap: cNodes(c, 'overlap').length ? /true/i.test(cText(c, 'overlap') || '') : false,
        abortion: cNodes(c, 'abortion').length ? /true/i.test(cText(c, 'abortion') || '') : false,
        condition: cTrim(c, 'condition')
      });
    }
    else if (tg === 'wait')      ops.push({ type: 'wait', ms: c.textContent.trim() });
    else if (tg === 'clear')     ops.push({ type: 'clear', ms: c.textContent.trim() });
    else if (tg === 'register')  ops.push({ type: 'register', keys: cNodes(c, 'key').map(k => k.textContent.trim()), number: cTrim(c, 'number') });
    else if (tg === 'marker')    ops.push({ type: 'marker', value: c.textContent.trim() });
    else if (tg === 'condition') ops.push({ type: 'condition', value: c.textContent.trim() });
    else ops.push({ type: 'raw', xml: c.outerHTML });
  }
  return { name: cTrim(t, 'name') || '', ops, _order: childOrder(t) };
}

const LANG_CODE = {
  English: 'en', French: 'fr', Spanish: 'es', Italian: 'it', German: 'de', Turkish: 'tr',
  Polish: 'pl', Japanese: 'ja', Chinese: 'zh', Dutch: 'nl', Danish: 'da', Norwegian: 'no',
  Swedish: 'sv', Russian: 'ru', Lithuanian: 'lt', Portuguese: 'pt', Arabic: 'ar'
};

async function readXmlPack(mainEntry, doc, mainIO, mainText) {
  const root = doc.documentElement;
  const baseDir = mainEntry.path.includes('/') ? mainEntry.path.slice(0, mainEntry.path.lastIndexOf('/')) : '';
  const m = emptyModel();
  m.source = { kind: 'nnl-xml', label: 'Paradigm folder (XML)', baseDir, mainPath: mainEntry.path };
  m.raw = { mainIO, mainText, topComments: topComments(root) };

  for (const c of (root.querySelector('Variables') ? root.querySelector('Variables').children : []))
    m.variables.push({ key: c.tagName, value: c.textContent.trim() });

  const S = root.querySelector('Settings');
  m.name = (cTrim(S, 'Name') || mainEntry.path.split('/').pop().replace(/\.xml$/i, '')).trim();
  m.acq = {
    slices:   cTrim(S, 'Slices'),
    trMs:     cTrim(S, 'TimeToRepeat'),
    ipiMs:    cTrim(S, 'InterPulseInterval'),
    avgBlockMs: cTrim(S, 'AverageBlockLength'),
    volumes:  cTrim(S, 'Volumes')
  };
  m.instruction = cText(S, 'Instruction') || '';

  const D = root.querySelector('Defaults');
  if (D) {
    m.defaults.bg = cTrim(D, 'BackGroundColor') || 'Black';
    m.defaults.fg = cTrim(D, 'ForeGroundColor') || 'White';
    m.defaults.defaultPosition = cTrim(D, 'DefaultPosition') || 'MidPos';
    m.defaults.language = cTrim(D, 'Language') || '';
    m.defaults.version  = cTrim(D, 'Version') || '';
  }
  /* Colours may be defined in the file with explicit RGB components. */
  m.colors = cNodes(root, 'Color').map(c => ({
    name: cTrim(c, 'name') || '',
    r: toNum(cTrim(c, 'valueR')) ?? 0, g: toNum(cTrim(c, 'valueG')) ?? 0, b: toNum(cTrim(c, 'valueB')) ?? 0
  })).filter(c => c.name);

  m.positions  = cNodes(root, 'Position').map(p => ({
    name: cTrim(p, 'name') || '', horizontal: cTrim(p, 'horizontal') || 'center', vertical: cTrim(p, 'vertical') || 'center'
  }));
  m.languages  = cNodes(root.querySelector('Languages') || root, 'Language').map(l => l.textContent.trim());
  m.versions   = cNodes(root.querySelector('Versions')  || root, 'Version').map(v => v.textContent.trim());

  const B = root.querySelector('BOLDSettings');
  if (B) {
    const pr = B.querySelector('Process');
    m.bold.processRaw = pr ? pr.outerHTML : '';
    for (const c of B.querySelectorAll('Contrasts>Contrast'))
      m.bold.contrasts.push({ name: c.getAttribute('name') || '', weight: c.textContent.trim() });
  }

  /* A description may be written straight into Settings as well as included per language. */
  if (S && cNodes(S, 'Description').length)
    m.descriptions.push({ language: m.defaults.language || 'English', text: cText(S, 'Description') || '', inline: true });

  /* Description includes live inside <Settings>. */
  for (const inc of (S ? cNodes(S, 'Include') : [])) {
    const lang = inc.getAttribute('Language');
    if (!lang) continue;
    const path = inc.textContent.trim();
    const fe = resolvePath(baseDir, path);
    let text = '', io = null, origText = null;
    if (fe) {
      try { const r = await readXmlEntry(fe); text = r.doc.querySelector('Description')?.textContent ?? ''; io = r.io; origText = r.text; }
      catch (_) {}
    }
    m.descriptions.push({ language: lang, path, text, io, origText, missing: !fe });
  }

  /* Per version defaults files live inside <Defaults>. */
  m.raw.defaultsFiles = [];
  for (const inc of (D ? cNodes(D, 'Include') : [])) {
    const ver = inc.getAttribute('Version');
    if (!ver) continue;
    const path = inc.textContent.trim();
    const fe = resolvePath(baseDir, path);
    let fontSize = '', defaultPicture = '', extra = [], io = null, origText = null;
    if (fe) {
      try {
        const r = await readXmlEntry(fe);
        fontSize = r.doc.querySelector('FontSize')?.textContent?.trim() || '';
        defaultPicture = r.doc.querySelector('DefaultPicture')?.textContent?.trim() || '';
        extra = [...r.doc.documentElement.children].filter(c => !['FontSize', 'DefaultPicture'].includes(c.tagName)).map(c => c.outerHTML);
        io = r.io; origText = r.text;
      } catch (_) {}
    }
    m.raw.defaultsFiles.push({ version: ver, path, fontSize, defaultPicture, extra, io, origText, missing: !fe });
    if (fontSize) m.fontSizeByVersion[ver] = toNum(fontSize);
    if (defaultPicture) m.defaultPictureByVersion[ver] = defaultPicture;
  }

  /* Top level includes carry the stimulus sets and the trials file. Original paths are
     retained verbatim so that a shared stimulus set keeps its own name on export instead
     of being renamed after the paradigm. */
  for (const inc of [...root.children].filter(c => c.tagName === 'Include')) {
    const ver = inc.getAttribute('Version'), lang = inc.getAttribute('Language');
    const path = inc.textContent.trim();
    const fe = resolvePath(baseDir, path);
    const key = ver ? { kind: 'version', version: ver } : lang ? { kind: 'language', language: lang } : { kind: 'none' };
    if (!fe) { m.slideSets.push({ key, path, root: 'IncludeSlides', slides: [], missing: true }); continue; }
    let r;
    try { r = await readXmlEntry(fe); } catch (e) { m.notes.push(`Could not read ${path}: ${e.message}`); continue; }
    const rt = r.doc.documentElement.tagName;
    if (rt === 'IncludeTrials') {
      m.trials = cNodes(r.doc.documentElement, 'Trial').map(parseXmlTrial);
      m.raw.trialsFile = { path, io: r.io, origText: r.text, order: childOrder(r.doc.documentElement) };
    } else if (rt === 'IncludeSlides' || rt === 'Include') {
      m.slideSets.push({
        key, path, root: rt,
        slides: cNodes(r.doc.documentElement, 'Slide').map(parseXmlSlide),
        io: r.io, origText: r.text, order: childOrder(r.doc.documentElement)
      });
    }
  }
  if (!m.raw.trialsFile) m.raw.trialsFile = { path: './' + m.name.replace(/ /g, '_') + '_trials.xml', io: mainIO, origText: null };

  m.blocks = cNodes(root, 'Block').map(b => ({
    name: cTrim(b, 'name') || '',
    condition: cTrim(b, 'condition') ?? '',
    trials: cNodes(b, 'trials').map(t => t.textContent.trim()),
    repetitions: cTrim(b, 'repetitions') ?? '1',
    order: cTrim(b, 'order') ?? '0',
    _order: childOrder(b)
  }));

  const sN = root.querySelector('Session');
  m.sessionName = sN ? cTrim(sN, 'name') : null;
  m.session = sN ? [...sN.children]
    .filter(c => c.tagName === 'runtrial' || c.tagName === 'runblock')
    .map(c => ({ kind: c.tagName === 'runtrial' ? 'trial' : 'block', ref: c.textContent.trim() })) : [];

  collectAssets(m, baseDir);
  return m;
}

/* ---------------------------------------------------------------------------
   4b. Paradigm JSON, both known dialects

   Dialect A, written by the current authoring application: blocks and trials carry
   UUIDs, session.run is a flat list of those UUIDs, stimulus sets are keyed by the
   composite "Language-Version", and stimulus fields are structured objects.

   Dialect B, produced when an older XML paradigm is carried forward: blocks and trials
   are referenced by name, the session is split into separate runblock and runTrial
   lists that must be re-interleaved by their xmlPosition, stimulus sets are keyed by a
   single version or language token, and stimulus fields mirror the XML tag names and
   may be a string, a list, an object or null for the same field in the same file.
   --------------------------------------------------------------------------- */

const asArray = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const valueOf  = v => (v == null ? null : typeof v === 'object' ? (v.value ?? null) : v);

function normJsonSlide(raw) {
  /* Accepts both dialects. Field names differ only in case and in nesting depth. */
  const pics = [];
  for (const p of asArray(raw.picture ?? raw.Picture)) {
    const v = valueOf(p);
    if (v == null || v === '') continue;
    pics.push({
      value: String(v),
      width:  typeof p === 'object' ? toNum(p.width)  : null,
      height: typeof p === 'object' ? toNum(p.height) : null,
      horizontal: typeof p === 'object' ? (p.horizontal ?? null) : null,
      vertical:   typeof p === 'object' ? (p.vertical   ?? null) : null
    });
  }
  const textRuns = [];
  for (const t of asArray(raw.text)) {
    if (t == null) continue;
    if (typeof t === 'string') { textRuns.push({ value: t }); continue; }
    if (t.value == null) continue;
    textRuns.push({
      value: String(t.value), color: t.color ?? null, fontFamily: t.fontFamily ?? null,
      fontSize: toNum(t.fontSize), horizontal: t.horizontal ?? null, vertical: t.vertical ?? null
    });
  }
  const snd = raw.sound ?? raw.Sound;
  const vid = raw.video ?? raw.Video;
  const er  = raw.expectedResponse;
  return {
    name: String(raw.name ?? ''),
    condition: raw.condition == null ? null : String(raw.condition),
    text: textRuns.length ? textRuns.map(r => r.value).join('\n') : null,
    textRuns,
    pictures: pics,
    sound: valueOf(snd) ? { value: String(valueOf(snd)) } : null,
    video: valueOf(vid) ? { value: String(valueOf(vid)) } : null,
    position: raw.position ?? null,
    duration: raw.duration == null ? null : String(raw.duration),
    fontsize: toNum(raw.fontSize ?? raw.FontSize),
    backGroundColor: raw.backGroundColor ?? null,
    color: raw.color ?? null,
    expectedResponse: er ? { keys: asArray(er.key).map(String), count: toNum(er.count) } : null,
    clear: raw.clear === true,
    _json: raw
  };
}

function normJsonTrial(raw, idToName) {
  const ops = [];
  if (raw.condition != null) ops.push({ type: 'condition', value: String(raw.condition) });
  for (const s of asArray(raw.show)) {
    if (!s) continue;
    ops.push({
      type: 'show',
      item: String(s.item ?? ''),
      duration: s.duration == null ? null : String(s.duration),
      overlap: s.overlap === true
    });
  }
  for (const w of asArray(raw.wait)) {
    const v = valueOf(w);
    if (v != null && v !== '') ops.push({ type: 'wait', ms: String(v) });
  }
  if (raw.clear != null && raw.clear !== false) {
    const v = valueOf(raw.clear);
    ops.push({ type: 'clear', ms: (v === true || v == null) ? '' : String(v) });
  }
  const keys = asArray(raw.register?.key).map(String).filter(Boolean);
  if (keys.length) ops.push({ type: 'register', keys });
  return { name: String(raw.name ?? ''), id: raw.id ?? null, ops, _json: raw };
}

/* Split a dialect A stimulus set key such as "English-LCD-HD" into its language and
   version parts. Both parts may themselves contain a hyphen, so the split is resolved
   against the declared language and version lists rather than by position. */
function splitCompositeKey(key, languages, versions) {
  for (const l of languages) {
    if (key === l) return { kind: 'language', language: l };
    if (key.startsWith(l + '-')) {
      const rest = key.slice(l.length + 1);
      if (versions.includes(rest)) return { kind: 'composite', language: l, version: rest };
    }
  }
  if (versions.includes(key)) return { kind: 'version', version: key };
  if (languages.includes(key)) return { kind: 'language', language: key };
  return { kind: 'none', label: key };
}

function readParadigmJson(json, entry) {
  const baseDir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
  const m = emptyModel();
  const st = json.settings || {};
  const dialectA = !!(json.session && Array.isArray(json.session.run));
  m.source = {
    kind: dialectA ? 'nnl-json-a' : 'nnl-json-b',
    label: `Paradigm JSON (${dialectA ? 'identifier' : 'name'} referenced)`,
    baseDir, mainPath: entry.path
  };
  m.raw = { json, dialectA, appVersion: json.aktivaVersion || null };

  m.name = String(st.name ?? entry.path.split('/').pop().replace(/\.json$/i, ''));
  m.acq = {
    slices: st.slices == null ? null : String(st.slices),
    trMs: st.timeToRepeat == null ? null : String(st.timeToRepeat),
    ipiMs: st.interPulseInterval == null ? null : String(st.interPulseInterval),
    avgBlockMs: st.averageBlockLength == null ? null : String(st.averageBlockLength),
    volumes: st.volumes == null ? null : String(st.volumes)
  };
  for (const [k, v] of Object.entries(json.variables || {})) m.variables.push({ key: k, value: String(v) });
  m.versions  = (json.versions  || []).map(String);
  m.languages = (json.languages || []).map(String);
  m.positions = (json.position || json.positions || []).map(p => ({
    name: String(p.name ?? ''), horizontal: String(p.horizontal ?? 'center'), vertical: String(p.vertical ?? 'center')
  }));
  const df = json.defaults || {};
  m.defaults = {
    bg: df.backGroundColor || 'Black',
    fg: df.foreGroundColor || 'White',
    font: df.font || 'Arial',
    defaultPosition: df.defaultPicturePosition || df.defaultTextPosition || 'MidPos',
    defaultTextPosition: df.defaultTextPosition || null,
    defaultPicturePosition: df.defaultPicturePosition || null,
    version: df.version || m.versions[0] || '',
    language: df.language || m.languages[0] || ''
  };
  for (const [v, o] of Object.entries(df.versions || {})) {
    const fs = toNum(o && o.fontSize);
    if (fs != null) m.fontSizeByVersion[v] = fs;
  }

  /* Descriptions are held inline, keyed by language. */
  for (const [lang, text] of Object.entries(st.description || {}))
    m.descriptions.push({ language: lang, text: String(text), inline: true });

  /* BOLD settings. The contrast container is an object rather than a list when there is
     exactly one contrast, which is a common shape trap in this file. */
  const bs = json.BOLDSettings || {};
  for (const c of asArray(bs.contrasts?.contrast)) {
    if (!c) continue;
    m.bold.contrasts.push({ name: String(c.attributes?.name ?? c.name ?? ''), weight: String(c.value ?? '') });
  }
  m.bold.process = bs.process || null;

  /* Stimulus sets. */
  for (const [key, arr] of Object.entries(json.slide || {})) {
    const k = dialectA ? splitCompositeKey(key, m.languages, m.versions)
                       : splitCompositeKey(key, m.languages, m.versions);
    m.slideSets.push({ key: k, path: key, root: 'json', slides: asArray(arr).map(normJsonSlide), jsonKey: key });
  }

  /* Trials and blocks. */
  m.trials = asArray(json.trial).map(t => normJsonTrial(t));
  const trialById = new Map(m.trials.filter(t => t.id).map(t => [t.id, t]));

  m.blocks = asArray(json.blocks).map(b => ({
    name: String(b.name ?? ''),
    id: b.id ?? null,
    condition: b.condition == null ? '' : String(b.condition),
    /* Blocks reference their trials by identifier in dialect A and by name in dialect B. */
    trials: asArray(b.trials).map(t => (trialById.get(t) ? trialById.get(t).name : String(t))),
    repetitions: b.repetitions == null ? '1' : String(b.repetitions),
    order: b.order == null ? '0' : String(b.order)
  }));
  const blockById = new Map(m.blocks.filter(b => b.id).map(b => [b.id, b]));

  /* Session order. */
  const sess = json.session || {};
  if (dialectA) {
    for (const ref of sess.run) {
      if (blockById.has(ref)) m.session.push({ kind: 'block', ref: blockById.get(ref).name });
      else if (trialById.has(ref)) m.session.push({ kind: 'trial', ref: trialById.get(ref).name });
      else m.session.push({ kind: 'trial', ref: String(ref), unresolved: true });
    }
  } else {
    /* Re-interleave the two parallel lists using the recorded original position. */
    const steps = [];
    for (const b of asArray(sess.runblock ?? sess.runBlock))
      steps.push({ pos: toNum(b.xmlPosition) ?? steps.length, kind: 'block', ref: String(valueOf(b)) });
    for (const t of asArray(sess.runTrial ?? sess.runtrial))
      steps.push({ pos: toNum(t.xmlPosition) ?? steps.length, kind: 'trial', ref: String(valueOf(t)) });
    steps.sort((a, b) => a.pos - b.pos);
    m.session = steps.map(s => ({ kind: s.kind, ref: s.ref }));
  }

  collectAssets(m, baseDir);
  return m;
}

/* Every non definition file that sits under the paradigm folder is treated as an asset and
   carried through unchanged on export. */
function collectAssets(m, baseDir) {
  if (!STORE) return;
  const bd = baseDir ? baseDir + '/' : '';
  for (const f of STORE.files) {
    if (!f.path.startsWith(bd)) continue;
    if (/\.(xml|json)$/i.test(f.path)) continue;
    m.assets.push({ rel: f.path.slice(bd.length), file: f.file, size: f.size });
  }
}

/* ---------------------------------------------------------------------------
   4c. Open interchange formats

   These carry timing only. There is no stimulus content, no display geometry and no
   acquisition metadata beyond what the user supplies, so a paradigm reconstructed from
   one of them is a timing skeleton: correct in its onsets and durations, empty in its
   stimuli. That limitation is surfaced in the interface rather than hidden.
   --------------------------------------------------------------------------- */

/* Build a model from a list of {name, onset(ms), duration(ms)} intervals. */
function modelFromIntervals(intervals, opts = {}) {
  const m = emptyModel();
  m.name = opts.name || 'Imported timing';
  /* Some timing formats record onsets only, leaving the duration to the basis function in
     the analysis. Those events would be invisible here and the design would look empty, so
     they are given a placeholder length and the substitution is stated rather than
     absorbed. The placeholder is one repetition time where that is known. */
  const zeroDur = intervals.filter(i => !(i.duration > 0)).length;
  if (zeroDur) {
    const placeholder = opts.trMs || 1000;
    intervals = intervals.map(i => (i.duration > 0 ? i : { ...i, duration: placeholder, _placeholder: true }));
    m.notes.push(`The source recorded ${zeroDur === intervals.length ? 'no durations at all' : zeroDur + ' events with no duration'}. Each has been given a placeholder of ${placeholder} ms so that the design is visible. Set the real durations before using this paradigm for anything.`);
    m._placeholderDurations = zeroDur;
  }
  m.source = { kind: opts.kind || 'events', label: opts.label || 'Imported timing', baseDir: opts.baseDir || '' };
  m.acq.trMs = opts.trMs != null ? String(opts.trMs) : null;
  m.versions = ['LCD-HD']; m.languages = ['English'];
  m.defaults.version = 'LCD-HD'; m.defaults.language = 'English';
  m.positions = [{ name: 'MidPos', horizontal: 'center', vertical: 'center' }];

  const sorted = intervals.slice().sort((a, b) => a.onset - b.onset);
  const names = [...new Set(sorted.map(i => i.name))];
  /* Condition 0 is reserved for baseline. Anything explicitly named rest or baseline maps
     to 0, everything else gets a positive index in order of first appearance. */
  const condOf = {};
  let next = 1;
  for (const n of names) condOf[n] = /^(rest|baseline|fixation|control|off)$/i.test(n) ? 0 : next++;

  const slides = [];
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) continue; seen.add(n);
    slides.push({ name: n, text: n, pictures: [], sound: null, video: null, duration: null, condition: String(condOf[n]) });
  }
  slides.push({ name: 'Start', text: 'Starting soon', pictures: [], sound: null, video: null });
  m.slideSets = [{ key: { kind: 'none' }, path: 'inline', root: 'IncludeSlides', slides }];

  m.trials.push({ name: 'Start', ops: [{ type: 'show', item: 'Start', duration: null, overlap: true }, { type: 'register', keys: ['s'] }] });
  m.session.push({ kind: 'trial', ref: 'Start' });

  /* Walk the sorted intervals, inserting an explicit gap trial wherever the design leaves
     the screen empty, so that the reconstructed total length equals the original. */
  let cursor = 0, gapN = 0;
  for (const iv of sorted) {
    if (iv.onset - cursor > 0.5) {
      const gap = iv.onset - cursor;
      const nm = `Gap${++gapN}`;
      m.trials.push({ name: nm, ops: [{ type: 'condition', value: '0' }, { type: 'wait', ms: String(Math.round(gap)) }] });
      m.session.push({ kind: 'trial', ref: nm });
      cursor = iv.onset;
    }
    const tn = `${iv.name}_${Math.round(iv.onset)}`;
    m.trials.push({
      name: tn,
      ops: [{ type: 'condition', value: String(condOf[iv.name]) },
            { type: 'show', item: iv.name, duration: String(Math.round(iv.duration)), overlap: false }]
    });
    m.session.push({ kind: 'trial', ref: tn });
    cursor = iv.onset + iv.duration;
  }
  if (opts.trMs && opts.volumes) m.acq.volumes = String(opts.volumes);
  else if (opts.trMs) m.acq.volumes = String(Math.round(cursor / opts.trMs));
  m.notes.push('Reconstructed from a timing only file. Stimulus content, display geometry and acquisition parameters other than those shown were not present in the source.');
  return m;
}

function readBidsEvents(text, name, sidecar) {
  const rows = parseDelimited(text, '\t');
  if (!rows.length) throw new Error('The events file is empty.');
  const hdr = rows[0].map(h => h.trim());
  const iOn = hdr.indexOf('onset'), iDur = hdr.indexOf('duration');
  if (iOn < 0) throw new Error('A BIDS events file must have an "onset" column. Columns found: ' + hdr.join(', '));
  const iType = ['trial_type', 'condition', 'trialtype'].map(c => hdr.indexOf(c)).find(i => i >= 0) ?? -1;
  const intervals = [];
  for (let r = 1; r < rows.length; r++) {
    const on = toNum(rows[r][iOn]);
    if (on == null) continue;
    const du = iDur >= 0 ? toNum(rows[r][iDur]) : null;
    const ty = iType >= 0 ? (rows[r][iType] || '').trim() : '';
    intervals.push({ name: ty && ty !== 'n/a' ? ty : 'event', onset: on * 1000, duration: (du == null || isNaN(du) ? 0 : du) * 1000 });
  }
  if (!intervals.length) throw new Error('No usable rows were found in the events file.');
  const m = modelFromIntervals(intervals, { name, kind: 'bids', label: 'BIDS events.tsv', trMs: sidecar?.RepetitionTime ? sidecar.RepetitionTime * 1000 : null });
  m.notes.push('BIDS onsets are in seconds and are measured from the first volume of the run. They have been converted to milliseconds relative to the scanner trigger.');
  return m;
}

function readFslEv(text, name) {
  const intervals = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split(/[\s,]+/).map(toNum);
    if (parts[0] == null) continue;
    intervals.push({ name, onset: parts[0] * 1000, duration: (parts[1] ?? 0) * 1000, weight: parts[2] ?? 1 });
  }
  if (!intervals.length) throw new Error('No rows of the form "onset duration weight" were found.');
  return intervals;
}

function readAfniStimTimes(text, name) {
  /* One row per run, times in seconds. A lone asterisk marks a run with no events.
     Only the first run is imported, because the neutral model describes a single run. */
  const rows = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!rows.length) throw new Error('The stimulus times file is empty.');
  const first = rows.find(r => r !== '*') || '';
  const intervals = [];
  for (const tok of first.split(/\s+/)) {
    if (!tok || tok === '*') continue;
    /* Duration modulated form is onset:duration. Amplitude modulated forms use *. */
    const mm = tok.match(/^([\d.+-eE]+)(?::([\d.+-eE]+))?/);
    if (!mm) continue;
    const on = toNum(mm[1]); if (on == null) continue;
    intervals.push({ name, onset: on * 1000, duration: (toNum(mm[2]) ?? 0) * 1000 });
  }
  if (!intervals.length) throw new Error('No onset times were found in the first run row.');
  return { intervals, runs: rows.length };
}
