<script>
"use strict";
/* ======================================================================================
   fMRI Paradigm Studio
   Single file, no dependencies, no network. Reads, edits, previews and converts
   block-design fMRI paradigm files across several presentation and analysis formats.

   Layout of this script:
     1  utilities, text encoding, zip writer
     2  file store and path resolution
     3  the neutral paradigm model  (every format converts through this)
     4  format readers
     5  format writers
     6  timing engine and validation
     7  rendering and playback
     8  user interface
     9  information page content
   ====================================================================================== */

/* ============================ 1. utilities ============================ */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function el(t, a = {}, kids = []) {
  const e = document.createElement(t);
  for (const k in a) {
    const v = a[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  (Array.isArray(kids) ? kids : [kids]).forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return e;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3000);
}

const mmss = ms => {
  const neg = ms < 0; const s = Math.round(Math.abs(ms) / 1000);
  return `${neg ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const secs = ms => (ms / 1000);
/* Fixed-precision seconds without trailing noise from floating point accumulation. */
const sec3 = ms => (Math.round(ms) / 1000).toFixed(3);
const fmtDur = ms => {
  if (ms == null || !isFinite(ms)) return 'n/a';
  return ms >= 60000 ? mmss(ms) : `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)}s`;
};

const esc  = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => esc(s).replace(/"/g, '&quot;');
const escML = s => esc(s).replace(/\r\n?|\n/g, '\r\n');

/* Named colours used by the paradigm formats, plus passthrough for css colours such as rgb(0,214,0). */
const COLOR_NAMES = {
  black: '#000000', white: '#ffffff', grey: '#808080', gray: '#808080',
  red: '#d63b3b', green: '#36a84a', blue: '#3b6fd4', yellow: '#e8d84a',
  cyan: '#3bc9d6', magenta: '#c93bd6', orange: '#e08a2e'
};
const colorOf = c => {
  if (!c) return '#808080';
  const k = String(c).trim().toLowerCase();
  return COLOR_NAMES[k] || String(c).trim();
};

/* Numeric parsing that tolerates the whitespace padding found in vendor files. */
function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/* Escape a value for a tab separated file. BIDS forbids tabs and newlines inside a field. */
const tsvCell = v => (v == null || v === '' ? 'n/a' : String(v).replace(/[\t\r\n]+/g, ' '));

/* Minimal but correct CSV/TSV reader: handles quoted fields, doubled quotes and CRLF. */
function parseDelimited(text, delim) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* consumed with the following \n */ }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0].trim() === ''));
}

/* ---------- text encoding ----------
   Paradigm files ship in a mixture of windows-1252 and UTF-8, some with a byte order mark.
   Each file's encoding is detected on read and reproduced exactly on write, so that a
   load followed by a save is byte stable. */
const CP1252_EXTRA = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};
const TRANSLIT = { 0x2212: '-', 0x00A0: ' ', 0x2009: ' ', 0x202F: ' ', 0x200B: '', 0x2032: "'", 0x2033: '"' };

function encodeCp1252(str) {
  const out = []; const bad = new Set();
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x7F || (cp >= 0xA0 && cp <= 0xFF)) out.push(cp);
    else if (CP1252_EXTRA[cp] != null) out.push(CP1252_EXTRA[cp]);
    else if (TRANSLIT[cp] != null) { for (const c of TRANSLIT[cp]) out.push(c.charCodeAt(0)); }
    else { out.push(0x3F); bad.add(ch); }
  }
  return { bytes: new Uint8Array(out), bad: [...bad] };
}

function sniffText(buf) {
  const u = new Uint8Array(buf);
  const bom = u.length >= 3 && u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF;
  let head = '';
  for (let i = bom ? 3 : 0; i < Math.min(u.length, 400); i++) head += String.fromCharCode(u[i]);
  const dm = head.match(/encoding\s*=\s*"([^"]+)"/i);
  const declEncName = dm ? dm[1] : null;
  /* An explicit BOM or an explicit utf declaration wins. Otherwise fall back to windows-1252,
     which is what the older paradigm files use and which never fails to decode. */
  const enc = (bom || (declEncName && /utf-?8/i.test(declEncName))) ? 'utf-8' : 'windows-1252';
  const text = new TextDecoder(enc, { fatal: false }).decode(buf);
  return { text, io: { enc, bom, declEncName, hasDecl: /^\s*<\?xml/i.test(text), crlf: /\r\n/.test(text) } };
}

function encodeWithIO(text, io) {
  io = io || { enc: 'utf-8', bom: false };
  if (io.enc === 'utf-8') {
    const body = new TextEncoder().encode(text);
    if (!io.bom) return { bytes: body, bad: [] };
    const out = new Uint8Array(body.length + 3);
    out.set([0xEF, 0xBB, 0xBF], 0); out.set(body, 3);
    return { bytes: out, bad: [] };
  }
  return encodeCp1252(text);
}
const utf8 = s => ({ bytes: new TextEncoder().encode(s), bad: [] });

/* ---------- zip writer (stored, no compression) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(entries) {
  const d = new Date();
  const dosTime = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const dosDate = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  /* File names are written as UTF-8 with the language encoding flag set, so that
     non ASCII paradigm names survive the round trip through the archive. */
  const nameBytes = s => new TextEncoder().encode(s);
  const parts = [], central = []; let offset = 0;
  for (const e of entries) {
    const nm = nameBytes(e.name), crc = crc32(e.bytes), sz = e.bytes.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, e.bytes);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
    central.push({ hdr: new Uint8Array(ch.buffer), nm });
    offset += 30 + nm.length + sz;
  }
  let cdSize = 0; const cdParts = [];
  for (const c of central) { cdParts.push(c.hdr, c.nm); cdSize += c.hdr.length + c.nm.length; }
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(8, central.length, true); eo.setUint16(10, central.length, true);
  eo.setUint32(12, cdSize, true); eo.setUint32(16, offset, true);
  return new Blob([...parts, ...cdParts, new Uint8Array(eo.buffer)], { type: 'application/zip' });
}
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const downloadText = (text, filename, mime = 'text/plain') =>
  downloadBlob(new Blob([text], { type: mime + ';charset=utf-8' }), filename);

/* ============================ 2. file store ============================ */
let STORE = null;

function buildStore(files) {
  const byPath = new Map(), byLower = new Map(), byBase = new Map();
  for (const f of files) {
    const rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    if (/(^|\/)\.DS_Store$/i.test(rel) || /(^|\/)__MACOSX\//.test(rel)) continue;
    const e = { file: f, path: rel, size: f.size };
    byPath.set(rel, e);
    byLower.set(rel.toLowerCase(), e);
    const b = rel.split('/').pop().toLowerCase();
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(e);
  }
  return { byPath, byLower, byBase, files: [...byPath.values()] };
}

/* Resolve a reference found inside a paradigm file against the folder that file lives in.
   The formats in scope use, inconsistently, forward slashes, backslashes, a leading "./",
   and a leading "/" that means "the paradigm folder" rather than the filesystem root. */
function resolvePath(baseDir, ref) {
  if (!ref || !STORE) return null;
  let p = String(ref).replace(/\\/g, '/').trim();
  if (!p) return null;
  const stack = baseDir ? baseDir.split('/').filter(Boolean) : [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const cand = stack.join('/');
  if (STORE.byPath.has(cand)) return STORE.byPath.get(cand);
  if (STORE.byLower.has(cand.toLowerCase())) return STORE.byLower.get(cand.toLowerCase());
  /* Last resort: match on the file name alone. Vendor packs occasionally point at a folder
     casing or nesting that does not exist on a case sensitive filesystem. */
  const hits = STORE.byBase.get(cand.split('/').pop().toLowerCase());
  return hits && hits.length ? hits[0] : null;
}

async function readTextEntry(entry) {
  return sniffText(await entry.file.arrayBuffer());
}
async function readXmlEntry(entry) {
  const { text, io } = await readTextEntry(entry);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const pe = doc.querySelector('parsererror');
  if (pe) throw new Error('XML parse error in ' + entry.path + ': ' + pe.textContent.slice(0, 180));
  return { doc, io, text };
}

/* DOM helpers that compare tag names exactly. Using a prefix match here is the classic way
   to make <BlockLength> look like <Block>, which silently drops a block from the design. */
const cText  = (n, t) => { const c = [...n.children].find(x => x.tagName === t); return c ? c.textContent : null; };
const cNodes = (n, t) => [...n.children].filter(x => x.tagName === t);
const cTrim  = (n, t) => { const v = cText(n, t); return v == null ? null : v.trim(); };

/* Walk a dropped directory entry tree into a flat File list carrying relative paths. */
function walkEntry(entry, out, path = '') {
  return new Promise(res => {
    if (entry.isFile) {
      entry.file(f => {
        try { Object.defineProperty(f, 'webkitRelativePath', { value: path + entry.name }); } catch (_) {}
        out.push(f); res();
      }, () => res());
    } else if (entry.isDirectory) {
      const rd = entry.createReader(); const all = [];
      const step = () => rd.readEntries(async ents => {
        if (!ents.length) { for (const c of all) await walkEntry(c, out, path + entry.name + '/'); res(); }
        else { all.push(...ents); step(); }
      }, () => res());
      step();
    } else res();
  });
}
