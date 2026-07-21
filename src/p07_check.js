/* ======================================================================================
   6b. VALIDATION

   Severity is deliberate. An "error" means the paradigm will not behave as written, or
   refers to something that does not exist. A "warning" means the paradigm is internally
   valid but something is inconsistent, unusual, or depends on an assumption the tool had
   to make. Nothing is reported twice, and every message names the specific item at fault.
   ====================================================================================== */

function validateModel(m, tl) {
  const errs = [], warns = [], notes = [];
  const E = s => errs.push(s), W = s => warns.push(s), N = s => notes.push(s);
  const table = varTable(m);
  const slides = tl.slides;
  const tr = resolveNum(m.acq.trMs, table);
  const vols = resolveNum(m.acq.volumes, table);

  /* --- variable use. Every field that may carry a $reference is scanned, including the
     acquisition settings, which the earlier editor omitted and therefore reported
     correctly used variables as unused. --- */
  const defined = new Set(m.variables.map(v => v.key));
  const used = new Set();
  const scan = s => { if (s == null) return; for (const mm of String(s).matchAll(/\$([A-Za-z_]\w*)/g)) used.add(mm[1]); };
  Object.values(m.acq).forEach(scan);
  for (const v of m.variables) scan(v.value);
  for (const b of m.blocks) { scan(b.repetitions); scan(b.condition); scan(b.order); }
  for (const t of m.trials) for (const op of t.ops) { scan(op.duration); scan(op.ms); scan(op.value); }
  for (const set of m.slideSets) for (const sl of set.slides) { scan(sl.duration); scan(sl.condition); scan(sl.fontsize); }
  for (const v of used) if (!defined.has(v)) E(`Variable $${v} is referenced but never defined.`);
  for (const v of defined) if (!used.has(v)) W(`Variable $${v} is defined but never referenced.`);

  /* A value that exactly matches a variable name but is missing its dollar sign is almost
     always a typo, and it silently becomes a literal rather than a number. */
  const checkMissingDollar = (val, where) => {
    if (val == null) return;
    const s = String(val).trim();
    if (s && !s.startsWith('$') && defined.has(s))
      E(`${where} is set to "${s}", which matches the variable $${s} but is missing its dollar sign, so it does not resolve to a number.`);
  };
  for (const b of m.blocks) { checkMissingDollar(b.repetitions, `Block "${b.name}" repetitions`); checkMissingDollar(b.condition, `Block "${b.name}" condition`); }
  for (const t of m.trials) for (const op of t.ops) if (op.type === 'show') checkMissingDollar(op.duration, `Trial "${t.name}" show duration`);

  /* --- naming and references --- */
  const trialNames = new Set(), blockNames = new Set();
  for (const t of m.trials) { if (trialNames.has(t.name)) E(`There is more than one trial named "${t.name}".`); trialNames.add(t.name); }
  for (const b of m.blocks) { if (blockNames.has(b.name)) E(`There is more than one block named "${b.name}".`); blockNames.add(b.name); }
  for (const b of m.blocks) {
    if (!b.trials.length) W(`Block "${b.name}" contains no trials, so it takes no time.`);
    for (const tn of b.trials) if (!trialNames.has(tn)) E(`Block "${b.name}" refers to trial "${tn}", which is not defined.`);
  }
  if (!m.session.length) E('The session is empty, so nothing would be presented.');
  for (const s of m.session) {
    if (s.kind === 'trial' && !trialNames.has(s.ref)) E(`The session runs trial "${s.ref}", which is not defined.`);
    if (s.kind === 'block' && !blockNames.has(s.ref)) E(`The session runs block "${s.ref}", which is not defined.`);
  }
  const usedTrials = new Set(m.session.filter(s => s.kind === 'trial').map(s => s.ref));
  for (const b of m.blocks) if (m.session.some(s => s.kind === 'block' && s.ref === b.name)) b.trials.forEach(t => usedTrials.add(t));
  for (const t of m.trials) if (!usedTrials.has(t.name)) N(`Trial "${t.name}" is defined but is not used anywhere in the session.`);
  for (const b of m.blocks) if (!m.session.some(s => s.kind === 'block' && s.ref === b.name)) N(`Block "${b.name}" is defined but is not used in the session.`);

  /* --- stimulus references. A trial that the session never runs cannot break a scan, so
     a dangling reference inside one is reported as a warning. The timing engine raises the
     error for trials that are actually expanded into the run. --- */
  for (const t of m.trials) {
    if (usedTrials.has(t.name)) continue;
    for (const op of t.ops)
      if (op.type === 'show' && op.item && !slides.has(op.item))
        W(`Unused trial "${t.name}" shows "${op.item}", which is not a stimulus in the ${tl.version} / ${tl.language} set.`);
  }
  const posNames = new Set(m.positions.map(p => p.name));
  for (const set of m.slideSets) for (const sl of set.slides)
    if (sl.position && !posNames.has(sl.position))
      E(`Stimulus "${sl.name}" uses position "${sl.position}", which is not a defined position.`);

  /* --- assets --- */
  const assetSet = new Set(m.assets.map(a => a.rel.replace(/\\/g, '/').toLowerCase()));
  const baseNames = new Set([...assetSet].map(a => a.split('/').pop()));
  const haveAsset = p => {
    const norm = String(p).replace(/\\/g, '/').replace(/^[./]+/, '').toLowerCase();
    return assetSet.has(norm) || baseNames.has(norm.split('/').pop());
  };
  const missingAssets = new Set();
  for (const set of m.slideSets) for (const sl of set.slides) {
    for (const p of (sl.pictures || [])) if (!haveAsset(p.value)) missingAssets.add(p.value);
    if (sl.sound && !haveAsset(sl.sound.value)) missingAssets.add(sl.sound.value);
    if (sl.video && !haveAsset(sl.video.value)) missingAssets.add(sl.video.value);
  }
  for (const p of missingAssets) E(`The media file "${p}" is referenced by a stimulus but is not present in the folder that was opened.`);

  /* --- acquisition numbers --- */
  for (const [k, label] of [['slices', 'Slices'], ['trMs', 'Repetition time'], ['volumes', 'Volumes']]) {
    const n = resolveNum(m.acq[k], table);
    if (n == null) W(`${label} is not set.`);
    else if (n <= 0 || !Number.isInteger(n)) E(`${label} must be a positive whole number, but it is "${m.acq[k]}".`);
  }
  const ipi = resolveNum(m.acq.ipiMs, table);
  if (tr && ipi && ipi % tr !== 0)
    W(`The inter pulse interval (${ipi} ms) is not a whole multiple of the repetition time (${tr} ms).`);

  /* --- the timing checks that matter most --- */
  if (tr && vols != null) {
    const computed = tl.totalMs / tr;
    const diff = computed - vols;
    if (Math.abs(diff) > 0.5) {
      E(`The block design runs for ${(tl.totalMs / 1000).toFixed(1)} s, which is ${computed.toFixed(2)} volumes at a repetition time of ${tr} ms, but the paradigm declares ${vols} volumes. That is a difference of ${diff > 0 ? '+' : ''}${diff.toFixed(2)} volumes, or ${diff > 0 ? '+' : ''}${(diff * tr / 1000).toFixed(1)} s. Either set Volumes to ${Math.round(computed)} or change the design, and check whether the difference is intended as dummy scans.`);
    }
  }
  if (tr) {
    const frac = tl.totalMs / tr;
    if (Math.abs(frac - Math.round(frac)) > 1e-6)
      W(`The run ends part way through a volume. It is ${frac.toFixed(3)} volumes long, so the last volume is only partly covered by the design.`);
  }
  if (!tl.hasTrigger)
    W('No trial waits for a scanner trigger, so the paradigm has no defined synchronisation point. Onsets exported from it assume the run starts at the first stimulus.');
  const preroll = tl.events.filter(e => e.t0 < 0);
  if (preroll.length)
    N(preroll.length === 1
      ? 'One item is presented before the scanner trigger and therefore contributes no scan time.'
      : `${preroll.length} items are presented before the scanner trigger and therefore contribute no scan time.`);

  /* --- defaults membership --- */
  if (m.defaults.version && m.versions.length && !m.versions.includes(m.defaults.version))
    E(`The default display version "${m.defaults.version}" is not one of the versions this paradigm defines (${m.versions.join(', ')}).`);
  if (m.defaults.language && m.languages.length && !m.languages.includes(m.defaults.language))
    E(`The default language "${m.defaults.language}" is not one of the languages this paradigm defines.`);
  if (m.slideSets.some(s => s.key.kind === 'version'))
    for (const v of m.versions)
      if (!m.slideSets.some(s => (s.key.kind === 'version' || s.key.kind === 'composite') && s.key.version === v))
        W(`Display version "${v}" has no stimulus set of its own, so its pictures will fall back to another version or be missing.`);

  /* --- nominal durations --- */
  const nominal = tl.events.filter(e => e.nominal && e.t0 >= 0);
  if (nominal.length)
    W(`${nominal.length} stimulus presentation${nominal.length > 1 ? 's have' : ' has'} no encoded duration and no default from the stimulus, so ${nominal.length > 1 ? 'they have' : 'it has'} been shown for ${NOMINAL_HOLD_MS / 1000} s in the preview only. The real duration is undefined.`);

  /* --- description consistency, the check that catches a paradigm re-timed without its
     documentation being updated --- */
  for (const w of checkDescriptionConsistency(m, tl, table)) W(w);

  if (m._placeholderDurations)
    W(`${m._placeholderDurations} event${m._placeholderDurations > 1 ? 's carry' : ' carries'} a placeholder duration, because the file it came from records onsets only. Every duration shown is invented and must be replaced before this paradigm is used.`);

  /* --- plausibility of the units. A run shorter than twenty seconds or longer than two
     hours, or a typical event shorter than ten milliseconds, is nearly always a seconds
     and milliseconds confusion rather than a real design. --- */
  const realEvents = tl.events.filter(e => e.t0 >= 0 && e.dur > 0);
  if (realEvents.length) {
    const durs = realEvents.map(e => e.dur).sort((a, b) => a - b);
    const median = durs[durs.length >> 1];
    if (tl.totalMs > 0 && tl.totalMs < 20000)
      W(`The whole run is ${(tl.totalMs / 1000).toFixed(1)} s. A functional run is rarely shorter than twenty seconds, so check that the durations in the source were read in the right unit.`);
    if (tl.totalMs > 7200000)
      W(`The whole run is ${(tl.totalMs / 60000).toFixed(0)} minutes, which is longer than a single functional run usually lasts. Check the units in the source.`);
    if (median < 10)
      W(`The typical stimulus lasts ${median} ms. Values this short usually mean a value in seconds was read as milliseconds.`);
    if (median > 300000)
      W(`The typical stimulus lasts ${(median / 1000).toFixed(0)} s, which is unusually long for a single presentation.`);
  }

  /* --- alignment to the volume grid. Reported, never corrected: a design deliberately
     jittered off the grid is jittered for a reason, and rounding it destroys that. --- */
  if (tr && realEvents.length > 3) {
    const rem = realEvents.map(e => { const r = ((e.t0 % tr) + tr) % tr; return Math.min(r, tr - r); });
    const onGrid = rem.filter(r => r <= 5).length;
    const frac = onGrid / rem.length;
    if (frac >= 0.9 && frac < 1) {
      const off = realEvents.filter((e, i) => rem[i] > 5).slice(0, 5)
        .map(e => `${e.slideName || e.trialName || 'event'} at ${sec3(e.t0)} s`);
      W(`This design is locked to the volume grid, but ${rem.length - onGrid} of ${rem.length} events do not start on a volume boundary: ${off.join(', ')}${rem.length - onGrid > 5 ? ' and others' : ''}.`);
    } else if (frac < 0.5) {
      N('Event onsets are spread across the volume grid rather than aligned to it. If that is deliberate jitter, leave it alone, because rounding it onto the grid would remove the benefit it was introduced for.');
    }
  }

  /* --- estimability. A condition seen once cannot support a sensible estimate. --- */
  try {
    for (const g of runsForExport(tl, { grouping: 'base' }))
      if (g.list.length > 0 && g.list.length < 3)
        W(`Condition "${g.name}" occurs ${g.list.length === 1 ? 'only once' : 'only twice'} in the run. Estimating a response from fewer than three presentations is not usually advisable.`);
  } catch (_) {}

  /* --- names with stray whitespace. These work only while every reference happens to
     carry the same stray character, and they are invisible in most editors. --- */
  const ws = [];
  for (const b of m.blocks) if (b.name !== b.name.trim()) ws.push(`block "${b.name}"`);
  for (const t of m.trials) if (t.name !== t.name.trim()) ws.push(`trial "${t.name}"`);
  for (const set of m.slideSets) for (const sl of set.slides) if (sl.name !== String(sl.name).trim()) ws.push(`stimulus "${sl.name}"`);
  if (ws.length)
    W(`${ws.length === 1 ? 'One name has' : ws.length + ' names have'} leading or trailing whitespace: ${[...new Set(ws)].slice(0, 6).join(', ')}. These match only while every reference repeats the same stray character.`);

  /* --- condition disagreements found while expanding the run. These arrive one per trial
     per block, and in a converted file every trial carries the same stray value, so they
     are summarised rather than listed. --- */
  const cc = tl.conditionConflicts || [];
  if (cc.length) {
    const eg = cc[0];
    const trials = new Set(cc.map(c => c.trial));
    W(`${trials.size === 1 ? 'One trial carries a condition' : trials.size + ' trials carry a condition'} of their own that disagrees with the block they run inside, for example trial "${eg.trial}" is condition ${eg.trialCond} inside block "${eg.block}" which is condition ${eg.blockCond}. The block condition has been used throughout, because a block is the unit that defines a condition. This pattern is normal in a paradigm that has been converted from one file format to another, where a default condition of 0 is written onto every trial.`);
  }

  /* --- problems raised by the timing engine itself --- */
  for (const p of tl.problems) if (!errs.includes(p)) E(p);

  return { errs: [...new Set(errs)], warns: [...new Set(warns)], notes: [...new Set(notes)] };
}

/* Compare the free text description against what the design actually does. Only very
   specific, unambiguous patterns are checked, so that ordinary prose does not produce
   noise. Everything reported here names both the claimed and the computed value. */
function checkDescriptionConsistency(m, tl, table) {
  const tr = resolveNum(m.acq.trMs, table);
  const declared = resolveNum(m.acq.volumes, table);
  const blockDurs = new Set(
    tl.segments.filter(s => s.kind === 'block' && s.dur > 0).map(s => Math.round(s.dur / 1000))
  );
  const activeBlocks = tl.segments.filter(s => s.kind === 'block' && s.cond > 0).length;
  /* The A and B shorthand counts alternating presentation periods, which is every session
     step other than the trigger, not only the steps that happen to be written as blocks. */
  const nPeriods = tl.segments.filter(s => s.kind !== 'trigger' && (s.dur || 0) > 0).length;

  /* The same paradigm carries the same description in a dozen languages, so an out of date
     statement is found a dozen times. Findings are grouped by what they say, and the
     languages they were found in are listed once. */
  const found = new Map();
  /* Claims are stored as a bare verb plus the rest of the sentence, so that the verb can
     agree with however many languages turn out to share the finding. */
  const add = (verb, rest, lang) => {
    const key = verb + '\u0000' + rest;
    if (!found.has(key)) found.set(key, { verb, rest, langs: [] });
    found.get(key).langs.push(lang);
  };

  for (const d of m.descriptions) {
    const text = String(d.text || '');
    if (!text.trim()) continue;
    const lang = d.language || 'untitled';

    for (const mm of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?)\b[^.\n]{0,24}\beach\b/gi)) {
      const claimed = Math.round(Number(mm[1]));
      if (blockDurs.size && !blockDurs.has(claimed))
        add('state', `blocks of ${claimed} s, but the design produces ${[...blockDurs].sort((a, b) => a - b).join(' and ')} s`, lang);
    }
    for (const mm of text.matchAll(/(\d+)\s*cycles?\b/gi)) {
      const claimed = Number(mm[1]);
      if (activeBlocks && claimed !== activeBlocks)
        add('state', `${claimed} cycles, but the design contains ${activeBlocks} active block${activeBlocks > 1 ? 's' : ''}`, lang);
    }
    for (const mm of text.matchAll(/\bTR\s*[=:]?\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|seconds?)?\b/gi)) {
      const raw = Number(mm[1]); const unit = (mm[2] || '').toLowerCase();
      const claimedMs = /^m/.test(unit) ? raw : (unit ? raw * 1000 : (raw > 100 ? raw : raw * 1000));
      if (tr && Math.abs(claimedMs - tr) > 1)
        add('state', `a repetition time of ${claimedMs} ms, but the paradigm is set to ${tr} ms`, lang);
    }
    for (const mm of text.matchAll(/(\d+)\s*volumes?\b/gi)) {
      const claimed = Number(mm[1]);
      if (declared != null && claimed !== declared)
        add('state', `${claimed} volumes, but the paradigm declares ${declared}`, lang);
    }
    const shape = text.match(/(?:^|[\s(])((?:[AB][\s]*){3,})(?:$|[\s).,;])/m);
    if (shape) {
      const letters = shape[1].replace(/\s+/g, '');
      if (letters.length > 3 && nPeriods && letters.length !== nPeriods)
        add('sketch', `the design as "${letters}", which is ${letters.length} presentation periods, but the session contains ${nPeriods}`, lang);
    }
  }

  const out = [];
  for (const { verb, rest, langs } of found.values()) {
    const list = [...new Set(langs)];
    const one = list.length === 1;
    const who = one ? `The ${list[0]} description`
      : list.length <= 4 ? `The ${list.join(' and ')} descriptions`
      : `${list.length} of the descriptions, including ${list.slice(0, 3).join(', ')},`;
    const conj = one ? (/(ch|sh|s|x|z)$/.test(verb) ? verb + 'es' : verb + 's') : verb;
    out.push(`${who} ${conj} ${rest}. The wording appears to be out of date with respect to the design.`);
  }

  /* Companion files shipped beside the paradigm that describe a different acquisition.
     These are commonly forgotten when a paradigm is re-timed, and there is usually one
     copy per language, so they are grouped in the same way. */
  const comp = new Map();
  const addComp = (key, file) => { if (!comp.has(key)) comp.set(key, []); comp.get(key).push(file); };
  for (const a of m.assets) {
    if (!/\.ini$/i.test(a.rel) || !a._text) continue;
    const rt = /RequiredTR\s*=\s*(\d+)/i.exec(a._text);
    const rm = /RequiredMeasurements\s*=\s*(\d+)/i.exec(a._text);
    if (rt && tr && Number(rt[1]) !== tr)
      addComp(`specify a repetition time of ${rt[1]} ms, but the paradigm is set to ${tr} ms`, a.rel);
    if (rm && declared != null && Number(rm[1]) !== declared)
      addComp(`expect ${rm[1]} measurements, but the paradigm declares ${declared} volumes`, a.rel);
  }
  for (const [claim, files] of comp) {
    const n = files.length;
    out.push(n === 1
      ? `The companion file "${files[0]}" ${claim.replace(/^specify /, 'specifies ').replace(/^expect /, 'expects ')}. The scanner side configuration and the paradigm no longer agree.`
      : `${n} companion files, including "${files[0]}", ${claim}. The scanner side configuration and the paradigm no longer agree.`);
  }
  return out;
}

/* Companion text files are small, so their contents are read once at load and attached to
   the asset record, which lets the consistency check above see them. */
async function attachCompanionText(m) {
  for (const a of m.assets) {
    if (!/\.(ini|txt)$/i.test(a.rel)) continue;
    if (a.size > 200000) continue;
    try { a._text = (await sniffText(await a.file.arrayBuffer())).text; } catch (_) {}
  }
}
