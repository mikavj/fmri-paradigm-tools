#!/usr/bin/env node
/*
  Batch timing check for fMRI paradigm folders.

  Walks a folder, finds every paradigm it recognises, computes the length the block design
  actually produces, and compares it against the volume count the paradigm declares. Use it
  to sweep a whole library in one go; use ParadigmStudio.html to look at any one of them.

    node check-timing.mjs "/path/to/paradigm library"
    node check-timing.mjs "/path/to/library" --verbose

  Reads two formats:
    the XML package, a main .xml holding <ParameterDescriptionFile> and <Session>
    the paradigm .json, in both the identifier referenced and name referenced dialects

  Note on a defect this file used to have. Tag matching was written as `<Block[^>]*>`,
  which also matches `<BlockLength>`. In any paradigm with a variable whose name begins
  with the name of an element, the regex swallowed the first real element and the design
  came out one block short, reporting a mismatch that did not exist. Tag matching below
  requires the tag to be followed by whitespace or the closing bracket.
*/

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';

const args = process.argv.slice(2);
const ROOT = args.find(a => !a.startsWith('--')) || '.';
const VERBOSE = args.includes('--verbose');

/* ---------- shared helpers ---------- */
const rxTag = t => `<${t}(?:\\s[^>]*)?>`;
const tag    = (xml, t) => { const m = xml.match(new RegExp(`${rxTag(t)}([\\s\\S]*?)</${t}>`)); return m ? m[1] : null; };
const tagAll = (xml, t) => [...xml.matchAll(new RegExp(`${rxTag(t)}([\\s\\S]*?)</${t}>`, 'g'))].map(m => m[1]);

function subst(v, vars) {
  if (v == null) return null;
  let s = String(v).trim();
  for (let i = 0; i < 6 && s.includes('$'); i++) {
    const n = s.replace(/\$([A-Za-z_]\w*)/g, (m, k) => (k in vars ? String(vars[k]) : m));
    if (n === s) break;
    s = n;
  }
  return s;
}
function num(v, vars) {
  const s = subst(v, vars);
  if (s == null || s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const f of entries) {
    if (f === '.DS_Store' || f === '__MACOSX' || f === '.git') continue;
    const p = join(dir, f);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(xml|json)$/i.test(f)) out.push(p);
  }
  return out;
}
const readText = p => {
  const b = readFileSync(p);
  if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return b.slice(3).toString('utf8');
  const head = b.slice(0, 200).toString('latin1');
  return /encoding\s*=\s*"utf-?8"/i.test(head) ? b.toString('utf8') : b.toString('latin1');
};

/* ---------- the XML package ---------- */
function analyzeXml(path) {
  const xml = readText(path);
  if (!/<ParameterDescriptionFile/.test(xml) || !new RegExp(rxTag('Session')).test(xml)) return null;
  const dir = dirname(path);

  const vars = {};
  const vb = tag(xml, 'Variables');
  if (vb) for (const m of vb.matchAll(/<(\w+)>\s*([^<]*?)\s*<\/\1>/g)) vars[m[1]] = m[2];

  const tr = num(tag(xml, 'TimeToRepeat'), vars);
  const declared = num(tag(xml, 'Volumes'), vars);
  const name = (tag(xml, 'Name') || basename(path)).trim();

  const includes = [...xml.matchAll(/<Include(?:\s[^>]*)?>([^<]+)<\/Include>/g)].map(m => m[1].trim());
  const slides = {}, trials = {};
  for (const inc of includes) {
    const p = join(dir, inc.replace(/\\/g, '/').replace(/^\.\//, ''));
    let s; try { s = readText(p); } catch { continue; }
    if (/<IncludeSlides/.test(s))
      for (const sl of tagAll(s, 'Slide')) slides[(tag(sl, 'name') || '').trim()] = { duration: num(tag(sl, 'duration'), vars) };
    if (/<IncludeTrials/.test(s))
      for (const t of tagAll(s, 'Trial')) trials[(tag(t, 'name') || '').trim()] = t;
  }

  /* A show advances the run clock only when it blocks. A duration of zero or none means
     the stimulus is held until the next one appears, and an overlap of true lets the next
     command run immediately, so neither consumes scan time. */
  const trialMs = t => {
    if (t == null) return { ms: 0, missing: true };
    let ms = 0;
    for (const sh of tagAll(t, 'show')) {
      let d = num(tag(sh, 'duration'), vars);
      if (d == null) { const sl = slides[(tag(sh, 'item') || '').trim()]; d = sl ? sl.duration : null; }
      const overlap = /true/i.test(tag(sh, 'overlap') || '');
      if (d != null && d > 0 && !overlap) ms += d;
    }
    for (const w of tagAll(t, 'wait')) ms += num(w, vars) || 0;
    for (const c of tagAll(t, 'clear')) ms += num(c, vars) || 0;
    return { ms, missing: false };
  };
  const trialCond = t => { const c = t == null ? null : tag(t, 'condition'); return c == null ? null : Number(c.trim()); };

  const blocks = {};
  for (const b of tagAll(xml, 'Block')) {
    const nm = (tag(b, 'name') || '').trim();
    blocks[nm] = {
      trials: tagAll(b, 'trials').map(x => x.trim()),
      reps: num(tag(b, 'repetitions'), vars) ?? 1,
      cond: tag(b, 'condition') != null ? Number(tag(b, 'condition').trim()) : null
    };
  }

  const sess = tag(xml, 'Session') || '';
  const steps = [...sess.matchAll(/<(runtrial|runblock)>([^<]+)<\/\1>/g)].map(m => ({ kind: m[1], ref: m[2].trim() }));

  return accumulate({ name, tr, declared, steps, blocks, trials, trialMs, trialCond, isTrigger: t => /<register/.test(t || '') });
}

/* ---------- the paradigm JSON ---------- */
function analyzeJson(path) {
  let j; try { j = JSON.parse(readText(path)); } catch { return null; }
  if (!j || !j.settings || !j.session) return null;
  const st = j.settings;
  const vars = {};
  for (const [k, v] of Object.entries(j.variables || {})) vars[k] = v;
  const tr = num(st.timeToRepeat, vars);
  const declared = num(st.volumes, vars);
  const name = String(st.name || basename(path));

  const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const trialsById = new Map(), trialsByName = new Map();
  for (const t of arr(j.trial)) { if (t.id) trialsById.set(t.id, t); trialsByName.set(String(t.name), t); }
  const blocksById = new Map(), blocksByName = new Map();
  for (const b of arr(j.blocks)) { if (b.id) blocksById.set(b.id, b); blocksByName.set(String(b.name), b); }

  const trialMs = t => {
    if (t == null) return { ms: 0, missing: true };
    let ms = 0;
    for (const s of arr(t.show)) {
      const d = num(s && s.duration, vars);
      if (d != null && d > 0 && !(s && s.overlap === true)) ms += d;
    }
    for (const w of arr(t.wait)) { const d = num(w && typeof w === 'object' ? w.value : w, vars); if (d) ms += d; }
    return { ms, missing: false };
  };

  const blocks = {};
  for (const b of arr(j.blocks)) {
    blocks[String(b.name)] = {
      trials: arr(b.trials).map(t => (trialsById.get(t) ? String(trialsById.get(t).name) : String(t))),
      reps: (num(b.repetitions, vars) || 0) || 1,
      cond: b.condition == null ? null : Number(b.condition)
    };
  }

  let steps = [];
  if (Array.isArray(j.session.run)) {
    for (const ref of j.session.run) {
      if (blocksById.has(ref)) steps.push({ kind: 'runblock', ref: String(blocksById.get(ref).name) });
      else if (trialsById.has(ref)) steps.push({ kind: 'runtrial', ref: String(trialsById.get(ref).name) });
    }
  } else {
    const tmp = [];
    for (const b of arr(j.session.runblock ?? j.session.runBlock))
      tmp.push({ pos: Number(b.xmlPosition ?? tmp.length), kind: 'runblock', ref: String(b.value ?? b) });
    for (const t of arr(j.session.runTrial ?? j.session.runtrial))
      tmp.push({ pos: Number(t.xmlPosition ?? tmp.length), kind: 'runtrial', ref: String(t.value ?? t) });
    tmp.sort((a, b) => a.pos - b.pos);
    steps = tmp;
  }

  return accumulate({
    name, tr, declared, steps, blocks,
    trials: Object.fromEntries([...trialsByName.entries()]),
    trialMs,
    trialCond: t => (t && t.condition != null ? Number(t.condition) : null),
    isTrigger: t => !!(t && t.register && (Array.isArray(t.register.key) ? t.register.key.length : t.register.key))
  });
}

/* ---------- shared accumulation ----------
   A block is the unit that carries a condition, so a trial running inside a block takes
   the block's condition. A trial's own condition applies only when the session runs that
   trial directly. */
function accumulate({ name, tr, declared, steps, blocks, trials, trialMs, trialCond, isTrigger }) {
  let total = 0, active = 0, rest = 0, keyAdvanced = 0, runTrials = 0;
  const problems = [];
  for (const s of steps) {
    if (s.kind === 'runtrial') {
      const t = trials[s.ref];
      if (t === undefined) { problems.push(`trial "${s.ref}" is not defined`); continue; }
      runTrials++;
      if (isTrigger(t)) { keyAdvanced++; continue; }    /* waits for a key, no scan time */
      const d = trialMs(t);
      const c = trialCond(t) ?? 0;
      total += d.ms; if (c > 0) active += d.ms; else rest += d.ms;
    } else {
      const b = blocks[s.ref];
      if (!b) { problems.push(`block "${s.ref}" is not defined`); continue; }
      let one = 0;
      for (const tn of b.trials) {
        const t = trials[tn];
        if (t === undefined) { problems.push(`block "${s.ref}" refers to trial "${tn}", which is not defined`); continue; }
        one += trialMs(t).ms;
      }
      const d = one * b.reps;
      const c = b.cond == null ? 1 : b.cond;
      total += d; if (c > 0) active += d; else rest += d;
    }
  }
  const computed = tr ? total / tr : null;
  /* A bench test advances every screen on a key press, so it has no fixed length and no
     volume count to agree with. That is the intended design, not a mismatch. */
  const keyPaced = runTrials > 0 && keyAdvanced === runTrials && total === 0;
  return {
    name, tr, declared, total, computed, active, rest, problems, keyPaced,
    match: keyPaced ? null
      : (declared != null && computed != null) ? Math.abs(computed - declared) < 0.5 : null
  };
}

/* ---------- run ---------- */
const rows = [];
for (const f of walk(ROOT)) {
  let r = null;
  try { r = /\.xml$/i.test(f) ? analyzeXml(f) : analyzeJson(f); } catch (e) { continue; }
  if (r) rows.push({ ...r, file: f });
}
rows.sort((a, b) => a.name.localeCompare(b.name));

const pad = (s, n) => String(s ?? '').padEnd(n);
const rpad = (s, n) => String(s ?? '').padStart(n);
console.log(pad('PARADIGM', 40), rpad('TR', 6), rpad('LENGTH', 9), rpad('COMPUTED', 9), rpad('DECLARED', 9), ' STATUS');
console.log('-'.repeat(96));
let nOk = 0, nBad = 0, nUnknown = 0;
for (const r of rows) {
  const status = r.keyPaced ? 'advances on a key press, no fixed length'
    : r.match === null ? 'no declared volume count'
    : r.match ? 'match'
    : `MISMATCH by ${(r.computed - r.declared) > 0 ? '+' : ''}${(r.computed - r.declared).toFixed(1)} volumes`;
  if (r.keyPaced || r.match === null) nUnknown++; else if (r.match) nOk++; else nBad++;
  console.log(
    pad(r.name.slice(0, 39), 40),
    rpad(r.tr ?? '-', 6),
    rpad((r.total / 1000).toFixed(0) + 's', 9),
    rpad(r.computed != null ? r.computed.toFixed(1) : '-', 9),
    rpad(r.declared ?? '-', 9),
    ' ' + status
  );
  if (VERBOSE || r.problems.length) for (const p of r.problems) console.log(' '.repeat(40) + '   ' + p);
}
console.log('-'.repeat(96));
console.log(`${rows.length} paradigms: ${nOk} match, ${nBad} mismatch, ${nUnknown} with no fixed length to compare.`);
process.exit(nBad > 0 ? 1 : 0);
