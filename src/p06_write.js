/* ======================================================================================
   5. FORMAT WRITERS

   Two classes of output.

   Native writers reproduce the paradigm in a form the original presentation software can
   load again. They aim for round trip fidelity: a file that was not edited is written back
   from its original bytes, and a file that was edited is regenerated with the same
   encoding, line endings and indentation it arrived with.

   Interchange writers project the paradigm onto a timing-only representation for analysis
   or for another presentation package. These are lossy by construction and each one
   declares exactly what it drops.
   ====================================================================================== */

function detectIndent(text) {
  if (!text) return '\t';
  const m = text.match(/\n([ \t]+)</);
  return m ? m[1] : '\t';
}
function nl(io) { return (io && io.crlf === false) ? '\n' : '\r\n'; }

/* ---------------------------------------------------------------------------
   5a. Legacy paradigm folder, XML
   --------------------------------------------------------------------------- */

function serializeMainXml(m) {
  const io = m.raw.mainIO || { enc: 'utf-8', hasDecl: true, crlf: true };
  const I = detectIndent(m.raw.mainText), N = nl(io);
  const L = [];
  const comments = m.raw.topComments || [];
  const emitCommentsBefore = tag => {
    for (const c of comments) if (c.before === tag) for (const t of c.comments) L.push(`${I}<!--${t}-->`);
  };

  if (io.hasDecl !== false)
    L.push(`<?xml version="1.0" encoding="${io.declEncName || (io.enc === 'utf-8' ? 'utf-8' : 'windows-1252')}"?>`);
  L.push('<ParameterDescriptionFile>');

  emitCommentsBefore('Variables');
  L.push(`${I}<Variables>`);
  for (const v of m.variables) L.push(`${I}${I}<${v.key}>${esc(v.value)}</${v.key}>`);
  L.push(`${I}</Variables>`);

  emitCommentsBefore('Settings');
  L.push(`${I}<Settings>`);
  L.push(`${I}${I}<Name>${esc(m.name)}</Name>`);
  L.push(`${I}${I}<Instruction>${esc(m.instruction || '')}</Instruction>`);
  for (const d of m.descriptions.filter(d => !d.inline))
    L.push(`${I}${I}<Include Language="${escA(d.language)}">${esc(d.path)}</Include>`);
  L.push(`${I}${I}<Slices>${esc(m.acq.slices)}</Slices>`);
  L.push(`${I}${I}<TimeToRepeat>${esc(m.acq.trMs)}</TimeToRepeat>`);
  L.push(`${I}${I}<InterPulseInterval>${esc(m.acq.ipiMs)}</InterPulseInterval>`);
  L.push(`${I}${I}<AverageBlockLength>${esc(m.acq.avgBlockMs)}</AverageBlockLength>`);
  L.push(`${I}${I}<Volumes>${esc(m.acq.volumes)}</Volumes>`);
  L.push(`${I}</Settings>`);

  L.push(`${I}<Defaults>`);
  L.push(`${I}${I}<BackGroundColor>${esc(m.defaults.bg)}</BackGroundColor>`);
  L.push(`${I}${I}<ForeGroundColor>${esc(m.defaults.fg)}</ForeGroundColor>`);
  L.push(`${I}${I}<DefaultPosition>${esc(m.defaults.defaultPosition)}</DefaultPosition>`);
  for (const f of (m.raw.defaultsFiles || []))
    L.push(`${I}${I}<Include Version="${escA(f.version)}">${esc(f.path)}</Include>`);
  L.push(`${I}${I}<Language>${esc(m.defaults.language)}</Language>`);
  L.push(`${I}${I}<Version>${esc(m.defaults.version)}</Version>`);
  L.push(`${I}</Defaults>`);

  for (const c of (m.colors || [])) {
    L.push(`${I}<Color>`);
    L.push(`${I}${I}<name>${esc(c.name)}</name>`);
    L.push(`${I}${I}<valueR>${esc(c.r)}</valueR>`);
    L.push(`${I}${I}<valueG>${esc(c.g)}</valueG>`);
    L.push(`${I}${I}<valueB>${esc(c.b)}</valueB>`);
    L.push(`${I}</Color>`);
  }

  emitCommentsBefore('Position');
  for (const p of m.positions) {
    L.push(`${I}<Position>`);
    L.push(`${I}${I}<name>${esc(p.name)}</name>`);
    L.push(`${I}${I}<horizontal>${esc(p.horizontal)}</horizontal>`);
    L.push(`${I}${I}<vertical>${esc(p.vertical)}</vertical>`);
    L.push(`${I}</Position>`);
  }

  emitCommentsBefore('Languages');
  L.push(`${I}<Languages>`);
  for (const l of m.languages) L.push(`${I}${I}<Language>${esc(l)}</Language>`);
  L.push(`${I}</Languages>`);

  emitCommentsBefore('Versions');
  L.push(`${I}<Versions>`);
  for (const v of m.versions) L.push(`${I}${I}<Version>${esc(v)}</Version>`);
  L.push(`${I}</Versions>`);

  emitCommentsBefore('BOLDSettings');
  L.push(`${I}<BOLDSettings>`);
  L.push(`${I}${I}${(m.bold.processRaw || '<Process></Process>').replace(/\r?\n/g, N + I + I)}`);
  L.push(`${I}${I}<Contrasts>`);
  for (const c of m.bold.contrasts)
    L.push(`${I}${I}${I}<Contrast name="${escA(c.name)}">${esc(c.weight)}</Contrast>`);
  L.push(`${I}${I}</Contrasts>`);
  L.push(`${I}</BOLDSettings>`);

  emitCommentsBefore('Include');
  /* Include paths are written back exactly as they were read, so that a stimulus set
     shared between several paradigms keeps its own file name. */
  for (const b of m.slideSets) {
    const attr = b.key.kind === 'version' ? ` Version="${escA(b.key.version)}"`
              : b.key.kind === 'language' ? ` Language="${escA(b.key.language)}"` : '';
    L.push(`${I}<Include${attr}>${esc(b.path)}</Include>`);
  }
  L.push(`${I}<Include>${esc(m.raw.trialsFile.path)}</Include>`);

  emitCommentsBefore('Block');
  for (const b of m.blocks) {
    L.push(`${I}<Block>`);
    L.push(`${I}${I}<name>${esc(b.name)}</name>`);
    for (const tn of b.trials) L.push(`${I}${I}<trials>${esc(tn)}</trials>`);
    if (b.condition !== '' && b.condition != null) L.push(`${I}${I}<condition>${esc(b.condition)}</condition>`);
    if (b.repetitions !== '' && b.repetitions != null) L.push(`${I}${I}<repetitions>${esc(b.repetitions)}</repetitions>`);
    L.push(`${I}${I}<order>${esc(b.order ?? '0')}</order>`);
    L.push(`${I}</Block>`);
  }

  emitCommentsBefore('Session');
  L.push(`${I}<Session>`);
  if (m.sessionName != null) L.push(`${I}${I}<name>${esc(m.sessionName)}</name>`);
  for (const s of m.session) L.push(`${I}${I}<${s.kind === 'trial' ? 'runtrial' : 'runblock'}>${esc(s.ref)}</${s.kind === 'trial' ? 'runtrial' : 'runblock'}>`);
  L.push(`${I}</Session>`);
  L.push('</ParameterDescriptionFile>');
  return L.join(N) + N;
}

function serializeTrialsXml(m) {
  const io = m.raw.trialsFile.io, I = detectIndent(m.raw.trialsFile.origText), N = nl(io);
  const L = [];
  if (io && io.hasDecl !== false)
    L.push(`<?xml version="1.0" encoding="${io.declEncName || (io.enc === 'utf-8' ? 'utf-8' : 'windows-1252')}"?>`);
  L.push('<IncludeTrials>');
  for (const t of m.trials) {
    L.push(`${I}<Trial>`);
    L.push(`${I}${I}<name>${esc(t.name)}</name>`);
    for (const op of t.ops) {
      if (op.type === 'show') {
        const bits = [];
        if (op.condition != null && op.condition !== '') bits.push(`<condition>${esc(op.condition)}</condition>`);
        bits.push(`<item>${esc(op.item)}</item>`);
        if (op.duration != null && op.duration !== '') bits.push(`<duration>${esc(op.duration)}</duration>`);
        if (op.abortion) bits.push('<abortion>true</abortion>');
        if (op.overlap) bits.push('<overlap>true</overlap>');
        L.push(`${I}${I}<show>${bits.join('')}</show>`);
      }
      else if (op.type === 'wait')      L.push(`${I}${I}<wait>${esc(op.ms)}</wait>`);
      else if (op.type === 'clear')     L.push(op.ms ? `${I}${I}<clear>${esc(op.ms)}</clear>` : `${I}${I}<clear />`);
      else if (op.type === 'register')  L.push(`${I}${I}<register>${(op.keys || []).map(k => `<key>${esc(k)}</key>`).join('')}${op.number ? `<number>${esc(op.number)}</number>` : ''}</register>`);
      else if (op.type === 'marker')    L.push(`${I}${I}<marker>${esc(op.value)}</marker>`);
      else if (op.type === 'condition') L.push(`${I}${I}<condition>${esc(op.value)}</condition>`);
      else if (op.type === 'raw')       L.push(`${I}${I}${op.xml}`);
    }
    L.push(`${I}</Trial>`);
  }
  L.push('</IncludeTrials>');
  return L.join(N) + N;
}

function serializeSlideSetXml(m, set) {
  const io = set.io, I = detectIndent(set.origText), N = nl(io);
  const L = [];
  if (io && io.hasDecl !== false)
    L.push(`<?xml version="1.0" encoding="${io.declEncName || (io.enc === 'utf-8' ? 'utf-8' : 'windows-1252')}"?>`);
  const rootTag = set.root === 'json' ? 'IncludeSlides' : (set.root || 'IncludeSlides');
  L.push(`<${rootTag}>`);
  for (const sl of set.slides) {
    /* Emit children in their recorded document order so that an element sitting between
       two pictures keeps its position. Anything added since load is appended. */
    const parts = [];
    const emitted = new Set();
    let picIdx = 0;
    const emit = tag => {
      switch (tag) {
        case 'name': parts.push(`<name>${esc(sl.name)}</name>`); break;
        case 'condition': if (sl.condition != null && sl.condition !== '') parts.push(`<condition>${esc(sl.condition)}</condition>`); break;
        case 'text': if (sl.text != null) parts.push(`<text>${escML(sl.text)}</text>`); break;
        case 'Picture': {
          const p = (sl.pictures || [])[picIdx++];
          if (p) {
            parts.push(`<Picture>${esc(p.value)}</Picture>`);
            /* A position belonging to this picture follows it, which is where it was read from. */
            if (p.position) { parts.push(`<position>${esc(p.position)}</position>`); emitted.add('position'); }
          }
          break;
        }
        case 'Sound': if (sl.sound) parts.push(`<Sound>${esc(sl.sound.value)}</Sound>`); break;
        case 'Video': if (sl.video) parts.push(`<Video>${esc(sl.video.value)}</Video>`); break;
        case 'position': if (sl.position != null) parts.push(`<position>${esc(sl.position)}</position>`); break;
        case 'duration': if (sl.duration != null) parts.push(`<duration>${esc(sl.duration)}</duration>`); break;
        case 'fontsize': if (sl.fontsize != null) parts.push(`<fontsize>${esc(sl.fontsize)}</fontsize>`); break;
        case 'backGroundColor': if (sl.backGroundColor != null) parts.push(`<backGroundColor>${esc(sl.backGroundColor)}</backGroundColor>`); break;
        case 'color': if (sl.color != null) parts.push(`<color>${esc(sl.color)}</color>`); break;
        case 'expectedResponse': if (sl.expectedResponse) {
          const er = sl.expectedResponse;
          const body = (er.keys && er.keys.length) ? er.keys.map(k => `<key>${esc(k)}</key>`).join('') : (er.raw || '');
          parts.push(`<expectedResponse>${body}</expectedResponse>`);
        } break;
        default: break;
      }
      emitted.add(tag);
    };
    for (const o of (sl._order || [])) {
      if (o.t === 'comment') parts.push(`<!--${o.text}-->`);
      else emit(o.tag);
    }
    /* Anything the model has that the original order did not mention. */
    for (const tag of ['name', 'condition', 'text', 'position', 'duration', 'fontsize', 'backGroundColor', 'color', 'Sound', 'Video', 'expectedResponse'])
      if (!emitted.has(tag)) emit(tag);
    while (picIdx < (sl.pictures || []).length) parts.push(`<Picture>${esc(sl.pictures[picIdx++].value)}</Picture>`);
    for (const x of (sl._extra || [])) parts.push(x);

    if (sl.text != null && /\n/.test(sl.text))
      L.push(`${I}<Slide>${N}${I}${I}${parts.join(N + I + I)}${N}${I}</Slide>`);
    else
      L.push(`${I}<Slide>${parts.join('')}</Slide>`);
  }
  L.push(`</${rootTag}>`);
  return L.join(N) + N;
}

function serializeDescriptionXml(m, d) {
  const io = d.io, N = nl(io);
  const L = [];
  if (io && io.hasDecl !== false)
    L.push(`<?xml version="1.0" encoding="${io.declEncName || (io.enc === 'utf-8' ? 'utf-8' : 'windows-1252')}"?>`);
  L.push('<Include>');
  L.push(`\t<Description>${escML(d.text || '')}</Description>`);
  L.push('</Include>');
  return L.join(N) + N;
}

function serializeDefaultsXml(m, f) {
  const io = f.io, N = nl(io);
  const L = [];
  if (io && io.hasDecl !== false)
    L.push(`<?xml version="1.0" encoding="${io.declEncName || (io.enc === 'utf-8' ? 'utf-8' : 'windows-1252')}"?>`);
  L.push('<IncludeDefaults>');
  if (f.defaultPicture) L.push(`\t<DefaultPicture>${esc(f.defaultPicture)}</DefaultPicture>`);
  if (f.fontSize) L.push(`\t<FontSize>${esc(f.fontSize)}</FontSize>`);
  for (const x of (f.extra || [])) L.push('\t' + x);
  L.push('</IncludeDefaults>');
  return L.join(N) + N;
}

/* ---------------------------------------------------------------------------
   5b. Paradigm JSON, dialect A
   --------------------------------------------------------------------------- */

function uuidLike(seed) {
  /* Deterministic identifiers derived from the item name, so that repeated exports of an
     unchanged paradigm produce an unchanged file. */
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) * (i + 7), 2246822519) >>> 0;
  }
  const hx = n => (n >>> 0).toString(16).padStart(8, '0');
  const s = hx(h1) + hx(h2) + hx(h1 ^ h2) + hx(Math.imul(h1, 31) ^ h2);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

function serializeParadigmJson(m, version, language) {
  const idOfTrial = new Map(m.trials.map(t => [t.name, t.id || uuidLike('trial:' + t.name)]));
  const idOfBlock = new Map(m.blocks.map(b => [b.name, b.id || uuidLike('block:' + b.name)]));
  const desc = {};
  for (const d of m.descriptions) desc[d.language] = d.text;

  const slide = {};
  for (const set of m.slideSets) {
    const k = set.key;
    const key = k.kind === 'composite' ? `${k.language}-${k.version}`
              : k.kind === 'version' ? k.version
              : k.kind === 'language' ? k.language
              : (set.jsonKey || 'base');
    slide[key] = set.slides.map(sl => {
      const o = { backGroundColor: sl.backGroundColor || m.defaults.bg, clear: !!sl.clear, name: sl.name };
      o.id = sl._json?.id || uuidLike('slide:' + key + ':' + sl.name);
      if (sl.textRuns && sl.textRuns.length) {
        o.text = sl.textRuns.map(r => ({
          horizontal: r.horizontal || 'center', vertical: r.vertical || 'center',
          color: r.color || m.defaults.fg, fontFamily: r.fontFamily || m.defaults.font || 'Arial',
          fontSize: r.fontSize ?? m.fontSizeByVersion[k.version] ?? null, value: r.value
        }));
      } else if (sl.text != null) {
        o.text = [{ horizontal: 'center', vertical: 'center', color: m.defaults.fg,
                    fontFamily: m.defaults.font || 'Arial',
                    fontSize: m.fontSizeByVersion[k.version] ?? null, value: sl.text }];
      }
      if (sl.pictures && sl.pictures.length) {
        o.picture = sl.pictures.map(p => ({
          value: p.value, horizontal: p.horizontal || 'center', vertical: p.vertical || 'center',
          ...(p.width != null ? { width: p.width } : {}), ...(p.height != null ? { height: p.height } : {})
        }));
      }
      if (sl.sound) o.sound = { value: sl.sound.value };
      if (sl.video) o.video = { value: sl.video.value };
      if (sl.duration != null) o.duration = sl.duration;
      if (sl.position != null) o.position = sl.position;
      if (sl.expectedResponse) o.expectedResponse = { count: sl.expectedResponse.count ?? (sl.expectedResponse.keys || []).length, key: sl.expectedResponse.keys || [] };
      return o;
    });
  }

  const variables = {};
  for (const v of m.variables) variables[v.key] = toNum(v.value) ?? v.value;

  const versionsBlock = {};
  for (const v of m.versions) versionsBlock[v] = { fontSize: m.fontSizeByVersion[v] ?? null };

  return JSON.stringify({
    settings: {
      averageBlockLength: toNum(m.acq.avgBlockMs),
      description: desc,
      name: m.name,
      slices: toNum(m.acq.slices),
      timeToRepeat: toNum(m.acq.trMs),
      volumes: toNum(m.acq.volumes)
    },
    BOLDSettings: {
      contrasts: m.bold.contrasts.length
        ? (m.bold.contrasts.length === 1
            ? { contrast: { attributes: { name: m.bold.contrasts[0].name }, value: toNum(m.bold.contrasts[0].weight) } }
            : { contrast: m.bold.contrasts.map(c => ({ attributes: { name: c.name }, value: toNum(c.weight) })) })
        : {},
      process: m.bold.process || undefined
    },
    versions: m.versions,
    variables,
    languages: m.languages,
    position: m.positions.map(p => ({ horizontal: p.horizontal, name: p.name, vertical: p.vertical })),
    blocks: m.blocks.map(b => ({
      condition: toNum(b.condition),
      id: idOfBlock.get(b.name),
      name: b.name,
      order: toNum(b.order) ?? 0,
      repetitions: toNum(b.repetitions) ?? 0,
      trials: b.trials.map(tn => idOfTrial.get(tn)).filter(Boolean)
    })),
    session: { run: m.session.map(s => (s.kind === 'block' ? idOfBlock.get(s.ref) : idOfTrial.get(s.ref))).filter(Boolean) },
    defaults: {
      backGroundColor: m.defaults.bg,
      defaultPicturePosition: m.defaults.defaultPicturePosition || m.defaults.defaultPosition,
      defaultTextPosition: m.defaults.defaultTextPosition || m.defaults.defaultPosition,
      font: m.defaults.font || 'Arial',
      foreGroundColor: m.defaults.fg,
      language: m.defaults.language,
      version: m.defaults.version,
      versions: versionsBlock
    },
    trial: m.trials.map(t => {
      const o = { id: idOfTrial.get(t.name), name: t.name };
      const cond = t.ops.find(x => x.type === 'condition');
      if (cond) o.condition = toNum(cond.value);
      const shows = t.ops.filter(x => x.type === 'show');
      if (shows.length) o.show = shows.map(s => ({
        item: s.item, ...(s.duration != null && s.duration !== '' ? { duration: toNum(s.duration) ?? s.duration } : {}),
        ...(s.overlap ? { overlap: true } : {})
      }));
      const waits = t.ops.filter(x => x.type === 'wait');
      if (waits.length) o.wait = waits.length === 1 ? (toNum(waits[0].ms) ?? waits[0].ms) : waits.map(w => toNum(w.ms) ?? w.ms);
      const reg = t.ops.find(x => x.type === 'register');
      o.register = { key: reg ? reg.keys : [] };
      const clr = t.ops.find(x => x.type === 'clear');
      if (clr) o.clear = clr.ms ? (toNum(clr.ms) ?? clr.ms) : true;
      return o;
    }),
    slide,
    isFavorite: false,
    isPersonal: true
  }, null, 1);
}

/* ---------------------------------------------------------------------------
   5c. Neutral interchange JSON, this tool's own lossless format
   --------------------------------------------------------------------------- */
function serializeNeutralJson(m, tl) {
  return JSON.stringify({
    format: 'fmri-paradigm-neutral',
    formatVersion: 1,
    generator: 'fMRI Paradigm Studio',
    timeUnit: 'milliseconds',
    timeOrigin: 'scanner trigger, that is the onset of the first acquired volume',
    name: m.name,
    source: { kind: m.source.kind, label: m.source.label },
    acquisition: {
      repetitionTimeMs: toNum(m.acq.trMs),
      volumes: toNum(m.acq.volumes),
      slices: toNum(m.acq.slices),
      interPulseIntervalMs: toNum(m.acq.ipiMs),
      averageBlockLengthMs: toNum(m.acq.avgBlockMs)
    },
    variables: m.variables,
    versions: m.versions,
    languages: m.languages,
    positions: m.positions,
    defaults: m.defaults,
    fontSizeByVersion: m.fontSizeByVersion,
    descriptions: m.descriptions.map(d => ({ language: d.language, text: d.text })),
    contrasts: m.bold.contrasts,
    stimulusSets: m.slideSets.map(s => ({
      key: s.key, path: s.path,
      stimuli: s.slides.map(sl => ({
        name: sl.name, condition: sl.condition, text: sl.text, textRuns: sl.textRuns || undefined,
        pictures: sl.pictures, sound: sl.sound, video: sl.video,
        position: sl.position, durationMs: sl.duration, fontSize: sl.fontsize,
        backGroundColor: sl.backGroundColor, expectedResponse: sl.expectedResponse
      }))
    })),
    trials: m.trials.map(t => ({ name: t.name, operations: t.ops })),
    blocks: m.blocks,
    session: m.session,
    /* The expanded run, so that a consumer needs no interpreter to know what happens when. */
    expandedRun: tl ? tl.events.map(e => ({
      onsetMs: Math.round(e.t0),
      durationMs: Math.round(e.visMs != null ? e.visMs : e.dur),
      clockAdvanceMs: Math.round(e.dur),
      condition: e.cond, kind: e.kind, stimulus: e.slideName,
      trial: e.trialName, block: e.blockName,
      nominalDuration: e.nominal || undefined
    })) : undefined,
    assets: m.assets.map(a => ({ path: a.rel, bytes: a.size }))
  }, null, 2);
}

/* ---------------------------------------------------------------------------
   5d. Interchange writers for analysis and for other presentation packages

   Every one of these takes the expanded run and emits condition regressors. Onsets are
   measured from the scanner trigger. Anything before the trigger is excluded, because in
   every one of these formats time zero is the first acquired volume.
   --------------------------------------------------------------------------- */

function runsForExport(tl, opts = {}) {
  const runs = conditionRuns(tl, {
    includeRest: !!opts.includeRest,
    grouping: opts.grouping || 'base',
    mergeGap: opts.mergeGap ?? 0
  });
  /* Volumes acquired and later discarded shift every onset earlier by that many
     repetition times. The shift is applied here, once, so that every writer agrees, and
     it is stated in the export summary rather than applied silently. */
  const shift = opts.shiftMs || 0;
  return [...runs.entries()].map(([name, list]) => ({
    name,
    list: shift ? list.map(iv => ({ ...iv, onset: iv.onset - shift })) : list
  }));
}
const safeName = s => String(s).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'condition';

/* BIDS task events. Onset and duration in seconds, tab separated, n/a for missing. */
function writeBidsEvents(m, tl, opts = {}) {
  const rows = [['onset', 'duration', 'trial_type']];
  const withResp = opts.includeResponse;
  if (withResp) rows[0].push('stim_file', 'response_keys');
  const groups = runsForExport(tl, { includeRest: opts.includeRest, grouping: opts.grouping, mergeGap: opts.mergeGap });
  const flat = [];
  for (const g of groups) for (const iv of g.list) flat.push({ ...iv, name: g.name });
  flat.sort((a, b) => a.onset - b.onset);
  for (const iv of flat) {
    const r = [sec3(iv.onset), sec3(iv.duration), tsvCell(iv.name)];
    if (withResp) r.push('n/a', 'n/a');
    rows.push(r);
  }
  return rows.map(r => r.join('\t')).join('\n') + '\n';
}
function writeBidsSidecar(m, tl, opts = {}) {
  const groups = runsForExport(tl, opts);
  const levels = {};
  for (const g of groups) levels[g.name] = `Condition "${g.name}" as defined in the paradigm.`;
  return JSON.stringify({
    onset: { LongName: 'Event onset', Description: 'Onset of the event measured from the first volume of the run.', Units: 's' },
    duration: { LongName: 'Event duration', Description: 'Duration of the event.', Units: 's' },
    trial_type: { LongName: 'Condition label', Description: 'Name of the experimental condition.', Levels: levels },
    RepetitionTime: toNum(m.acq.trMs) != null ? toNum(m.acq.trMs) / 1000 : undefined,
    TaskName: m.name,
    Sources: [`Generated by fMRI Paradigm Studio from a ${m.source.label} paradigm.`]
  }, null, 2);
}

/* FSL three column explanatory variable files: onset, duration, weight, in seconds. */
function writeFslEvs(m, tl, opts = {}) {
  return runsForExport(tl, opts).map(g => ({
    name: `${safeName(m.name)}_${safeName(g.name)}.txt`,
    text: g.list.map(iv => `${sec3(iv.onset)}\t${sec3(iv.duration)}\t1`).join('\n') + '\n'
  }));
}

/* AFNI stimulus times, one row per run, seconds. The duration modulated form writes
   onset:duration for use with dmBLOCK. */
function writeAfniStimTimes(m, tl, opts = {}) {
  const dm = !!opts.durationModulated;
  return runsForExport(tl, opts).map(g => {
    let row = g.list.length
      ? g.list.map(iv => dm ? `${sec3(iv.onset)}:${sec3(iv.duration)}` : sec3(iv.onset)).join(' ')
      : '*';
    /* With at most one time on the row, a local times file is indistinguishable from a
       global times file and 3dDeconvolve has to guess. An extra marker forces the local
       reading, which is the one that is correct here. */
    if (g.list.length === 1) row += ' *';
    const head =
      `# ${g.name} stimulus times for ${m.name}\n` +
      `# One row per run, times in seconds from the first analysed volume. This file\n` +
      `# describes a single run, so pass -local_times to 3dDeconvolve rather than\n` +
      `# letting it guess between local and global timing.\n` +
      (dm ? `# Times are written as onset:duration for use with dmBLOCK or dmUBLOCK.\n` : '');
    return { name: `${safeName(m.name)}_${safeName(g.name)}.1D`, text: head + row + '\n' };
  });
}

/* SPM multiple conditions. The native container is a MATLAB .mat file, which cannot be
   written from a browser without a MATLAB writer, so a script that reconstructs and saves
   the same variables is emitted instead, alongside a plain JSON copy of the same data. */
function writeSpmScript(m, tl, opts = {}) {
  const groups = runsForExport(tl, opts);
  const q = s => `'${String(s).replace(/'/g, "''")}'`;
  const L = [];
  L.push(`% Multiple conditions for SPM first level analysis`);
  L.push(`% Paradigm: ${m.name}`);
  L.push(`% Generated by fMRI Paradigm Studio. Units are seconds.`);
  L.push(`% In the SPM batch set Units for design to 'Secs' to match this file.`);
  L.push(``);
  L.push(`names     = cell(1,${groups.length});`);
  L.push(`onsets    = cell(1,${groups.length});`);
  L.push(`durations = cell(1,${groups.length});`);
  L.push(``);
  groups.forEach((g, i) => {
    L.push(`names{${i + 1}}     = ${q(g.name)};`);
    L.push(`onsets{${i + 1}}    = [${g.list.map(iv => sec3(iv.onset)).join(' ')}];`);
    L.push(`durations{${i + 1}} = [${g.list.map(iv => sec3(iv.duration)).join(' ')}];`);
  });
  L.push(``);
  L.push(`save('${safeName(m.name)}_conditions.mat', 'names', 'onsets', 'durations');`);
  return L.join('\n') + '\n';
}
function writeSpmJson(m, tl, opts = {}) {
  const groups = runsForExport(tl, opts);
  return JSON.stringify({
    units: 'secs',
    names: groups.map(g => g.name),
    onsets: groups.map(g => g.list.map(iv => Number(sec3(iv.onset)))),
    durations: groups.map(g => g.list.map(iv => Number(sec3(iv.duration))))
  }, null, 2);
}

/* PsychoPy conditions file. A Builder loop reads one row per trial and exposes each
   column as a variable, so onsets and durations are carried as ordinary columns and the
   routine is expected to use them for its start and stop values. */
function writePsychopyConditions(m, tl) {
  const rows = [['stimulus', 'condition', 'onset_s', 'duration_s', 'text', 'image', 'sound']];
  for (const e of tl.events) {
    if (e.t0 < 0 || e.kind === 'trigger') continue;
    const sl = e.slide || {};
    rows.push([
      e.slideName || 'blank',
      e.cond > 0 ? (e.blockName || `cond${e.cond}`) : 'rest',
      sec3(e.t0), sec3(e.visMs != null ? e.visMs : e.dur),
      (sl.text || '').replace(/\r?\n/g, ' '),
      (sl.pictures && sl.pictures[0] ? sl.pictures[0].value : ''),
      (sl.sound ? sl.sound.value : '')
    ]);
  }
  return rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n') + '\n';
}

/* Neurobehavioral Systems Presentation scenario. Plain text, milliseconds. */
function writePresentationSce(m, tl, opts = {}) {
  const tr = toNum(m.acq.trMs);
  const L = [];
  L.push(`# Presentation scenario generated by fMRI Paradigm Studio`);
  L.push(`# Paradigm: ${m.name}`);
  L.push(`# Times are in milliseconds and are measured from the first scanner pulse.`);
  L.push(``);
  L.push(`scenario = "${m.name.replace(/"/g, "'")}";`);
  L.push(`scenario_type = fMRI;`);
  if (tr) L.push(`scan_period = ${Math.round(tr)};`);
  L.push(`pulses_per_scan = 1;`);
  L.push(`pulse_code = 255;`);
  L.push(`default_background_color = ${cssToRgbTriple(colorOf(m.defaults.bg))};`);
  L.push(`default_font_size = ${m.fontSizeByVersion[opts.version] || 48};`);
  L.push(`active_buttons = 4;`);
  L.push(``);
  L.push(`begin;`);
  L.push(``);
  /* One picture object per distinct stimulus. */
  const seen = new Map();
  let pi = 0;
  for (const e of tl.events) {
    if (e.t0 < 0 || e.kind === 'trigger' || !e.slideName) continue;
    if (seen.has(e.slideName)) continue;
    const sl = e.slide || {};
    pi++;
    const name = `pic_${safeName(e.slideName)}`;
    seen.set(e.slideName, name);
    if (sl.pictures && sl.pictures.length) {
      sl.pictures.forEach((p, k) => L.push(`bitmap { filename = "${p.value.replace(/^[./\\]+/, '')}"; } bmp_${safeName(e.slideName)}_${k};`));
      L.push(`picture { ${sl.pictures.map((p, k) => `bitmap bmp_${safeName(e.slideName)}_${k}; x = 0; y = 0;`).join(' ')} } ${name};`);
    } else if (sl.text != null) {
      L.push(`text { caption = "${String(sl.text).replace(/"/g, "'").replace(/\r?\n/g, '\\n')}"; } txt_${safeName(e.slideName)};`);
      L.push(`picture { text txt_${safeName(e.slideName)}; x = 0; y = 0; } ${name};`);
    } else {
      L.push(`picture {} ${name};`);
    }
  }
  L.push(`picture {} blank_pic;`);
  L.push(``);
  L.push(`trial {`);
  L.push(`   trial_type = fixed;`);
  L.push(`   trial_duration = ${Math.round(tl.totalMs)};`);
  for (const e of tl.events) {
    const vis = e.visMs != null ? e.visMs : e.dur;
    if (e.t0 < 0 || e.kind === 'trigger' || vis <= 0) continue;
    const target = e.slideName ? seen.get(e.slideName) : 'blank_pic';
    L.push(`   stimulus_event {`);
    L.push(`      picture ${target};`);
    L.push(`      time = ${Math.round(e.t0)};`);
    L.push(`      duration = ${Math.round(vis)};`);
    L.push(`      code = "${safeName(e.slideName || 'blank')}";`);
    L.push(`      port_code = ${e.cond > 0 ? 1 : 0};`);
    L.push(`   };`);
  }
  L.push(`} main_trial;`);
  return L.join('\n') + '\n';
}
function cssToRgbTriple(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (m) { const n = parseInt(m[1], 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; }
  const r = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(c));
  return r ? `${r[1]}, ${r[2]}, ${r[3]}` : '0, 0, 0';
}

/* OpenSesame inline script. Durations are in milliseconds. */
function writeOpenSesameScript(m, tl) {
  const L = [];
  L.push(`# OpenSesame script generated by fMRI Paradigm Studio`);
  L.push(`# Paradigm: ${m.name}. Durations are in milliseconds.`);
  L.push(`# Paste into a new experiment with Tools, then Show script editor.`);
  L.push(``);
  const items = [];
  const seen = new Set();
  for (const e of tl.events) {
    const vis = e.visMs != null ? e.visMs : e.dur;
    if (e.t0 < 0 || e.kind === 'trigger' || vis <= 0) continue;
    const nm = 'sk_' + safeName(e.slideName || 'blank') + '_' + Math.round(e.t0);
    const sl = e.slide || {};
    L.push(`define sketchpad ${nm}`);
    L.push(`\tset duration "${Math.round(vis)}"`);
    if (sl.pictures && sl.pictures.length)
      for (const p of sl.pictures) L.push(`\tdraw image center=1 file="${p.value.replace(/^[./\\]+/, '')}" scale=1 x=0 y=0 z_index=0`);
    if (sl.text != null && String(sl.text).trim())
      L.push(`\tdraw textline center=1 color="${m.defaults.fg}" font_family="${m.defaults.font || 'sans'}" text="${String(sl.text).replace(/"/g, "'").replace(/\r?\n/g, ' ')}" x=0 y=0 z_index=0`);
    L.push(``);
    items.push(nm);
    seen.add(nm);
  }
  L.push(`define sequence run_sequence`);
  for (const it of items) L.push(`\trun ${it} always`);
  return L.join('\n') + '\n';
}

/* Siemens inline BOLD evaluation parameters. This is the .ini that sits beside a clinical
   paradigm and tells the scanner console the expected repetition time, the number of
   measurements and the design matrix used for the inline statistics. One row per volume is
   written, which is unambiguous, rather than one row per cycle. */
function writeSiemensIni(m, tl, opts = {}) {
  const tr = toNum(m.acq.trMs);
  if (!tr) throw new Error('A repetition time is required to write the Siemens inline BOLD file.');
  const vols = toNum(m.acq.volumes) || Math.round(tl.totalMs / tr);
  const groups = runsForExport(tl, { includeRest: false, grouping: opts.grouping, mergeGap: opts.mergeGap });
  const nCond = groups.length;
  const cols = nCond + 1;   /* condition regressors plus a constant baseline column */
  const L = [];
  L.push('[MeasurementParameters]');
  L.push(`RequiredTR = ${Math.round(tr)}`);
  L.push(`RequiredMeasurements = ${vols}`);
  L.push('');
  L.push('');
  L.push('[DesignMatrix]');
  L.push(`DesignMatrixLines = ${vols}`);
  L.push(`DesignMatrixColumns = ${cols}`);
  for (let v = 0; v < vols; v++) {
    /* A volume is assigned to a condition when its centre falls inside that condition. */
    const centre = v * tr + tr / 2;
    const row = groups.map(g => g.list.some(iv => centre >= iv.onset && centre < iv.onset + iv.duration) ? 1 : 0);
    row.push(1);
    L.push(`DMat[${v + 1}] = ${row.join(' ')}`);
  }
  L.push('');
  L.push('');
  L.push('[ContrastMatrix]');
  L.push(`ContrastMatrixLines = ${nCond}`);
  L.push(`ContrastMatrixColumns = ${cols}`);
  for (let i = 0; i < nCond; i++) {
    const row = new Array(cols).fill(0); row[i] = 1;
    L.push(`CMat[${i + 1}] = ${row.join(' ')}`);
  }
  L.push('');
  L.push('');
  L.push('[ConvDerivMatrix]');
  L.push(`ConvDerivMatrixLines = ${cols}`);
  L.push(`ConvDerivMatrixColumns = 2`);
  for (let i = 0; i < cols; i++) L.push(`CDMat[${i + 1}]= 1 0`);
  return L.join('\r\n') + '\r\n';
}

/* The design file that the presentation software writes beside its log, and that the
   matching analysis software reads. XML, one row per interval, four whitespace separated
   columns: condition number, onset, duration, amplitude. Times are in SECONDS as floating
   point, declared by the inSeconds attribute on the Design element. */
function writeDesignFile(m, tl, opts = {}) {
  const groups = runsForExport(tl, opts);
  /* Condition numbers, not names, are what this format carries. Numbers are taken from the
     paradigm where a group maps onto exactly one, and allocated in order otherwise. */
  const numberOf = new Map();
  let next = 1;
  for (const g of groups) {
    const conds = [...new Set(g.list.map(iv => iv.cond))];
    numberOf.set(g.name, (conds.length === 1 && conds[0] > 0) ? conds[0] : next++);
  }
  const rows = [];
  for (const g of groups)
    for (const iv of g.list)
      rows.push({ cond: numberOf.get(g.name), onset: iv.onset, dur: iv.duration, name: g.name });
  rows.sort((a, b) => a.onset - b.onset || a.cond - b.cond);

  const L = [];
  L.push('<?xml version="1.0" encoding="utf-8"?>');
  L.push('<DesignFile>');
  L.push('\t<VersionInfo>');
  L.push('\t\t<Version>fMRI Paradigm Studio</Version>');
  L.push(`\t\t<DesignName>${esc(m.name)}</DesignName>`);
  L.push('\t\t<Comment></Comment>');
  L.push('\t</VersionInfo>');
  L.push('\t<Settings>');
  L.push(`\t\t<Volumes>${esc(m.acq.volumes ?? '')}</Volumes>`);
  L.push(`\t\t<Slices>${esc(m.acq.slices ?? '')}</Slices>`);
  const tr = toNum(m.acq.trMs), ipi = toNum(m.acq.ipiMs);
  L.push('\t\t<!-- seconds -->');
  L.push(`\t\t<RepetitionTime>${tr != null ? (tr / 1000).toFixed(3) : ''}</RepetitionTime>`);
  L.push('\t\t<!-- seconds -->');
  L.push(`\t\t<InterPulseInterval>${ipi != null ? (ipi / 1000).toFixed(3) : ''}</InterPulseInterval>`);
  L.push('\t</Settings>');
  if (m.bold.contrasts.length) {
    L.push('\t<Contrasts>');
    for (const c of m.bold.contrasts)
      L.push(`\t\t<Contrast name="${escA(c.name)}"> ${esc(c.weight)} </Contrast>`);
    L.push('\t</Contrasts>');
  }
  L.push('\t<!-- Design format: Condition OnSet Duration Height -->');
  L.push('\t<Design inSeconds = "true">');
  for (const r of rows)
    L.push(`\t\t${r.cond}\t${sec3(r.onset)}\t${sec3(r.dur)}\t1`);
  L.push('\t</Design>');
  L.push('</DesignFile>');
  const legend = [...numberOf.entries()].map(([n, c]) => `${c} = ${n}`).join(', ');
  L.push(`<!-- conditions: ${legend} -->`);
  return L.join('\r\n') + '\r\n';
}

/* A plain readable summary for a protocol document or an email to a colleague. */
function writeReport(m, tl, version, language) {
  const tr = toNum(m.acq.trMs);
  const L = [];
  const pad = (s, n) => String(s).padEnd(n);
  L.push(`Paradigm: ${m.name}`);
  L.push(`Source format: ${m.source.label}`);
  L.push(`Display version: ${version}    Language: ${language}`);
  L.push('');
  L.push(`Repetition time: ${tr != null ? tr + ' ms' : 'not specified'}`);
  L.push(`Slices: ${m.acq.slices ?? 'not specified'}`);
  L.push(`Declared volumes: ${m.acq.volumes ?? 'not specified'}`);
  L.push(`Computed run length: ${(tl.totalMs / 1000).toFixed(1)} s  (${mmss(tl.totalMs)})`);
  if (tr) L.push(`Computed volumes: ${(tl.totalMs / tr).toFixed(2)}`);
  L.push(`Active time: ${(tl.activeMs / 1000).toFixed(1)} s    Rest time: ${(tl.restMs / 1000).toFixed(1)} s`);
  L.push(`Scanner trigger: ${tl.hasTrigger ? 'the run waits for a trigger before the first volume' : 'no trigger wait is defined in this paradigm'}`);
  L.push('');
  L.push('Session structure');
  L.push('-----------------');
  L.push(`${pad('#', 4)}${pad('Item', 26)}${pad('Type', 9)}${pad('Start', 9)}${pad('Duration', 10)}${pad('Vols', 7)}Condition`);
  tl.segments.forEach((s, i) => {
    L.push(`${pad(i + 1, 4)}${pad(s.label.slice(0, 25), 26)}${pad(s.kind, 9)}${pad(mmss(s.t0 || 0), 9)}${pad(((s.dur || 0) / 1000).toFixed(1) + ' s', 10)}${pad(tr ? ((s.dur || 0) / tr).toFixed(1) : '-', 7)}${s.kind === 'trigger' ? 'trigger' : (s.cond > 0 ? 'active' : 'rest')}`);
  });
  L.push('');
  L.push('Condition regressors, onsets and durations in seconds from the trigger');
  L.push('---------------------------------------------------------------------');
  for (const g of runsForExport(tl, { includeRest: true })) {
    L.push(`${g.name}:`);
    for (const iv of g.list) L.push(`   onset ${sec3(iv.onset).padStart(9)}   duration ${sec3(iv.duration).padStart(9)}`);
  }
  if (m.descriptions.length) {
    L.push('');
    L.push('Description and patient instructions');
    L.push('-----------------------------------');
    const d = m.descriptions.find(x => x.language === language) || m.descriptions[0];
    L.push(d.text || '(none)');
  }
  return L.join('\n') + '\n';
}
