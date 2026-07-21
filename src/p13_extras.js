/* ======================================================================================
   10. HINTS, TEMPLATES, DEMO, CALIBRATION AND THE RAW FILE EDITOR
   ====================================================================================== */

/* ---------------------------------------------------------------------------
   10a. Collapsible hints

   Every hint is collapsed until asked for, so the interface stays quiet for
   someone who already knows the format and becomes a reference for someone who
   does not. Each hint says where its information comes from, because some of it
   is a documented rule and some of it is a convention observed across real
   paradigm files, and the two carry different weight.
   --------------------------------------------------------------------------- */

function hintPanel(title, build) {
  const d = el('details', { class: 'hintbox' });
  d.appendChild(el('summary', {}, [el('span', { class: 'caret', text: '›' }), ' ', title]));
  const body = el('div', { class: 'hintbody' });
  d.appendChild(body);
  let built = false;
  d.addEventListener('toggle', () => { if (d.open && !built) { built = true; build(body); } });
  return d;
}

/* Variable names are user chosen in these files, not a fixed vocabulary. What follows is
   the set that recurs across the real paradigms, with the meaning each one carries in
   practice. Offering them as a menu removes the guesswork without pretending the list is
   exhaustive or normative. */
const VARIABLE_CONVENTIONS = [
  { key: 'OnBlockLength',   value: '30000', note: 'Length of one active block, in milliseconds.' },
  { key: 'OffBlockLength',  value: '30000', note: 'Length of one rest block, in milliseconds.' },
  { key: 'BlockLength',     value: '30000', note: 'Block length where active and rest are the same.' },
  { key: 'OnShowDuration',  value: '600',   note: 'How long the cue is visible inside a repeating active trial.' },
  { key: 'OnHideDuration',  value: '150',   note: 'How long the screen returns to the fixation cross between cues.' },
  { key: 'OnBlockBlinks',   value: '40',    note: 'How many times the show and hide pair repeats to fill one block.' },
  { key: 'VolPrBlock',      value: '20',    note: 'Volumes per block. Documentation only; the design length is what actually governs.' },
  { key: 'InstructionTime', value: '3000',  note: 'How long the instruction screen is held before the run.' },
  { key: 'RestLength',      value: '9000',  note: 'Short rest between stimulus blocks in an event style design.' },
  { key: 'WordLength',      value: '3000',  note: 'How long a single word or picture stimulus is shown.' }
];

const XML_ELEMENT_HELP = [
  ['Settings / TimeToRepeat', 'Repetition time in milliseconds. The scanner acquires one volume in this time.'],
  ['Settings / Volumes', 'How many volumes the scanner is told to acquire. Compare against the design length in the status bar.'],
  ['Settings / Slices', 'Slices per volume. Recorded for the console, not used in timing.'],
  ['Settings / InterPulseInterval', 'Interval between trigger pulses. Usually equal to the repetition time.'],
  ['Settings / AverageBlockLength', 'Documentation of the nominal block length. Not used to compute timing.'],
  ['Defaults / FontSize', 'Font height in pixels ON THE ACTUAL DISPLAY, held in the per version defaults file. A stimulus can override it with its own fontsize element.'],
  ['Defaults / BackGroundColor, ForeGroundColor', 'Screen and text colour. A named colour, or a css colour in the JSON format.'],
  ['Position', 'A named screen location. Either a keyword such as center, or a number, which is a coordinate in the display space the paradigm was authored against.'],
  ['Slide / Picture', 'Rendered at its native pixel size and centred. Nothing is scaled to fit, so the file dimensions are the on screen dimensions.'],
  ['Slide / text', 'Text drawn with the current font size. A newline in the value produces a second line.'],
  ['Slide / duration', 'How long this stimulus stays up, in milliseconds, when the trial does not specify its own.'],
  ['Slide / expectedResponse', 'Which response key counts as correct for this stimulus.'],
  ['Trial / show', 'Present a named stimulus. An explicit duration here overrides the stimulus default.'],
  ['Trial / wait', 'Hold the current screen for this many milliseconds.'],
  ['Trial / clear', 'Blank the screen. With a value, blank and hold for that many milliseconds.'],
  ['Trial / register', 'Wait for one of these keys. This is how the paradigm waits for the scanner trigger, and it consumes no scan time.'],
  ['Trial / condition', 'Condition for a trial the session runs directly. Inside a block the block condition governs instead.'],
  ['Block / condition', '0 is rest or baseline. 1 and above are active conditions.'],
  ['Block / repetitions', 'How many times the trial list inside the block repeats. 0 and 1 both mean once.'],
  ['Block / order', 'A value of 1 randomises the order of the trials within the block. A value of 0 keeps them in the order listed. Note that some paradigm files carry a comment next to this element that contradicts the value; the value is what governs.'],
  ['Trial / show, duration', 'A duration of zero, or no duration at all, means the stimulus stays on screen until the next stimulus appears, and the sequence continues immediately.'],
  ['Trial / show, overlap', 'With overlap true the next command runs immediately, so the stimulus can remain on screen while the following one is drawn. With overlap false the sequence waits for the duration to elapse.'],
  ['Trial / show, abortion', 'With abortion true the presentation is interrupted when a response is registered, and the screen stays blank for the remainder of the duration.'],
  ['Trial / marker', 'Emits an output marker on the configured serial or TTL output at the point it is reached.'],
  ['Trial / register, number', 'Which pulse to wait for, counting from 1. Without it, the next pulse is taken.']
];

function hintVariables(host) {
  host.appendChild(el('p', { text: 'Variable names in these files are chosen by whoever wrote the paradigm; there is no fixed vocabulary. The names below are the ones that recur across the real paradigm library, with the meaning each carries in practice. Adding one inserts it with a typical starting value.' }));
  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [el('th', { text: 'Name' }), el('th', { text: 'Typical' }), el('th', { text: 'What it usually means' }), el('th', { text: '' })])));
  const tb = el('tbody');
  for (const v of VARIABLE_CONVENTIONS) {
    const exists = M.variables.some(x => x.key === v.key);
    tb.appendChild(el('tr', {}, [
      el('td', { class: 'mono', text: '$' + v.key }),
      el('td', { class: 'num', text: v.value }),
      el('td', { class: 'mut', text: v.note }),
      el('td', {}, el('button', {
        class: 'mini', text: exists ? 'already defined' : 'add', disabled: exists,
        onclick: () => edit(() => M.variables.push({ key: v.key, value: v.value }))
      }))
    ]));
  }
  t.appendChild(tb);
  host.appendChild(t);
  host.appendChild(el('p', { class: 'mut', style: 'margin-top:8px', text: 'A variable is referenced elsewhere with a dollar sign, for example $OnBlockLength in a duration or a repetition count. The Validate tab reports a name that is referenced but never defined, and also a value that matches a variable name but is missing its dollar sign, which is the more common mistake because it fails silently.' }));
}

function hintElements(host) {
  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [el('th', { text: 'Field' }), el('th', { text: 'Meaning' })])));
  const tb = el('tbody');
  for (const [k, v] of XML_ELEMENT_HELP)
    tb.appendChild(el('tr', {}, [el('td', { class: 'mono nowrap' }, k), el('td', { class: 'mut', text: v })]));
  t.appendChild(tb);
  host.appendChild(el('div', { class: 'scroll' }, t));
}

/* ---------------------------------------------------------------------------
   10b. Generated assets

   The demo and the calibration targets draw their images in the browser rather
   than shipping binary blobs, which keeps this one file self contained.
   --------------------------------------------------------------------------- */

function canvasToFile(cvs, name) {
  return new Promise(res => cvs.toBlob(b => {
    const f = new File([b], name.split('/').pop(), { type: 'image/png' });
    res(f);
  }, 'image/png'));
}

function drawFixationCross(size, colour) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.strokeStyle = colour; x.lineWidth = Math.max(2, Math.round(size * 0.11)); x.lineCap = 'butt';
  x.beginPath();
  x.moveTo(size / 2, size * 0.06); x.lineTo(size / 2, size * 0.94);
  x.moveTo(size * 0.06, size / 2); x.lineTo(size * 0.94, size / 2);
  x.stroke();
  return c;
}

function drawCheckerboard(size, squares) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size / squares;
  for (let i = 0; i < squares; i++) for (let j = 0; j < squares; j++) {
    x.fillStyle = ((i + j) % 2) ? '#ffffff' : '#000000';
    x.fillRect(i * s, j * s, Math.ceil(s), Math.ceil(s));
  }
  return c;
}

/* A full screen calibration frame: one centred outlined box of a known pixel size, with
   its dimensions printed clear of the box rather than across it, a faint screen edge and a
   centre crosshair. */
function drawCalibrationBox(screenW, screenH, boxW, boxH, label) {
  const c = document.createElement('canvas');
  c.width = screenW; c.height = screenH;
  const x = c.getContext('2d');
  x.fillStyle = '#000000'; x.fillRect(0, 0, screenW, screenH);

  const inset = Math.max(2, Math.round(screenH * 0.004));
  x.strokeStyle = '#3a3a3a'; x.lineWidth = Math.max(1, Math.round(screenH * 0.002));
  x.strokeRect(inset, inset, screenW - 2 * inset, screenH - 2 * inset);

  const cx = screenW / 2, cy = screenH / 2;
  const arm = Math.round(screenH * 0.02);
  x.strokeStyle = '#4d4d4d';
  x.beginPath();
  x.moveTo(cx - arm, cy); x.lineTo(cx + arm, cy);
  x.moveTo(cx, cy - arm); x.lineTo(cx, cy + arm);
  x.stroke();

  x.strokeStyle = '#ffffff';
  x.lineWidth = Math.max(2, Math.round(screenH * 0.0035));
  x.strokeRect(Math.round(cx - boxW / 2), Math.round(cy - boxH / 2), Math.round(boxW), Math.round(boxH));

  /* The label sits centred in the gap between the box edge and the screen edge, above the
     box when there is room and below it otherwise, so that it never crosses the outline
     the box exists to show. */
  const fs = Math.max(14, Math.round(screenH * 0.028));
  x.font = `bold ${fs}px sans-serif`;
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  const gapTop = cy - boxH / 2, gapBottom = screenH - (cy + boxH / 2);
  if (gapTop >= fs * 2.2) { x.textBaseline = 'middle'; x.fillText(label, cx, gapTop / 2); }
  else if (gapBottom >= fs * 2.2) { x.textBaseline = 'middle'; x.fillText(label, cx, cy + boxH / 2 + gapBottom / 2); }
  else { x.textBaseline = 'top'; x.fillText(label, cx, inset + fs * 0.4); }
  return c;
}

/* ---------------------------------------------------------------------------
   10c. Templates and the demo
   --------------------------------------------------------------------------- */

const NEW_TEMPLATES = [
  {
    id: 'xml', title: 'Paradigm folder, XML',
    note: 'The multi file package: a main file plus separate trials, per version stimulus, per version defaults and per language description files. Choose this to produce something the presentation software loads directly.',
    build: () => scaffoldNative('nnl-xml')
  },
  {
    id: 'json', title: 'Paradigm JSON',
    note: 'The single file form, with the stimulus sets keyed by language and display version. Same content as the package above in one file.',
    build: () => scaffoldNative('nnl-json-a')
  },
  {
    id: 'neutral', title: 'Neutral paradigm',
    note: 'Start format independent and decide later. Everything is editable and the Convert tab will write whichever format you settle on.',
    build: () => scaffoldNative('neutral')
  }
];

function scaffoldNative(kind) {
  const m = emptyModel();
  m.name = 'New paradigm';
  m.source = {
    kind: kind === 'nnl-xml' ? 'nnl-xml' : kind === 'nnl-json-a' ? 'nnl-json-a' : 'neutral',
    label: kind === 'nnl-xml' ? 'Paradigm folder (XML)' : kind === 'nnl-json-a' ? 'Paradigm JSON (identifier referenced)' : 'Neutral paradigm',
    baseDir: '', mainPath: 'New paradigm'
  };
  /* The scaffold is a rest, task, rest sandwich: three blocks of thirty seconds is ninety
     seconds, which is exactly thirty volumes at a repetition time of three seconds. It
     starts consistent so that the first thing a new user sees is a design that validates,
     and the status bar stays green as they extend it. */
  m.acq = { trMs: '3000', volumes: '30', slices: '34', ipiMs: '3000', avgBlockMs: '30000' };
  m.variables = [{ key: 'OnBlockLength', value: '30000' }, { key: 'OffBlockLength', value: '30000' }];
  m.versions = ['VisualSystem', 'VisualSystem-HD', 'LCD-HD', 'LCD-4K'];
  m.languages = ['English'];
  m.defaults = { bg: 'Black', fg: 'White', font: 'Arial', defaultPosition: 'MidPos', version: 'LCD-HD', language: 'English' };
  m.fontSizeByVersion = { 'VisualSystem': 58, 'VisualSystem-HD': 104, 'LCD-HD': 104, 'LCD-4K': 208 };
  m.positions = [{ name: 'MidPos', horizontal: 'center', vertical: 'center' }];
  m.descriptions = [{ language: 'English', text: 'Paradigm name\n\nDescription:\n\n---\nInstructions:\n\n---', inline: kind !== 'nnl-xml', path: './New_paradigm_description_en.xml' }];
  m.bold.contrasts = [{ name: 'Active versus rest', weight: '1' }];

  m.slideSets = [{
    key: { kind: 'none' }, path: './New_paradigm_slides.xml', root: 'IncludeSlides',
    slides: [
      { name: 'Start', text: 'Starting soon', pictures: [], sound: null, video: null, duration: null },
      { name: 'Rest', text: '+', pictures: [], sound: null, video: null, duration: null },
      { name: 'Task', text: 'TASK', pictures: [], sound: null, video: null, duration: null }
    ]
  }];
  m.raw = {
    trialsFile: { path: './New_paradigm_trials.xml', io: { enc: 'utf-8', hasDecl: true, crlf: true } },
    mainIO: { enc: 'utf-8', hasDecl: true, crlf: true },
    defaultsFiles: m.versions.map(v => ({
      version: v, path: `./Defaults_${v}.xml`, fontSize: String(m.fontSizeByVersion[v] ?? ''),
      defaultPicture: '', extra: [], io: { enc: 'utf-8', hasDecl: true, crlf: true }
    }))
  };
  m.trials = [
    { name: 'Start', ops: [{ type: 'show', item: 'Start', duration: null, overlap: true }, { type: 'register', keys: ['s'] }] },
    { name: 'RestTrial', ops: [{ type: 'condition', value: '0' }, { type: 'show', item: 'Rest', duration: '$OffBlockLength', overlap: false }] },
    { name: 'TaskTrial', ops: [{ type: 'show', item: 'Task', duration: '$OnBlockLength', overlap: false }] }
  ];
  m.blocks = [{ name: 'Task', condition: '1', trials: ['TaskTrial'], repetitions: '1', order: '0' }];
  m.session = [
    { kind: 'trial', ref: 'Start' },
    { kind: 'trial', ref: 'RestTrial' },
    { kind: 'block', ref: 'Task' },
    { kind: 'trial', ref: 'RestTrial' }
  ];
  m.notes.push('New paradigm scaffold. Set the acquisition parameters, then build the session on the Design tab. The status bar compares the design length against the declared volume count as you go.');
  return m;
}

/* Two demonstration paradigms. Both are written here from scratch rather than taken from
   any supplied file, so they contain no site or patient material, and both are internally
   consistent: the design length equals the declared volume count exactly. */
const DEMOS = [
  {
    id: 'motor', title: 'Bilateral finger tapping',
    note: 'The standard clinical motor task. Thirty second blocks, alternating tapping and rest, TR 3 s, 90 volumes. Uses a text cue and a generated fixation cross.',
    build: buildMotorDemo
  },
  {
    id: 'visual', title: 'Flashing checkerboard localiser',
    note: 'A visual localiser with a reversing checkerboard at 8 Hz against fixation. Twenty second blocks, TR 2 s, 150 volumes. Uses two generated checkerboard images.',
    build: buildVisualDemo
  }
];

async function buildMotorDemo() {
  const m = scaffoldNative('nnl-xml');
  m.name = 'Demo Bilateral Finger Tapping';
  m.acq = { trMs: '3000', volumes: '90', slices: '34', ipiMs: '3000', avgBlockMs: '30000' };
  m.variables = [{ key: 'OnBlockLength', value: '30000' }, { key: 'OffBlockLength', value: '30000' }];
  m.descriptions = [{
    language: 'English', inline: false, path: './Demo_description_en.xml',
    text: 'Demo Bilateral Finger Tapping\n\nDescription:\nThirty second blocks alternating bilateral finger tapping with rest.\n1 rest block then 4 cycles (B AB AB AB AB), 9 blocks in total.\nTR 3000 ms, 90 volumes, total run time 4 minutes 30 seconds.\n\n---\nInstructions:\nWhen the screen shows TAP, tap the thumb of each hand against each finger in turn, both hands together, at a comfortable steady pace. When the screen shows the cross, stop tapping and look at the cross without moving.\n---'
  }];
  m.bold.contrasts = [{ name: 'Tapping versus rest', weight: '1' }];

  const cross = drawFixationCross(74, '#ffffff');
  const crossFile = await canvasToFile(cross, 'Cross.png');
  m.assets = [{ rel: 'Pictures/Cross.png', file: crossFile, size: crossFile.size }];

  m.slideSets = [{
    key: { kind: 'none' }, path: './Demo_slides.xml', root: 'IncludeSlides',
    slides: [
      { name: 'Start', text: 'Bilateral finger tapping\n\nstarting soon', pictures: [], sound: null, video: null, duration: null },
      { name: 'Rest', text: null, pictures: [{ value: './Pictures/Cross.png' }], sound: null, video: null, duration: null },
      { name: 'Tap', text: 'TAP', pictures: [], sound: null, video: null, duration: null }
    ]
  }];
  m.trials = [
    { name: 'Start', ops: [{ type: 'show', item: 'Start', duration: null, overlap: true }, { type: 'register', keys: ['s'] }] },
    { name: 'RestTrial', ops: [{ type: 'condition', value: '0' }, { type: 'show', item: 'Rest', duration: '$OffBlockLength', overlap: false }] },
    { name: 'TapTrial', ops: [{ type: 'show', item: 'Tap', duration: '$OnBlockLength', overlap: false }] }
  ];
  m.blocks = [{ name: 'Tapping', condition: '1', trials: ['TapTrial'], repetitions: '1', order: '0' }];
  m.session = [{ kind: 'trial', ref: 'Start' }];
  for (let i = 0; i < 4; i++) {
    m.session.push({ kind: 'trial', ref: 'RestTrial' });
    m.session.push({ kind: 'block', ref: 'Tapping' });
  }
  m.session.push({ kind: 'trial', ref: 'RestTrial' });
  m.notes = ['Demonstration paradigm, written from scratch for this tool. Nine blocks of thirty seconds give 270 s, which is exactly 90 volumes at a repetition time of 3000 ms.'];
  return m;
}

async function buildVisualDemo() {
  const m = scaffoldNative('nnl-xml');
  m.name = 'Demo Checkerboard Localiser';
  m.acq = { trMs: '2000', volumes: '150', slices: '34', ipiMs: '2000', avgBlockMs: '20000' };
  /* A reversal every 125 ms is 8 reversals per second, the usual rate for this localiser,
     and a 250 ms pair divides 20000 ms exactly 80 times, so the block lands on a whole
     number of reversals with nothing left over. */
  m.variables = [
    { key: 'BlockLength', value: '20000' },
    { key: 'FlashOn', value: '125' }
  ];
  m.descriptions = [{
    language: 'English', inline: false, path: './Demo_description_en.xml',
    text: 'Demo Checkerboard Localiser\n\nDescription:\nTwenty second blocks alternating a contrast reversing checkerboard with fixation.\n1 rest block then 7 cycles, 15 blocks in total.\nTR 2000 ms, 150 volumes, total run time 5 minutes.\nThe checkerboard reverses every 62 ms, which is approximately 8 reversals per second.\n\n---\nInstructions:\nLook at the small cross in the middle of the screen for the whole run. Keep looking at it while the pattern flashes. Do not move your eyes to follow the pattern.\n---'
  }];
  m.bold.contrasts = [{ name: 'Checkerboard versus fixation', weight: '1' }];

  const a = drawCheckerboard(512, 16);
  const b = document.createElement('canvas');
  b.width = b.height = 512;
  const bx = b.getContext('2d');
  bx.drawImage(a, 0, 0);
  bx.globalCompositeOperation = 'difference';
  bx.fillStyle = '#ffffff'; bx.fillRect(0, 0, 512, 512);   /* the contrast reversed pattern */
  const cross = drawFixationCross(48, '#ff4444');
  const [fa, fb, fc] = await Promise.all([
    canvasToFile(a, 'CheckerA.png'), canvasToFile(b, 'CheckerB.png'), canvasToFile(cross, 'Cross.png')
  ]);
  m.assets = [
    { rel: 'Pictures/CheckerA.png', file: fa, size: fa.size },
    { rel: 'Pictures/CheckerB.png', file: fb, size: fb.size },
    { rel: 'Pictures/Cross.png', file: fc, size: fc.size }
  ];

  m.slideSets = [{
    key: { kind: 'none' }, path: './Demo_slides.xml', root: 'IncludeSlides',
    slides: [
      { name: 'Start', text: 'Checkerboard localiser\n\nstarting soon', pictures: [], sound: null, video: null, duration: null },
      { name: 'Fixation', text: null, pictures: [{ value: './Pictures/Cross.png' }], sound: null, video: null, duration: null },
      { name: 'CheckA', text: null, pictures: [{ value: './Pictures/CheckerA.png' }, { value: './Pictures/Cross.png' }], sound: null, video: null, duration: null },
      { name: 'CheckB', text: null, pictures: [{ value: './Pictures/CheckerB.png' }, { value: './Pictures/Cross.png' }], sound: null, video: null, duration: null }
    ]
  }];
  m.trials = [
    { name: 'Start', ops: [{ type: 'show', item: 'Start', duration: null, overlap: true }, { type: 'register', keys: ['s'] }] },
    { name: 'FixationTrial', ops: [{ type: 'condition', value: '0' }, { type: 'show', item: 'Fixation', duration: '$BlockLength', overlap: false }] },
    { name: 'Reversal', ops: [
      { type: 'show', item: 'CheckA', duration: '$FlashOn', overlap: false },
      { type: 'show', item: 'CheckB', duration: '$FlashOn', overlap: false }
    ] }
  ];
  m.blocks = [{ name: 'Checkerboard', condition: '1', trials: ['Reversal'], repetitions: '80', order: '0' }];
  m.session = [{ kind: 'trial', ref: 'Start' }];
  for (let i = 0; i < 7; i++) {
    m.session.push({ kind: 'trial', ref: 'FixationTrial' });
    m.session.push({ kind: 'block', ref: 'Checkerboard' });
  }
  m.session.push({ kind: 'trial', ref: 'FixationTrial' });
  m.notes = ['Demonstration paradigm, written from scratch for this tool. Each checkerboard block is 80 reversal pairs of 250 ms, which is exactly 20000 ms, so fifteen blocks give 300 s and exactly 150 volumes at a repetition time of 2000 ms.'];
  return m;
}

/* Point every file path at the paradigm's own name, so a scaffold that is renamed does not
   keep writing files called New_paradigm. */
function renameFilesAfterParadigm(m) {
  const p = safeName(m.name);
  m.source.mainPath = `${p}.xml`;
  if (m.raw && m.raw.trialsFile) m.raw.trialsFile.path = `./${p}_trials.xml`;
  for (const set of m.slideSets) {
    const k = set.key;
    set.path = k.kind === 'version' ? `./${p}_slides_${k.version}.xml`
      : k.kind === 'language' ? `./${p}_slides_${LANG_CODE[k.language] || String(k.language).slice(0, 2).toLowerCase()}.xml`
      : `./${p}_slides.xml`;
  }
  for (const d of m.descriptions)
    if (!d.inline) d.path = `./${p}_description_${LANG_CODE[d.language] || String(d.language).slice(0, 2).toLowerCase()}.xml`;
  for (const f of (m.raw && m.raw.defaultsFiles) || []) f.path = `./Defaults_${f.version}.xml`;
  return m;
}

async function loadGeneratedModel(builder) {
  STORE = STORE || buildStore([]);
  const m = renameFilesAfterParadigm(await builder());
  /* Generated assets are addressed through the same store as opened files, so that the
     preview, the sizing report and the export all resolve them the usual way. */
  const files = m.assets.map(a => {
    try { Object.defineProperty(a.file, 'webkitRelativePath', { value: a.rel }); } catch (_) {}
    return a.file;
  });
  STORE = buildStore(files);
  IMG_CACHE.clear();
  for (const u of URL_CACHE.values()) URL.revokeObjectURL(u);
  URL_CACHE.clear();

  FOUND = [{ entry: { path: m.name }, kind: m.source.kind, label: m.name, load: async () => m }];
  const sel = $('#selParadigm');
  sel.innerHTML = '';
  sel.appendChild(el('option', { value: 0 }, m.name));
  $('#topctl').hidden = false;
  $('#btnReload').hidden = false;
  $('#btnExport').hidden = false;
  $('#loader').hidden = true;
  $('#app').hidden = false;
  await loadParadigm(0);
  selectTab('design');
}

/* ---------------------------------------------------------------------------
   10d. Calibration

   Answers the two questions that come up the first time anyone builds stimuli:
   how large should the text be, and how large should the pictures be. Both are
   previewed against the real display geometry, and both can be exported as a
   runnable calibration paradigm to check on the in bore display, because a
   screen on a desk is not the same as a screen seen through a head coil.
   --------------------------------------------------------------------------- */

const CAL = { fontPx: 104, word: 'difficult', aspect: '1:1', frac: 0.5, customW: 4, customH: 3 };

function tabCalibrate(host) {
  host.innerHTML = '';
  const [sw, sh] = SCREEN;

  host.appendChild(el('div', { class: 'banner warn' }, el('div', {
    html: '<b>A preview on this monitor is an approximation.</b> It shows the true proportions against the display geometry you have selected, which settles most questions on its own. For the final value, export the calibration paradigm at the bottom of this page and page through it on the in bore display with a volunteer, because viewing distance through a head coil changes what is legible.'
  })));

  /* ---- text size ---- */
  const pf = panel('Text size');
  pf.appendChild(el('div', { class: 'row' }, [
    el('label', { text: 'Sample word' }),
    el('input', { type: 'text', value: CAL.word, style: 'width:170px', onchange: e => { CAL.word = e.target.value; renderTab('calibrate'); } }),
    el('span', { class: 'mut', text: 'use the longest word in your stimulus set, it is the worst case for width' })
  ]));
  const fRow = el('div', { class: 'row', style: 'margin-top:8px' }, [
    el('label', { text: 'Font size' }),
    el('input', {
      type: 'range', min: 20, max: Math.round(sh * 0.5), step: 1, value: Math.min(CAL.fontPx, Math.round(sh * 0.5)),
      style: 'flex:1;min-width:180px',
      oninput: e => { CAL.fontPx = Number(e.target.value); updateFontPreview(); }
    }),
    el('input', {
      type: 'number', value: CAL.fontPx, min: 1, style: 'width:80px',
      onchange: e => { CAL.fontPx = Number(e.target.value) || 1; renderTab('calibrate'); }
    }),
    el('span', { class: 'mut', text: 'px' })
  ]);
  pf.appendChild(fRow);
  const fCvs = el('canvas', { class: 'screen', id: 'calFontCanvas' });
  pf.appendChild(fCvs);
  pf.appendChild(el('div', { class: 'hint', id: 'calFontInfo' }));

  const applyRow = el('div', { class: 'row', style: 'margin-top:9px' }, [
    el('button', {
      class: 'good mini', text: `Set the ${ACTIVE.version} default to ${CAL.fontPx} px`,
      onclick: () => edit(() => {
        M.fontSizeByVersion[ACTIVE.version] = CAL.fontPx;
        const df = (M.raw.defaultsFiles || []).find(f => f.version === ACTIVE.version);
        if (df) df.fontSize = String(CAL.fontPx);
        toast(`Default font size for ${ACTIVE.version} set to ${CAL.fontPx} px.`);
      })
    }),
    el('span', { class: 'mut', text: 'writes the per version default that every text stimulus inherits' })
  ]);
  pf.appendChild(applyRow);
  pf.appendChild(hintPanel('How the font size number is interpreted', h => {
    h.appendChild(el('p', { text: 'The value is the font height in pixels on the actual display, not a point size and not a fraction. A value of 104 on a 1080 line display is therefore just under a tenth of the screen height. The per version default lives in that version\'s defaults file, and any single stimulus can override it with its own font size.' }));
    h.appendChild(el('p', { text: 'The two numbers worth finding are the smallest size that is comfortably legible in the bore, and the size at which your longest word starts to run off the side of the screen. Choose something between them, closer to the legible end.' }));
  }));
  host.appendChild(pf);

  /* ---- image size ---- */
  const pi = panel('Picture size');
  pi.appendChild(el('div', { class: 'hint', text: 'Pictures are presented at their native pixel size and centred. Nothing is scaled to fit, so the dimensions of the file are the dimensions on screen. This calculator turns the size you want on screen into the pixel dimensions to export your stimuli at.' }));
  pi.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [
    el('label', { text: 'Aspect' }),
    (() => {
      const s = el('select', { onchange: e => { CAL.aspect = e.target.value; renderTab('calibrate'); } });
      for (const a of ['1:1', '4:3', '3:2', '16:9', 'custom'])
        s.appendChild(el('option', { value: a, selected: a === CAL.aspect }, a));
      return s;
    })(),
    CAL.aspect === 'custom' ? el('input', { type: 'number', value: CAL.customW, min: 1, style: 'width:64px', onchange: e => { CAL.customW = Number(e.target.value) || 1; renderTab('calibrate'); } }) : null,
    CAL.aspect === 'custom' ? el('span', { class: 'mut', text: ':' }) : null,
    CAL.aspect === 'custom' ? el('input', { type: 'number', value: CAL.customH, min: 1, style: 'width:64px', onchange: e => { CAL.customH = Number(e.target.value) || 1; renderTab('calibrate'); } }) : null
  ]));
  pi.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [
    el('label', { text: 'Height' }),
    el('input', {
      type: 'range', min: 10, max: 100, step: 1, value: Math.round(CAL.frac * 100),
      style: 'flex:1;min-width:180px',
      oninput: e => { CAL.frac = Number(e.target.value) / 100; updateImagePreview(); }
    }),
    el('span', { class: 'mono', id: 'calFracLabel', text: Math.round(CAL.frac * 100) + '% of screen height' })
  ]));
  const iCvs = el('canvas', { class: 'screen', id: 'calImageCanvas' });
  pi.appendChild(iCvs);
  pi.appendChild(el('div', { class: 'hint', id: 'calImageInfo' }));
  host.appendChild(pi);

  /* ---- export ---- */
  const pe = panel('Take it to the scanner');
  pe.appendChild(el('div', { class: 'hint', text: 'Writes a small self contained paradigm that steps through a ladder of text sizes and a ladder of box sizes, one screen at a time, advancing on a key press. Run it on the in bore display, note the values that work, and enter them above. Nothing in it acquires data.' }));
  pe.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [
    el('button', { class: 'good', text: 'Download calibration paradigm', onclick: () => downloadCalibrationPack() }),
    el('button', { class: 'mini', text: 'Load it here instead', onclick: () => loadGeneratedModel(() => buildCalibrationModel()) })
  ]));
  host.appendChild(pe);

  updateFontPreview();
  updateImagePreview();
}

function calAspectRatio() {
  if (CAL.aspect === 'custom') return (CAL.customW || 1) / (CAL.customH || 1);
  const [a, b] = CAL.aspect.split(':').map(Number);
  return a / b;
}

function updateFontPreview() {
  const cvs = $('#calFontCanvas');
  if (!cvs) return;
  const [sw, sh] = SCREEN;
  const cw = Math.min(620, Math.max(240, (cvs.parentElement.clientWidth || 600) - 26));
  cvs.width = cw; cvs.height = Math.round(cw * sh / sw);
  const scale = cw / sw;
  const x = cvs.getContext('2d');
  x.fillStyle = colorOf(M ? M.defaults.bg : 'Black');
  x.fillRect(0, 0, cvs.width, cvs.height);
  x.save();
  x.beginPath(); x.rect(0, 0, cvs.width, cvs.height); x.clip();
  const fs = CAL.fontPx * scale;
  x.font = `${fs}px ${(M && M.defaults.font) || 'Arial'}, sans-serif`;
  x.fillStyle = colorOf(M ? M.defaults.fg : 'White');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(CAL.word || 'difficult', cvs.width / 2, cvs.height / 2);
  /* true width measured at display scale, so the overflow test is honest */
  x.font = `${CAL.fontPx}px ${(M && M.defaults.font) || 'Arial'}, sans-serif`;
  const wPx = x.measureText(CAL.word || 'difficult').width;
  x.restore();

  const over = wPx > sw;
  const info = $('#calFontInfo');
  info.innerHTML =
    `<b>${CAL.fontPx} px</b> on a ${sw} by ${sh} screen is <b>${(100 * CAL.fontPx / sh).toFixed(1)}%</b> of the screen height. ` +
    `The word "${esc(CAL.word)}" measures about <b>${Math.round(wPx)} px</b> wide, which is ${(100 * wPx / sw).toFixed(0)}% of the screen width. ` +
    (over ? '<span class="pill bad">it runs off the screen</span>' : wPx > sw * 0.9 ? '<span class="pill warn">very close to the edge</span>' : '<span class="pill ok">fits</span>');
  const btn = $('#tab-calibrate button.good');
  if (btn && /Set the/.test(btn.textContent)) btn.textContent = `Set the ${ACTIVE.version} default to ${CAL.fontPx} px`;
  const numInput = [...$('#tab-calibrate').querySelectorAll('input[type=number]')][0];
  if (numInput) numInput.value = CAL.fontPx;
}

function updateImagePreview() {
  const cvs = $('#calImageCanvas');
  if (!cvs) return;
  const [sw, sh] = SCREEN;
  const cw = Math.min(620, Math.max(240, (cvs.parentElement.clientWidth || 600) - 26));
  cvs.width = cw; cvs.height = Math.round(cw * sh / sw);
  const scale = cw / sw;
  const ar = calAspectRatio();
  const boxH = Math.round(sh * CAL.frac);
  const boxW = Math.round(boxH * ar);
  const x = cvs.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, cvs.width, cvs.height);
  x.strokeStyle = '#3a3a3a'; x.lineWidth = 1;
  x.strokeRect(1, 1, cvs.width - 2, cvs.height - 2);
  x.strokeStyle = boxW > sw ? '#f85149' : '#ffffff';
  x.lineWidth = 2;
  x.strokeRect((cvs.width - boxW * scale) / 2, (cvs.height - boxH * scale) / 2, boxW * scale, boxH * scale);
  x.strokeStyle = '#4d4d4d';
  x.beginPath();
  x.moveTo(cvs.width / 2 - 8, cvs.height / 2); x.lineTo(cvs.width / 2 + 8, cvs.height / 2);
  x.moveTo(cvs.width / 2, cvs.height / 2 - 8); x.lineTo(cvs.width / 2, cvs.height / 2 + 8);
  x.stroke();

  const lbl = $('#calFracLabel');
  if (lbl) lbl.textContent = Math.round(CAL.frac * 100) + '% of screen height';
  const info = $('#calImageInfo');
  info.innerHTML =
    `Export your stimuli at <b>${boxW} by ${boxH} pixels</b> for this display. ` +
    `That is ${(100 * boxW / sw).toFixed(0)}% of the width and ${(100 * boxH / sh).toFixed(0)}% of the height. ` +
    (boxW > sw ? '<span class="pill bad">wider than the screen, it would be cropped</span>'
      : boxW > sw * 0.95 ? '<span class="pill warn">almost the full width</span>'
      : '<span class="pill ok">fits with a margin</span>') +
    `<br>For the other display versions at the same proportion: ` +
    Object.entries(SCREEN_PRESETS).map(([v, [w, h]]) => {
      const bh = Math.round(h * CAL.frac), bw = Math.round(bh * ar);
      return `${v} <b>${bw} by ${bh}</b>`;
    }).join(', ') + '.';
}

const CAL_FONT_LADDER = [0.06, 0.075, 0.09, 0.105, 0.12, 0.135, 0.15, 0.175, 0.2, 0.23];
const CAL_BOX_LADDER = [
  ['4:3', 4 / 3, 0.4], ['4:3', 4 / 3, 0.5], ['4:3', 4 / 3, 0.6], ['4:3', 4 / 3, 0.7], ['4:3', 4 / 3, 0.8], ['4:3', 4 / 3, 0.9],
  ['1:1', 1, 0.4], ['1:1', 1, 0.5], ['1:1', 1, 0.6], ['1:1', 1, 0.7], ['1:1', 1, 0.8], ['1:1', 1, 0.9]
];

async function buildCalibrationModel() {
  const m = scaffoldNative('nnl-xml');
  m.name = 'Display Calibration';
  m.acq = { trMs: '3000', volumes: '1', slices: '34', ipiMs: '3000', avgBlockMs: '3000' };
  m.variables = [];
  m.descriptions = [{
    language: 'English', inline: false, path: './Display_Calibration_description_en.xml',
    text: 'Display Calibration\n\nDescription:\nA bench test for setting text size and picture size on the in bore display. It acquires no data. Do not start the scanner.\n\n---\nInstructions:\nPress the advance key to step through the screens.\nFirst ladder: the word is shown at increasing sizes, each screen printing its own pixel height. Note the smallest size that is comfortably legible, and the size at which the word starts to run off the side.\nSecond ladder: each screen shows one outlined box of a known pixel size. Note the largest box that still sits inside the field of view with a comfortable margin. Export your picture stimuli at those dimensions.\n---'
  }];
  m.bold.contrasts = [];

  const versions = m.versions.filter(v => SCREEN_PRESETS[v]);
  const assets = [];
  const setsByVersion = {};
  for (const v of versions) {
    const [sw, sh] = SCREEN_PRESETS[v];
    const slides = [];
    CAL_FONT_LADDER.forEach((f, i) => {
      const px = Math.round(sh * f);
      slides.push({
        name: 'F' + String(i + 1).padStart(2, '0'),
        text: `${CAL.word || 'difficult'}\n${px} px`,
        fontsize: String(px), pictures: [], sound: null, video: null, duration: null
      });
    });
    for (let i = 0; i < CAL_BOX_LADDER.length; i++) {
      const [label, ar, frac] = CAL_BOX_LADDER[i];
      const bh = Math.round(sh * frac), bw = Math.round(bh * ar);
      const nm = 'B' + String(i + 1).padStart(2, '0');
      const rel = `Pictures/${nm}_${v}.png`;
      const cvs = drawCalibrationBox(sw, sh, bw, bh, `${bw} x ${bh} px    ${label}    ${Math.round(frac * 100)}% of screen height    [${nm}]`);
      const file = await canvasToFile(cvs, rel);
      assets.push({ rel, file, size: file.size });
      slides.push({ name: nm, text: null, pictures: [{ value: './' + rel }], sound: null, video: null, duration: null });
    }
    setsByVersion[v] = slides;
  }
  m.assets = assets;
  m.slideSets = versions.map(v => ({
    key: { kind: 'version', version: v },
    path: `./Display_Calibration_slides_${v}.xml`,
    root: 'IncludeSlides',
    slides: setsByVersion[v]
  }));
  m.slideSets.push({
    key: { kind: 'language', language: 'English' },
    path: './Display_Calibration_slides_en.xml',
    root: 'IncludeSlides',
    slides: [{ name: 'Start', text: 'Display calibration\n\npress the advance key', pictures: [], sound: null, video: null, duration: null }]
  });

  /* Each screen waits for a key rather than a duration, so the tester can dwell as long as
     they like. That makes the run length undefined, which is correct for a bench test. */
  const advance = ['s', 'C', 'D'];
  m.trials = [{ name: 'Start', ops: [{ type: 'show', item: 'Start', duration: null, overlap: true }, { type: 'register', keys: advance }] }];
  m.session = [{ kind: 'trial', ref: 'Start' }];
  const names = [
    ...CAL_FONT_LADDER.map((_, i) => 'F' + String(i + 1).padStart(2, '0')),
    ...CAL_BOX_LADDER.map((_, i) => 'B' + String(i + 1).padStart(2, '0'))
  ];
  for (const nm of names) {
    m.trials.push({ name: 'Show' + nm, ops: [{ type: 'condition', value: '0' }, { type: 'show', item: nm, duration: null, overlap: true }, { type: 'register', keys: advance }] });
    m.session.push({ kind: 'trial', ref: 'Show' + nm });
  }
  m.blocks = [];
  m.acq.volumes = '1';
  m.notes = ['Calibration paradigm. Every screen waits for a key press rather than a duration, so the run has no fixed length. Do not start the scanner while running it.'];
  return m;
}

async function downloadCalibrationPack() {
  toast('Generating calibration screens...');
  const m = await buildCalibrationModel();
  const saveM = M, saveTL = TL;
  M = m;
  try {
    TL = buildTimeline(M, ACTIVE.version || 'LCD-HD', 'English');
    const pack = await buildExportFiles();
    downloadBlob(zipStore(pack.files), 'Display Calibration.zip');
    toast(`Wrote ${pack.files.length} files to Display Calibration.zip`);
  } catch (e) {
    toast('Could not build the calibration pack: ' + e.message);
  } finally {
    M = saveM; TL = saveTL;
    if (M) refreshAll();
  }
}

/* ---------------------------------------------------------------------------
   10e. Raw files

   Shows every file the paradigm is made of as text, and lets it be edited
   directly. Saving reparses the whole paradigm from the edited bytes, so a
   change made here goes through exactly the same reader as a file opened from
   disk, and a mistake surfaces as a parse error rather than as silent damage.
   --------------------------------------------------------------------------- */

function currentFileSet() {
  const files = [];
  if (!M) return files;
  if (M.source.kind === 'nnl-xml') {
    files.push({ label: 'main paradigm', path: M.source.mainPath || (safeName(M.name) + '.xml'), text: () => serializeMainXml(M), lang: 'xml' });
    files.push({ label: 'trials', path: M.raw.trialsFile.path, text: () => serializeTrialsXml(M), lang: 'xml' });
    for (const s of M.slideSets) {
      if (s.missing) continue;
      files.push({ label: 'stimuli, ' + (s.key.kind === 'version' ? s.key.version : s.key.kind === 'language' ? s.key.language : 'base'), path: s.path, text: () => serializeSlideSetXml(M, s), lang: 'xml' });
    }
    for (const d of M.descriptions.filter(d => !d.inline))
      files.push({ label: 'description, ' + d.language, path: d.path, text: () => serializeDescriptionXml(M, d), lang: 'xml' });
    for (const f of (M.raw.defaultsFiles || []))
      files.push({ label: 'defaults, ' + f.version, path: f.path, text: () => serializeDefaultsXml(M, f), lang: 'xml' });
  } else {
    files.push({ label: 'paradigm', path: (M.source.mainPath || M.name) + '.json', text: () => serializeParadigmJson(M, ACTIVE.version, ACTIVE.language), lang: 'json' });
  }
  files.push({ label: 'neutral interchange', path: safeName(M.name) + '.paradigm.json', text: () => serializeNeutralJson(M, TL), lang: 'json', readOnly: true });
  return files;
}

function tabFiles(host) {
  host.innerHTML = '';
  const files = currentFileSet();
  tabFiles._i = Math.min(tabFiles._i || 0, files.length - 1);

  const sel = el('select', { style: 'max-width:340px', onchange: e => { tabFiles._i = Number(e.target.value); renderTab('files'); } });
  files.forEach((f, i) => sel.appendChild(el('option', { value: i, selected: i === tabFiles._i }, `${f.label}  (${f.path.replace(/^\.[\\/]/, '')})`)));

  const f = files[tabFiles._i];
  let text = '';
  try { text = f.text(); } catch (e) { text = 'Could not serialise this file: ' + e.message; }

  const p = panel('Raw file', el('span', { class: 'tools' }, [
    sel,
    el('button', { class: 'mini', text: 'Copy', onclick: () => { navigator.clipboard && navigator.clipboard.writeText($('#rawText').value); toast('Copied to the clipboard.'); } }),
    el('button', { class: 'mini', text: 'Download', onclick: () => downloadText($('#rawText').value, f.path.split(/[\\/]/).pop(), 'text/plain') })
  ]));
  p.appendChild(el('div', { class: 'hint', html: f.readOnly
    ? 'This file is generated from the paradigm and is shown for reference. Editing it here has no effect, because it is not a source file.'
    : 'This is what would be written for this file right now. Edit it and press Apply to reparse the whole paradigm from the edited text. Anything the format does not allow shows up as a parse error rather than being written out.' }));

  const ta = el('textarea', { id: 'rawText', spellcheck: 'false', style: 'min-height:52vh;font-size:12px;line-height:1.45' });
  ta.value = text;
  if (f.readOnly) ta.readOnly = true;
  p.appendChild(ta);

  const status = el('div', { class: 'hint', id: 'rawStatus' });
  if (!f.readOnly) {
    p.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [
      el('button', { class: 'good', text: 'Apply', onclick: () => applyRawEdit(f) }),
      el('button', { class: 'mini', text: 'Revert', onclick: () => renderTab('files') }),
      el('button', { class: 'mini', text: 'Check only', onclick: () => checkRawEdit(f) })
    ]));
  }
  p.appendChild(status);
  host.appendChild(p);

  host.appendChild(hintPanel('What each file in the package is for', h => {
    h.appendChild(el('table', {}, [el('tbody', {}, [
      ['main paradigm', 'Acquisition settings, variables, positions, the block definitions and the session order. It also lists which other files belong to the paradigm.'],
      ['trials', 'The trial definitions: what each trial shows, for how long, and whether it waits for a key.'],
      ['stimuli, per version', 'The pictures for one display resolution. The same stimulus name appears in every version file, pointing at a differently sized image.'],
      ['stimuli, per language', 'The wording for one language. Same stimulus names again, so the version and language files merge into one set at run time.'],
      ['defaults, per version', 'The font size and default picture for one display resolution.'],
      ['description, per language', 'The free text shown to the operator, including the patient instructions.']
    ].map(r => el('tr', {}, [el('td', { class: 'mono nowrap', text: r[0] }), el('td', { class: 'mut', text: r[1] })])))]));
  }));
}

function parseRawInto(f, text) {
  /* Parses the edited text and returns a patch to apply, or throws. */
  if (f.lang === 'json') {
    const json = JSON.parse(text);
    if (!json.settings || !json.session) throw new Error('This does not look like a paradigm JSON: it has no settings and session.');
    return { kind: 'json', json };
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const pe = doc.querySelector('parsererror');
  if (pe) throw new Error(pe.textContent.replace(/\s+/g, ' ').slice(0, 200));
  return { kind: 'xml', doc, root: doc.documentElement.tagName };
}

function checkRawEdit(f) {
  const st = $('#rawStatus');
  try {
    const r = parseRawInto(f, $('#rawText').value);
    st.innerHTML = `<span class="pill ok">parses cleanly</span> root element <span class="mono">${esc(r.kind === 'xml' ? r.root : 'json')}</span>`;
  } catch (e) {
    st.innerHTML = `<span class="pill bad">will not parse</span> ${esc(e.message)}`;
  }
}

async function applyRawEdit(f) {
  const st = $('#rawStatus');
  const text = $('#rawText').value;
  let parsed;
  try { parsed = parseRawInto(f, text); }
  catch (e) { st.innerHTML = `<span class="pill bad">not applied</span> ${esc(e.message)}`; return; }

  try {
    if (parsed.kind === 'json') {
      const fresh = readParadigmJson(parsed.json, { path: M.source.mainPath || (M.name + '.json') });
      fresh.assets = M.assets;
      M = fresh;
    } else {
      applyXmlPatch(f, parsed.doc);
    }
    M._edited = true;
    await preloadImages(M);
    refreshAll();
    renderTab('files');
    st.innerHTML = '<span class="pill ok">applied</span> the paradigm has been reparsed from the edited text';
    toast('Applied and reparsed.');
  } catch (e) {
    st.innerHTML = `<span class="pill bad">not applied</span> ${esc(e.message)}`;
  }
}

function applyXmlPatch(f, doc) {
  const root = doc.documentElement;
  const tag = root.tagName;
  if (tag === 'ParameterDescriptionFile') {
    /* Re-read every part the main file owns, leaving the included files alone. */
    const m = M;
    m.variables = [];
    const vN = root.querySelector('Variables');
    if (vN) for (const c of vN.children) m.variables.push({ key: c.tagName, value: c.textContent.trim() });
    const S = root.querySelector('Settings');
    if (!S) throw new Error('The main file needs a Settings element.');
    m.name = (cTrim(S, 'Name') || m.name).trim();
    m.acq = {
      slices: cTrim(S, 'Slices'), trMs: cTrim(S, 'TimeToRepeat'), ipiMs: cTrim(S, 'InterPulseInterval'),
      avgBlockMs: cTrim(S, 'AverageBlockLength'), volumes: cTrim(S, 'Volumes')
    };
    m.instruction = cText(S, 'Instruction') || '';
    const D = root.querySelector('Defaults');
    if (D) {
      m.defaults.bg = cTrim(D, 'BackGroundColor') || m.defaults.bg;
      m.defaults.fg = cTrim(D, 'ForeGroundColor') || m.defaults.fg;
      m.defaults.defaultPosition = cTrim(D, 'DefaultPosition') || m.defaults.defaultPosition;
      m.defaults.language = cTrim(D, 'Language') || m.defaults.language;
      m.defaults.version = cTrim(D, 'Version') || m.defaults.version;
    }
    m.positions = cNodes(root, 'Position').map(p => ({
      name: cTrim(p, 'name') || '', horizontal: cTrim(p, 'horizontal') || 'center', vertical: cTrim(p, 'vertical') || 'center'
    }));
    m.languages = cNodes(root.querySelector('Languages') || root, 'Language').map(l => l.textContent.trim());
    m.versions = cNodes(root.querySelector('Versions') || root, 'Version').map(v => v.textContent.trim());
    const B = root.querySelector('BOLDSettings');
    if (B) {
      const pr = B.querySelector('Process');
      m.bold.processRaw = pr ? pr.outerHTML : m.bold.processRaw;
      m.bold.contrasts = [...B.querySelectorAll('Contrasts>Contrast')].map(c => ({ name: c.getAttribute('name') || '', weight: c.textContent.trim() }));
    }
    m.blocks = cNodes(root, 'Block').map(b => ({
      name: cTrim(b, 'name') || '', condition: cTrim(b, 'condition') ?? '',
      trials: cNodes(b, 'trials').map(t => t.textContent.trim()),
      repetitions: cTrim(b, 'repetitions') ?? '1', order: cTrim(b, 'order') ?? '0',
      _order: childOrder(b)
    }));
    const sN = root.querySelector('Session');
    if (!sN) throw new Error('The main file needs a Session element.');
    m.sessionName = cTrim(sN, 'name');
    m.session = [...sN.children].filter(c => c.tagName === 'runtrial' || c.tagName === 'runblock')
      .map(c => ({ kind: c.tagName === 'runtrial' ? 'trial' : 'block', ref: c.textContent.trim() }));
    m.raw.topComments = topComments(root);
    return;
  }
  if (tag === 'IncludeTrials') {
    M.trials = cNodes(root, 'Trial').map(parseXmlTrial);
    return;
  }
  if (tag === 'IncludeSlides' || tag === 'Include') {
    const set = M.slideSets.find(s => s.path === f.path);
    if (set && tag === 'IncludeSlides') { set.slides = cNodes(root, 'Slide').map(parseXmlSlide); return; }
    const desc = M.descriptions.find(d => d.path === f.path);
    if (desc) { desc.text = root.querySelector('Description')?.textContent ?? ''; return; }
    if (set) { set.slides = cNodes(root, 'Slide').map(parseXmlSlide); return; }
    throw new Error('This file is not one of the stimulus or description files of the open paradigm.');
  }
  if (tag === 'IncludeDefaults') {
    const df = (M.raw.defaultsFiles || []).find(d => d.path === f.path);
    if (!df) throw new Error('This file is not one of the defaults files of the open paradigm.');
    df.fontSize = root.querySelector('FontSize')?.textContent?.trim() || '';
    df.defaultPicture = root.querySelector('DefaultPicture')?.textContent?.trim() || '';
    if (df.fontSize) M.fontSizeByVersion[df.version] = toNum(df.fontSize);
    return;
  }
  throw new Error(`Unexpected root element "${tag}".`);
}

/* ---------------------------------------------------------------------------
   10f. Bulk stimulus entry
   --------------------------------------------------------------------------- */

function uniqueStimulusName(set, base) {
  const taken = new Set(set.slides.map(s => String(s.name)));
  let stem = (base || 'stimulus').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'stimulus';
  if (!taken.has(stem)) return stem;
  let i = 2;
  while (taken.has(stem + i)) i++;
  return stem + i;
}

function pickFiles(accept, cb) {
  const inp = el('input', { type: 'file', accept, multiple: true, style: 'display:none' });
  document.body.appendChild(inp);
  inp.onchange = () => { if (inp.files.length) cb([...inp.files]); inp.remove(); };
  inp.click();
}

/* Turns pasted or opened text into stimulus records.

   Three shapes are accepted, because people have all three to hand: a plain list one per
   line, a delimited table with or without a header row, and a single line of words. The
   delimiter is detected from the text rather than asked for. */
function parseStimulusList(text) {
  const raw = String(text).replace(/\r\n?/g, '\n').trim();
  if (!raw) return { rows: [], note: 'nothing to import' };
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  const delimOf = l => (l.includes('\t') ? '\t' : l.includes(';') ? ';' : l.includes(',') ? ',' : null);
  const delim = delimOf(lines[0]) || lines.map(delimOf).find(Boolean) || null;

  /* One line, no delimiter, several words: treat each word as a stimulus. */
  if (lines.length === 1 && !delim && /\s/.test(lines[0])) {
    return { rows: lines[0].split(/\s+/).filter(Boolean).map(w => ({ text: w })), note: 'one stimulus per word' };
  }
  if (!delim) return { rows: lines.map(l => ({ text: l })), note: 'one stimulus per line' };

  const table = parseDelimited(raw, delim);
  if (!table.length) return { rows: [], note: 'nothing to import' };
  const head = table[0].map(h => h.trim().toLowerCase());
  const hasHeader = head.some(h => ['name', 'text', 'stimulus', 'word', 'duration', 'picture', 'image', 'sound', 'condition', 'response'].includes(h));
  const col = n => head.indexOf(n);
  const body = hasHeader ? table.slice(1) : table;

  const rows = body.map(r => {
    if (!hasHeader) {
      /* Positional: name, text, duration, picture, or a single column of text. */
      if (r.length === 1) return { text: r[0].trim() };
      return { name: r[0].trim(), text: (r[1] || '').trim(), duration: (r[2] || '').trim(), picture: (r[3] || '').trim() };
    }
    const pick = (...names) => { for (const n of names) { const i = col(n); if (i >= 0 && r[i] != null && r[i].trim() !== '') return r[i].trim(); } return ''; };
    return {
      name: pick('name'),
      text: pick('text', 'stimulus', 'word'),
      duration: pick('duration', 'duration_ms', 'ms'),
      picture: pick('picture', 'image', 'file'),
      sound: pick('sound', 'audio'),
      condition: pick('condition'),
      response: pick('response', 'key', 'correct')
    };
  }).filter(r => (r.text && r.text !== '') || r.picture || r.sound || r.name);

  return { rows, note: hasHeader ? `${delim === '\t' ? 'tab' : delim === ';' ? 'semicolon' : 'comma'} separated with a header row` : `${delim === '\t' ? 'tab' : delim === ';' ? 'semicolon' : 'comma'} separated, no header` };
}

function openStimulusImport(set) {
  const dlg = $('#pickDlg');
  $('#pickTitle').textContent = 'Import a list of stimuli';
  const body = $('#pickBody');
  body.innerHTML = '';

  body.appendChild(el('p', { class: 'mut', text: 'Paste the list, or open a file. One stimulus per line, optionally with fields separated by commas, tabs or semicolons. The format is detected as you type.' }));
  const ta = el('textarea', { rows: 9, spellcheck: 'false', placeholder: 'happy\nsad\nangry' });
  body.appendChild(ta);

  const prefixRow = el('div', { class: 'row', style: 'margin-top:8px' }, [
    el('label', { text: 'Name prefix when the list has no names' }),
    el('input', { type: 'text', value: 'S', style: 'width:80px', id: 'impPrefix' }),
    el('label', { text: 'Default duration ms' }),
    el('input', { type: 'text', value: '', placeholder: 'set by trial', style: 'width:100px', id: 'impDur' })
  ]);
  body.appendChild(prefixRow);

  const preview = el('div', { class: 'hint', style: 'margin-top:8px' });
  body.appendChild(preview);

  const update = () => {
    const { rows, note } = parseStimulusList(ta.value);
    if (!rows.length) { preview.innerHTML = '<span class="mut">Nothing recognised yet.</span>'; return; }
    const shown = rows.slice(0, 6).map(r => `${esc(r.name || '(auto)')} = ${esc((r.text || r.picture || r.sound || '').slice(0, 40))}`).join('<br>');
    preview.innerHTML = `<span class="pill ok">${rows.length} stimuli</span> read as ${esc(note)}.<br>${shown}${rows.length > 6 ? '<br><span class="mut">and ' + (rows.length - 6) + ' more</span>' : ''}`;
  };
  ta.addEventListener('input', update);
  update();

  const doImport = () => {
    const { rows } = parseStimulusList(ta.value);
    if (!rows.length) { toast('Nothing to import.'); return; }
    const prefix = ($('#impPrefix').value || 'S').trim();
    const defDur = ($('#impDur').value || '').trim();
    let n = 0;
    edit(() => {
      rows.forEach((r, i) => {
        const name = r.name ? uniqueStimulusName(set, r.name)
          : uniqueStimulusName(set, prefix + String(i + 1).padStart(2, '0'));
        const sl = {
          name,
          text: r.text ? r.text : (r.picture ? null : ''),
          pictures: r.picture ? [{ value: r.picture.startsWith('.') || r.picture.startsWith('/') ? r.picture : './Pictures/' + r.picture }] : [],
          sound: r.sound ? { value: r.sound.startsWith('.') ? r.sound : './audio/' + r.sound } : null,
          video: null,
          duration: r.duration || defDur || null,
          condition: r.condition || null,
          expectedResponse: r.response ? { keys: r.response.split(/[\s,]+/).filter(Boolean) } : null
        };
        set.slides.push(sl);
        n++;
      });
    });
    dlg.close();
    toast(`Added ${n} stimuli.`);
  };

  const foot = dlg.querySelector('.dlg-f');
  foot.innerHTML = '';
  foot.appendChild(el('button', { class: 'ghost', text: 'Cancel', onclick: () => dlg.close() }));
  foot.appendChild(el('button', { class: 'mini', text: 'Open a file', onclick: () => pickFiles('.csv,.tsv,.txt,text/*', async fs => {
    ta.value = (await sniffText(await fs[0].arrayBuffer())).text; update();
  }) }));
  foot.appendChild(el('button', { class: 'good', text: 'Add these stimuli', onclick: doImport }));
  dlg.showModal();
  ta.focus();
}

/* ---------------------------------------------------------------------------
   10g. The choice dialogs for a new paradigm and for the demo
   --------------------------------------------------------------------------- */

function openChoiceDialog(title, intro, options) {
  const dlg = $('#pickDlg');
  $('#pickTitle').textContent = title;
  const body = $('#pickBody');
  body.innerHTML = '';
  if (intro) body.appendChild(el('p', { class: 'mut', text: intro }));
  for (const o of options) {
    const c = el('div', { class: 'toolcard', style: 'margin-bottom:9px;cursor:pointer' });
    c.appendChild(el('h3', { text: o.title }));
    c.appendChild(el('div', { class: 'meta', text: o.note }));
    c.addEventListener('click', async () => { dlg.close(); await o.run(); });
    body.appendChild(c);
  }
  const foot = dlg.querySelector('.dlg-f');
  foot.innerHTML = '';
  foot.appendChild(el('button', { class: 'ghost', text: 'Cancel', onclick: () => dlg.close() }));
  dlg.showModal();
}

function openNewParadigm() {
  openChoiceDialog(
    'Start a new paradigm',
    'Choose the form you want to end up with. The choice only sets the shape of the files that get written; everything is editable afterwards and the Convert tab can write any of the other formats regardless.',
    NEW_TEMPLATES.map(t => ({
      title: t.title, note: t.note,
      run: () => loadGeneratedModel(async () => t.build())
    }))
  );
}

function openDemo() {
  openChoiceDialog(
    'Open a demonstration paradigm',
    'Both are written from scratch for this tool, contain no site or patient material, and are internally consistent: the design length equals the declared volume count exactly. Their pictures are generated in the browser, so they export as a complete working package.',
    DEMOS.map(d => ({
      title: d.title, note: d.note,
      run: () => loadGeneratedModel(d.build)
    }))
  );
}
