/* ======================================================================================
   3. THE NEUTRAL PARADIGM MODEL

   Every supported format is read into this one structure and written back out of it.
   The canonical time unit throughout is the MILLISECOND, held as a number, because the
   presentation formats in scope are millisecond based and integer milliseconds survive
   arithmetic exactly at the durations involved. Conversion to the seconds used by the
   analysis formats happens only at the moment of writing.

   The canonical time ORIGIN is the scanner trigger, that is, the first volume of the
   run. Anything shown before the trigger, such as an instruction screen or a "starting
   soon" hold, carries a negative onset and contributes no scan time. This is the single
   most common source of silent timing corruption between tools, so it is made explicit
   here rather than left implicit.

   model = {
     name, source:{kind,label,baseDir}, acq:{trMs,volumes,slices,ipiMs,avgBlockMs},
     variables:[{key,value}], versions:[], languages:[], positions:[{name,horizontal,vertical}],
     defaults:{...}, fontSizeByVersion:{}, defaultPictureByVersion:{},
     slideSets:[{key,path,root,slides:[Slide],io}],
     trials:[{name,ops:[Op]}], blocks:[{name,condition,order,repetitions,trials:[]}],
     session:[{kind,ref}], bold:{contrasts,processRaw}, descriptions:[], assets:[], raw:{}
   }
   ====================================================================================== */

function emptyModel() {
  return {
    name: 'Untitled paradigm',
    source: { kind: 'neutral', label: 'Neutral', baseDir: '', files: [] },
    acq: { trMs: null, volumes: null, slices: null, ipiMs: null, avgBlockMs: null },
    variables: [], versions: [], languages: [], positions: [],
    defaults: { bg: 'Black', fg: 'White', font: 'Arial', defaultPosition: 'MidPos', version: '', language: '' },
    fontSizeByVersion: {}, defaultPictureByVersion: {},
    slideSets: [], trials: [], blocks: [], session: [],
    bold: { contrasts: [], processRaw: '' },
    descriptions: [], assets: [], notes: [], raw: {}
  };
}

/* ---------- variable substitution ----------
   Values may reference other variables, so substitution iterates to a fixed point with a
   hard cap. A reference that never resolves is returned unchanged so that validation can
   report it rather than silently turning into zero. */
function varTable(model) {
  const t = {};
  for (const v of model.variables) t[v.key] = v.value;
  return t;
}
function substVars(str, table) {
  if (str == null) return null;
  let s = String(str).trim();
  for (let pass = 0; pass < 6 && s.includes('$'); pass++) {
    const next = s.replace(/\$([A-Za-z_]\w*)/g, (m, n) => (n in table ? String(table[n]) : m));
    if (next === s) break;
    s = next;
  }
  return s;
}
function resolveNum(str, table) {
  const s = substVars(str, table);
  if (s == null || s === '') return null;
  return toNum(s);
}

/* ---------- slide resolution ----------
   A paradigm carries several parallel stimulus sets: one per display version holding the
   pictures at that resolution, one per language holding the text, and sometimes a shared
   base set. The set that applies to a given (version, language) pair is the merge of all
   three. More specific sets win, so the merge is applied least specific first. */
function resolveSlides(model, version, language) {
  const map = new Map();
  const rank = set => {
    const k = set.key || {};
    if (k.kind === 'none') return 0;
    if (k.kind === 'language') return k.language === language ? 1 : -1;
    if (k.kind === 'version') return k.version === version ? 2 : -1;
    if (k.kind === 'composite') return (k.version === version && k.language === language) ? 3 : -1;
    return -1;
  };
  const applicable = model.slideSets
    .map(s => ({ set: s, r: rank(s) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r);

  for (const { set } of applicable) {
    for (const sl of set.slides) {
      const cur = map.get(sl.name) || { name: sl.name, _sets: [] };
      /* Only overwrite with values that are actually present. A language set that carries
         no picture must not erase the picture supplied by the version set. */
      for (const [k, v] of Object.entries(sl)) {
        if (v == null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (k === '_sets') continue;
        cur[k] = v;
      }
      cur._sets.push(set.key);
      map.set(sl.name, cur);
    }
  }
  return map;
}

/* ---------- durations ---------- */
function trialOps(trial) { return (trial && trial.ops) || []; }
function trialIsTrigger(trial) { return trialOps(trial).some(o => o.type === 'register' && (o.keys || []).length); }

/* How much of the run clock one show consumes.

   Two rules from the syntax description govern this, and both differ from the naive
   reading. A duration of zero, or no duration at all, means the stimulus is presented
   until the onset of the next stimulus, so it advances the clock by nothing. An overlap of
   true means the next command is processed immediately, allowing overlapping presentation,
   so it also advances the clock by nothing even when a duration is given. Treating either
   as blocking inflates the computed run length. */
function showAdvanceMs(op, slides, table) {
  let d = resolveNum(op.duration, table);
  if (d == null) {
    const sl = slides.get(op.item);
    d = sl ? resolveNum(sl.duration, table) : null;
  }
  const holdUntilNext = (d == null || d <= 0);
  return { advance: (op.overlap || holdUntilNext) ? 0 : d, declared: d, holdUntilNext };
}

function trialDuration(model, trial, slides, table) {
  if (!trial) return { ms: 0, indefinite: false, missing: true };
  let ms = 0, indefinite = false;
  for (const op of trialOps(trial)) {
    if (op.type === 'show') {
      const { advance, holdUntilNext } = showAdvanceMs(op, slides, table);
      ms += advance;
      if (holdUntilNext) indefinite = true;
    } else if (op.type === 'wait' || op.type === 'clear') {
      ms += resolveNum(op.ms, table) || 0;
    }
  }
  return { ms, indefinite, missing: false };
}

/* Which condition an event belongs to.

   A block is the unit that carries a condition: it has exactly one, and its trials are the
   repeating stimulus and blank pair inside it. So when a trial runs inside a block, the
   block's condition governs. A trial's own condition applies only when the session runs
   that trial directly, which is how the rest periods between blocks are written.

   This distinction is not academic. The JSON copies of these paradigms carry an explicit
   condition of 0 on every trial, written by whatever produced them, while the blocks keep
   the real values. Letting the trial win there erases every active block and turns a
   language or motor task into a design with no task in it. Reading the block first makes
   the JSON copy and the XML original agree, which is the check that settles the question. */
function trialConditionStandalone(trial) {
  const c = trialOps(trial).find(o => o.type === 'condition');
  if (c) { const n = toNum(c.value); if (n != null) return n; }
  return 0;
}
function conditionInBlock(trial, blockCondition) {
  if (blockCondition != null) return blockCondition;
  return trialConditionStandalone(trial);
}
/* Retained for callers that want the old inherited form. */
function trialCondition(trial, inherited) {
  const c = trialOps(trial).find(o => o.type === 'condition');
  if (c) { const n = toNum(c.value); if (n != null) return n; }
  return inherited != null ? inherited : 0;
}

/* Repetitions of 0 mean "play once". The XML files use 1, the JSON files use 0 for the
   same thing, and a value that failed to resolve must not silently become zero length. */
function blockReps(model, block, table) {
  const raw = block ? block.repetitions : null;
  if (raw == null || raw === '') return { reps: 1, unresolved: false };
  const n = resolveNum(raw, table);
  if (n == null) return { reps: 1, unresolved: true, rawValue: String(raw) };
  return { reps: n <= 0 ? 1 : n, unresolved: false };
}

function blockDuration(model, block, slides, table) {
  if (!block) return { ms: 0, one: 0, reps: 1, missing: true };
  let one = 0;
  for (const tn of block.trials) {
    const t = model.trials.find(x => x.name === tn);
    one += trialDuration(model, t, slides, table).ms;
  }
  const { reps, unresolved } = blockReps(model, block, table);
  return { ms: one * reps, one, reps, unresolved, missing: false };
}

/* ======================================================================================
   6a. TIMING ENGINE

   Produces a non overlapping, fully expanded event list plus a coarse segment list.

   Two defects in the earlier viewer are fixed here:

     1. A trial holding both <show> and <wait> children had its waits dropped from the
        expanded event list, so the preview drifted ahead of the reported total. Every
        operation is now expanded through one code path, used for both top level trials
        and trials inside blocks.

     2. The scanner trigger was given a nominal on screen duration but was not advanced
        past, so its event overlapped the events that followed and the preview showed the
        wrong stimulus for the first moments of the run. Pre trigger material now lives at
        negative onsets and the run clock starts cleanly at zero.
   ====================================================================================== */

const NOMINAL_HOLD_MS = 3000;   /* preview length given to a screen with no encoded duration */

function buildTimeline(model, version, language) {
  const table = varTable(model);
  const slides = resolveSlides(model, version, language);
  const atoms = [];      /* ordered, each with a duration or a nominal hold */
  const segments = [];   /* one entry per session step, for the coarse chart */
  const problems = [];
  const conditionConflicts = [];

  const pushShow = (op, ctx, cond) => {
    const sl = slides.get(op.item);
    const { advance, holdUntilNext } = showAdvanceMs(op, slides, table);
    atoms.push({
      kind: 'stim', dur: advance, holdUntilNext, cond,
      slideName: op.item, slide: sl || { name: op.item, _missing: true },
      overlap: !!op.overlap, ...ctx
    });
    if (!sl) problems.push(`Trial "${ctx.trialName}" shows "${op.item}", which is not a stimulus in ${version} / ${language}.`);
  };

  const expandTrial = (trial, cond, ctx) => {
    if (!trial) return;
    const isTrig = trialIsTrigger(trial);
    for (const op of trialOps(trial)) {
      if (op.type === 'show') pushShow(op, ctx, cond);
      else if (op.type === 'wait') {
        const ms = resolveNum(op.ms, table) || 0;
        if (ms > 0) atoms.push({ kind: 'blank', dur: ms, cond, slide: null, slideName: null, ...ctx });
      } else if (op.type === 'clear') {
        const ms = resolveNum(op.ms, table) || 0;
        atoms.push({ kind: 'blank', dur: ms, cond, slide: null, slideName: null, clear: true, ...ctx });
      } else if (op.type === 'register') {
        atoms.push({ kind: 'trigger', dur: 0, cond: 0, slide: null, slideName: null, keys: op.keys || [], ...ctx });
      }
    }
    /* A trial consisting only of a register waits for the scanner and shows nothing new. */
    if (isTrig && !trialOps(trial).some(o => o.type === 'show')) { /* trigger atom already pushed */ }
  };

  for (const step of model.session) {
    const atomStart = atoms.length;
    if (step.kind === 'trial') {
      const trial = model.trials.find(t => t.name === step.ref);
      if (!trial) { problems.push(`Session runs trial "${step.ref}", which is not defined.`); segments.push({ label: step.ref, kind: 'trial', missing: true, cond: 0 }); continue; }
      const cond = trialConditionStandalone(trial);
      expandTrial(trial, cond, { trialName: trial.name, blockName: null });
      segments.push({ label: step.ref, kind: trialIsTrigger(trial) ? 'trigger' : 'trial', cond, atomStart, atomEnd: atoms.length, trial });
    } else {
      const block = model.blocks.find(b => b.name === step.ref);
      if (!block) { problems.push(`Session runs block "${step.ref}", which is not defined.`); segments.push({ label: step.ref, kind: 'block', missing: true, cond: 1 }); continue; }
      const bCond = toNum(block.condition);
      const { reps, unresolved, rawValue } = blockReps(model, block, table);
      if (unresolved) problems.push(`Block "${block.name}" has repetitions "${rawValue}", which does not resolve to a number. It has been treated as 1 repetition.`);
      for (let r = 0; r < reps; r++) {
        for (const tn of block.trials) {
          const trial = model.trials.find(t => t.name === tn);
          if (!trial) { if (r === 0) problems.push(`Block "${block.name}" refers to trial "${tn}", which is not defined.`); continue; }
          if (r === 0 && bCond != null) {
            const own = trialOps(trial).find(o => o.type === 'condition');
            if (own && toNum(own.value) != null && toNum(own.value) !== bCond)
              conditionConflicts.push({ trial: trial.name, block: block.name, trialCond: toNum(own.value), blockCond: bCond });
          }
          expandTrial(trial, conditionInBlock(trial, bCond), { trialName: trial.name, blockName: block.name });
        }
      }
      segments.push({ label: step.ref, kind: 'block', cond: bCond == null ? 1 : bCond, atomStart, atomEnd: atoms.length, block, reps });
    }
  }

  /* Place the clock. Time zero is the scanner trigger. */
  const trigIdx = atoms.findIndex(a => a.kind === 'trigger');
  let t = 0;
  if (trigIdx >= 0) {
    /* Walk backwards from the trigger so that pre scan material lands at negative time.
       A pre trigger screen normally holds until the trigger arrives, which is however long
       the operator takes, so it is given a nominal slot for the preview only and marked as
       such. It contributes nothing to the run. */
    let back = 0;
    for (let i = trigIdx - 1; i >= 0; i--) {
      const a = atoms[i];
      const span = a.dur > 0 ? a.dur : NOMINAL_HOLD_MS;
      if (a.dur <= 0) a.nominal = true;
      back -= span;
      a.t0 = back;
      a.visMs = span;
    }
    t = 0;
    for (let i = trigIdx; i < atoms.length; i++) { atoms[i].t0 = t; t += atoms[i].dur; }
  } else {
    for (const a of atoms) { a.t0 = t; t += a.dur; }
  }

  /* A stimulus that advances the clock is visible for exactly that long. One that does not,
     because it holds until the next stimulus or because it overlaps what follows, stays on
     screen until the next thing is drawn. */
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.visMs != null) continue;
    if (a.kind === 'trigger') { a.visMs = 0; continue; }
    if (a.dur > 0) { a.visMs = a.dur; continue; }
    /* A blank or an instantaneous clear takes no time and shows nothing, so it is not a
       presentation with an undefined duration and must not be reported as one. */
    if (a.kind !== 'stim') { a.visMs = 0; continue; }
    let j = i + 1;
    while (j < atoms.length && atoms[j].kind === 'trigger') j++;
    a.visMs = j < atoms.length ? Math.max(0, atoms[j].t0 - a.t0) : NOMINAL_HOLD_MS;
    if (a.visMs <= 0) { a.visMs = NOMINAL_HOLD_MS; a.nominal = true; }
  }

  const events = atoms.filter(a => a.visMs > 0 || a.kind === 'trigger');
  const startMs = events.length ? Math.min(...events.map(e => e.t0)) : 0;
  const totalMs = t;   /* scan length, measured from the trigger */

  /* Attach absolute times to the coarse segments. */
  for (const s of segments) {
    if (s.atomStart == null || s.atomEnd === s.atomStart) { s.t0 = s.t0 ?? 0; s.dur = 0; continue; }
    const slice = atoms.slice(s.atomStart, s.atomEnd);
    s.t0 = slice[0].t0;
    s.dur = slice.reduce((m, a) => m + a.dur, 0);
    s.nominal = slice.some(a => a.nominal);
    s.visEnd = Math.max(...slice.map(a => a.t0 + (a.visMs || 0)));
  }

  /* Scan time accounting only counts what happens at or after the trigger. */
  let activeMs = 0, restMs = 0;
  for (const a of atoms) {
    if (a.t0 < 0 || a.kind === 'trigger') continue;
    if (a.cond > 0) activeMs += a.dur; else restMs += a.dur;
  }

  return {
    events, segments, atoms, totalMs, startMs, activeMs, restMs,
    hasTrigger: trigIdx >= 0, problems, conditionConflicts,
    slides, table, version, language
  };
}

/* Binary search over the event list. The previous implementation scanned linearly on every
   animation frame, which is fine for a short paradigm and wasteful for a long one. */
/* What is on screen at a given moment.

   Visible spans can overlap, because an overlapping show does not block the commands that
   follow it. The topmost item is the most recently started one whose span still covers the
   moment asked about, so the search walks back from the last item that has begun. */
function eventAt(tl, ms) {
  const ev = tl.events;
  if (!ev.length) return null;
  let lo = 0, hi = ev.length - 1, last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ev[mid].t0 <= ms) { last = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (last < 0) return ev[0];
  for (let i = last; i >= 0; i--) {
    const e = ev[i];
    if (e.kind === 'trigger') continue;
    if (ms < e.t0 + Math.max(e.visMs || 0, 1)) return e;
  }
  return ev[last];
}

/* Condition regressors, the form every analysis format wants: one named list of
   (onset, duration) intervals per condition, with adjacent identical-condition events
   merged so that a block made of forty flashing trials becomes one thirty second block. */
function conditionRuns(tl, opts = {}) {
  const mergeGap = opts.mergeGap != null ? opts.mergeGap : 0;
  const byName = new Map();
  /* Blocks are usually numbered per repetition, so a design with four presentations of a
     high calorie condition names them HC1 to HC4. Grouping on the base name recovers the
     three or four regressors the analysis actually wants, instead of one regressor per
     block instance with a single onset in it, which is not estimable. */
  const baseName = n => {
    const t = String(n).trim();
    const stripped = t.replace(/[\s._-]*\d+$/, '');
    return stripped || t;
  };
  const label = a => {
    const isRest = !(a.cond > 0);
    if (isRest && !opts.includeRest) return null;
    if (isRest && opts.grouping === 'condition') return 'rest';
    switch (opts.grouping) {
      case 'block':     return a.blockName || (isRest ? 'rest' : `condition ${a.cond}`);
      case 'condition': return `condition ${a.cond}`;
      default:          return a.blockName ? baseName(a.blockName) : (isRest ? 'rest' : `condition ${a.cond}`);
    }
  };
  /* The regressor uses how long the stimulus was on screen, not how long it blocked the
     command sequence. An overlapping show blocks for nothing but is still presented. */
  const ordered = tl.atoms.filter(a => a.t0 >= 0 && (a.visMs || 0) > 0 && a.kind !== 'trigger');
  for (const a of ordered) {
    const nm = label(a);
    if (nm == null) continue;
    if (!byName.has(nm)) byName.set(nm, []);
    const list = byName.get(nm);
    const last = list[list.length - 1];
    const end = a.t0 + a.visMs;
    if (last && a.t0 - (last.onset + last.duration) <= mergeGap + 1e-6) {
      last.duration = Math.max(last.onset + last.duration, end) - last.onset;
    } else {
      list.push({ onset: a.t0, duration: a.visMs, cond: a.cond });
    }
  }
  return byName;
}
