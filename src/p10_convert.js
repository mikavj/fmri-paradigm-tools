/* ======================================================================================
   Tab: Convert

   Each target states what it carries and what it drops. A conversion that silently loses
   information is worse than one that refuses, so the losses are printed on the card
   itself rather than buried in documentation.
   ====================================================================================== */

const CONVERT_OPTS = { includeRest: false, grouping: 'base', mergeGap: 0, durationModulated: false, disdaqVolumes: 0, shiftMs: 0 };

function convTargets() {
  return [
    {
      id: 'neutral', title: 'Neutral paradigm JSON', ext: '.paradigm.json',
      meta: 'This tool\'s own interchange file. Import it here to get everything back.',
      lossy: null,
      make: () => [{ name: safeName(M.name) + '.paradigm.json', text: serializeNeutralJson(M, TL), mime: 'application/json' }]
    },
    {
      id: 'bids', title: 'BIDS task events', ext: '_events.tsv',
      meta: 'Tab separated onset and duration in seconds, plus a JSON sidecar describing the columns. The common currency between analysis packages.',
      lossy: 'Stimulus content, display geometry, response definitions and the pre trigger material are not represented. Only condition onsets and durations survive.',
      make: () => [
        { name: `task-${safeName(M.name)}_events.tsv`, text: writeBidsEvents(M, TL, CONVERT_OPTS), mime: 'text/tab-separated-values' },
        { name: `task-${safeName(M.name)}_events.json`, text: writeBidsSidecar(M, TL, CONVERT_OPTS), mime: 'application/json' }
      ]
    },
    {
      id: 'fsl', title: 'FSL three column EV files', ext: '.txt',
      meta: 'One file per condition, columns onset, duration and weight, in seconds. Selected in FEAT as a custom three column file.',
      lossy: 'Weights are written as 1 for every event because the paradigm carries no parametric modulator. Condition names survive only in the file names.',
      make: () => writeFslEvs(M, TL, CONVERT_OPTS).map(f => ({ name: f.name, text: f.text, mime: 'text/plain' }))
    },
    {
      id: 'afni', title: 'AFNI stimulus times', ext: '.1D',
      meta: 'One row of onset times in seconds per run, for 3dDeconvolve. The duration modulated variant writes onset:duration for use with dmBLOCK.',
      lossy: 'A single run is written, so pass -local_times to 3dDeconvolve rather than letting it guess, otherwise a multiple run analysis shifts every later run. Without the duration modulated option, durations are dropped entirely and the basis function has to supply them.',
      make: () => writeAfniStimTimes(M, TL, CONVERT_OPTS).map(f => ({ name: f.name, text: f.text, mime: 'text/plain' }))
    },
    {
      id: 'spm', title: 'SPM multiple conditions', ext: '.m and .json',
      meta: 'A MATLAB script that builds the names, onsets and durations variables and saves the conditions file, plus the same data as JSON.',
      lossy: 'The MATLAB container cannot be written from a browser, and the SPM file selector will not accept a script, so run the script once in MATLAB or Octave to produce the .mat and then select that. Set the design units to seconds, because the same setting governs both onsets and durations.',
      make: () => [
        { name: safeName(M.name) + '_conditions.m', text: writeSpmScript(M, TL, CONVERT_OPTS), mime: 'text/plain' },
        { name: safeName(M.name) + '_conditions.json', text: writeSpmJson(M, TL, CONVERT_OPTS), mime: 'application/json' }
      ]
    },
    {
      id: 'des', title: 'Design file', ext: '.des',
      meta: 'The design file written alongside a run and read by the matching analysis software. XML, with condition, onset, duration and amplitude in seconds.',
      lossy: 'Condition numbers rather than names, and one amplitude of 1 for every interval. Stimulus content and the pre trigger material are not represented.',
      make: () => [{ name: safeName(M.name) + '.des', text: writeDesignFile(M, TL, CONVERT_OPTS), mime: 'application/xml' }]
    },
    {
      id: 'siemens', title: 'Siemens inline BOLD parameters', ext: '.ini',
      meta: 'The measurement parameters, design matrix and contrast matrix used by the inline BOLD evaluation on the scanner console. One design matrix row per volume.',
      lossy: 'Only the condition structure is expressed. A volume is assigned to a condition when its centre falls inside that condition, so a design not aligned to the repetition time is rounded.',
      make: () => [{ name: safeName(M.name) + '.ini', text: writeSiemensIni(M, TL, CONVERT_OPTS), mime: 'text/plain' }]
    },
    {
      id: 'psychopy', title: 'PsychoPy conditions file', ext: '.csv',
      meta: 'One row per event with onset and duration in seconds, plus the text, image and sound for that event. Attach it to a Builder loop and drive the component start and stop values from the columns.',
      lossy: 'This is a conditions table, not a complete experiment. The routine, the components and the trigger handling must still be built in PsychoPy.',
      make: () => [{ name: safeName(M.name) + '_conditions.csv', text: writePsychopyConditions(M, TL), mime: 'text/csv' }]
    },
    {
      id: 'presentation', title: 'Presentation scenario', ext: '.sce',
      meta: 'A Neurobehavioral Systems scenario with one stimulus event per paradigm event, in milliseconds, inside a single fixed duration trial.',
      lossy: 'Picture placement, layering and font handling are approximated. Media files must be copied next to the scenario. Verify the pulse settings against your scanner before use.',
      make: () => [{ name: safeName(M.name) + '.sce', text: writePresentationSce(M, TL, { version: ACTIVE.version }), mime: 'text/plain' }]
    },
    {
      id: 'opensesame', title: 'OpenSesame script', ext: '.opensesame',
      meta: 'Sketchpad definitions and a sequence, in milliseconds, to paste into the OpenSesame script editor.',
      lossy: 'One sketchpad is emitted per event, so a long design produces a long script. Audio, response collection and trigger handling are not emitted.',
      make: () => [{ name: safeName(M.name) + '.opensesame', text: writeOpenSesameScript(M, TL), mime: 'text/plain' }]
    },
    {
      id: 'psyexp', title: 'PsychoPy experiment', ext: '.psyexp and .csv',
      meta: 'A Builder experiment that waits for the scanner trigger and then steps through a conditions table, one row per event, together with that conditions table.',
      lossy: 'A Builder file holds no absolute onsets anywhere, so the ordering carries the timing. Check the stimulus sizing, the trigger key and the media paths in PsychoPy before running it.',
      make: () => [
        { name: safeName(M.name) + '.psyexp', text: writePsychopyExperiment(M, TL), mime: 'application/xml' },
        { name: safeName(M.name) + '_conditions.csv', text: writePsychopyConditions(M, TL), mime: 'text/csv' }
      ]
    },
    {
      id: 'eprime', title: 'E-Prime list conditions', ext: '.txt',
      meta: 'Tab delimited conditions for an E-Prime List that is set to load from a file. The first three columns are Weight, Nested and Procedure, as that format requires.',
      lossy: 'E-Prime keeps its durations inside the closed experiment file, so this carries stimulus content and a duration column that your experiment has to be written to use. It does nothing unless the receiving List is already configured to load from a file.',
      make: () => [{ name: safeName(M.name) + '_list.txt', text: writeEprimeList(M, TL), mime: 'text/plain' }]
    },
    {
      id: 'superlab', title: 'SuperLab stimulus list', ext: '.txt',
      meta: 'One absolute file path per line, which is the documented way to import a stimulus list into SuperLab.',
      lossy: 'Paths only. No onsets, no durations, no conditions and no correct responses, because the format carries none of those. Edit the folder prefix to match the machine that will run it.',
      make: () => [{ name: safeName(M.name) + '_stimuli.txt', text: writeSuperlabStimulusList(M, TL, { folder: CONVERT_OPTS.superlabFolder }), mime: 'text/plain' }]
    },
    {
      id: 'report', title: 'Readable summary', ext: '.txt',
      meta: 'A plain text description of the acquisition, the session structure and every condition onset. Intended for a protocol document or for sending to a colleague.',
      lossy: null,
      make: () => [{ name: safeName(M.name) + '_summary.txt', text: writeReport(M, TL, ACTIVE.version, ACTIVE.language), mime: 'text/plain' }]
    }
  ];
}

function tabConvert(host) {
  host.innerHTML = '';
  const trNow = resolveNum(M.acq.trMs, varTable(M));
  CONVERT_OPTS.shiftMs = (CONVERT_OPTS.disdaqVolumes || 0) * (trNow || 0);

  const po = panel('Conversion options');
  po.appendChild(el('div', { class: 'row' }, [
    el('label', { text: 'Group events into regressors by' }),
    (() => {
      const s = el('select', { onchange: e => { CONVERT_OPTS.grouping = e.target.value; renderTab('convert'); } });
      for (const o of [
        { v: 'base', t: 'block name without its number, for example HC1 to HC4 become HC' },
        { v: 'block', t: 'the full block name, one regressor per block instance' },
        { v: 'condition', t: 'the condition number' }
      ]) s.appendChild(el('option', { value: o.v, selected: o.v === CONVERT_OPTS.grouping }, o.t));
      return s;
    })(),
    el('label', {}, [el('input', {
      type: 'checkbox', checked: CONVERT_OPTS.includeRest,
      onchange: e => { CONVERT_OPTS.includeRest = e.target.checked; renderTab('convert'); }
    }), ' Write an explicit rest regressor']),
    el('label', {}, [el('input', {
      type: 'checkbox', checked: CONVERT_OPTS.durationModulated,
      onchange: e => { CONVERT_OPTS.durationModulated = e.target.checked; renderTab('convert'); }
    }), ' AFNI duration modulated form']),
    el('label', { text: 'Discarded volumes at the start' }),
    el('input', {
      type: 'number', value: CONVERT_OPTS.disdaqVolumes, min: 0, step: 1, style: 'width:64px',
      title: 'Volumes that were acquired and then discarded. Every onset is shifted earlier by this many repetition times.',
      onchange: e => { CONVERT_OPTS.disdaqVolumes = Math.max(0, Number(e.target.value) || 0); renderTab('convert'); }
    }),
    el('label', { text: 'Merge events separated by up to' }),
    el('input', {
      type: 'number', value: CONVERT_OPTS.mergeGap, min: 0, step: 50, style: 'width:80px',
      onchange: e => { CONVERT_OPTS.mergeGap = Number(e.target.value) || 0; renderTab('convert'); }
    }),
    el('span', { class: 'mut', text: 'ms' })
  ]));
  if (CONVERT_OPTS.shiftMs)
    po.appendChild(el('div', { class: 'banner warn', style: 'margin-top:9px' }, el('div', {
      html: `<b>Every exported onset is shifted ${(CONVERT_OPTS.shiftMs / 1000).toFixed(3)} s earlier</b>, for ${CONVERT_OPTS.disdaqVolumes} discarded volume${CONVERT_OPTS.disdaqVolumes > 1 ? 's' : ''} at a repetition time of ${trNow} ms. Use this only when those volumes were acquired and saved and are being dropped during analysis. If the scanner discarded them itself and never wrote them, leave this at zero.`
    })));
  if (CONVERT_OPTS.disdaqVolumes && !trNow)
    po.appendChild(el('div', { class: 'banner bad', style: 'margin-top:9px' }, el('div', { html: '<b>The repetition time is not set</b>, so the discarded volume correction cannot be computed and no shift has been applied.' })));
  po.appendChild(el('div', { class: 'hint', text: 'Adjacent events of the same condition are merged into one interval, so a block built from forty short flashes becomes a single thirty second block. Increase the merge tolerance if a block is broken up by short blanks between its trials. Leaving rest out is the usual choice, because an explicit baseline regressor together with the constant term makes a first level design rank deficient. Grouping by the full block name gives one onset per regressor, which is rarely what an analysis wants.' }));
  host.appendChild(po);

  /* Preview what the regressors will look like. */
  const groups = runsForExport(TL, CONVERT_OPTS);
  const pp = panel('Condition regressors that will be written');
  const tbl = el('table', {}, [el('thead', {}, el('tr', {}, [
    el('th', { text: 'Condition' }), el('th', { class: 'num', text: 'Intervals' }),
    el('th', { class: 'num', text: 'Total s' }), el('th', { text: 'First onsets, seconds' })
  ]))]);
  const tb = el('tbody'); tbl.appendChild(tb);
  for (const g of groups) {
    tb.appendChild(el('tr', {}, [
      el('td', { html: `<b>${esc(g.name)}</b>` }),
      el('td', { class: 'num', text: g.list.length }),
      el('td', { class: 'num', text: (g.list.reduce((s, i) => s + i.duration, 0) / 1000).toFixed(1) }),
      el('td', { class: 'mono mut', text: g.list.slice(0, 8).map(i => sec3(i.onset)).join(', ') + (g.list.length > 8 ? ' ...' : '') })
    ]));
  }
  if (!groups.length) tb.appendChild(el('tr', {}, el('td', { colspan: 4, class: 'mut', text: 'No active conditions were found. Check that at least one block has a condition greater than zero.' })));
  pp.appendChild(tbl);
  host.appendChild(pp);

  const grid = el('div', { class: 'convgrid' });
  for (const t of convTargets()) {
    const c = el('div', { class: 'conv' });
    c.appendChild(el('h4', { text: t.title }));
    c.appendChild(el('div', { class: 'meta', text: t.meta }));
    const btns = el('div', { class: 'row' }, [
      el('button', {
        class: 'primary mini', text: 'Download',
        onclick: () => {
          try {
            const files = t.make();
            if (files.length === 1) downloadText(files[0].text, files[0].name, files[0].mime);
            else downloadBlob(zipStore(files.map(f => ({ name: f.name, bytes: utf8(f.text).bytes }))), safeName(M.name) + '_' + t.id + '.zip');
            toast(`Wrote ${files.length} file${files.length > 1 ? 's' : ''} for ${t.title}.`);
          } catch (e) { toast('Could not write: ' + e.message); }
        }
      }),
      el('button', {
        class: 'mini ghost', text: 'Preview',
        onclick: () => {
          try {
            const files = t.make();
            showTextDialog(t.title, files);
          } catch (e) { toast('Could not write: ' + e.message); }
        }
      })
    ]);
    c.appendChild(btns);
    if (t.lossy) c.appendChild(el('div', { class: 'lossy', text: 'Not carried across: ' + t.lossy }));
    grid.appendChild(c);
  }
  host.appendChild(el('div', { class: 'panel' }, [el('h3', {}, el('span', { text: 'Targets' })), grid]));

  const pn = panel('Round trip and native formats');
  pn.appendChild(el('div', { class: 'hint', html:
    `This paradigm was read as <b>${esc(M.source.label)}</b>. The Export button in the header writes it back in a native form that the original presentation software can load. ` +
    `Files that you have not edited are written back byte for byte from the originals, so opening a paradigm and saving it again does not disturb formatting, comments or character encoding.` }));
  const row = el('div', { class: 'row', style: 'margin-top:8px' }, [
    el('button', { class: 'good', text: 'Export native package', onclick: openExport }),
    el('button', {
      class: 'mini', text: 'Download paradigm JSON only',
      onclick: () => { downloadText(serializeParadigmJson(M, ACTIVE.version, ACTIVE.language), safeName(M.name) + '.json', 'application/json'); toast('Wrote the paradigm JSON.'); }
    })
  ]);
  pn.appendChild(row);
  host.appendChild(pn);
}

function showTextDialog(title, files) {
  const dlg = $('#exportDlg');
  $('.dlg-h', dlg) || null;
  dlg.querySelector('.dlg-h').textContent = title;
  const body = $('#exportBody');
  body.innerHTML = '';
  for (const f of files) {
    body.appendChild(el('div', { class: 'mut mono', style: 'margin:8px 0 4px', text: f.name }));
    const pre = el('pre', { class: 'code' });
    pre.textContent = f.text.length > 40000 ? f.text.slice(0, 40000) + '\n... truncated for display ...' : f.text;
    body.appendChild(pre);
  }
  $('#exportZip').hidden = true;
  $('#exportFolder').hidden = true;
  dlg.showModal();
}

/* ======================================================================================
   Native export
   ====================================================================================== */

async function originalBytes(m, path) {
  const entry = resolvePath(m.source.baseDir, path);
  if (!entry) return null;
  return new Uint8Array(await entry.file.arrayBuffer());
}

async function buildExportFiles() {
  const folder = (M.name || 'paradigm').trim();
  const out = [];
  const bad = new Set();
  const rewritten = [];
  const copied = [];
  const addText = (rel, text, io, label) => {
    const e = encodeWithIO(text, io);
    e.bad.forEach(b => bad.add(b));
    out.push({ name: `${folder}/${rel}`, bytes: e.bytes });
    rewritten.push(label || rel);
  };
  /* fp identifies which slice of the model this file is built from, so that an untouched
     file can be copied verbatim instead of regenerated. */
  const addOriginalOr = async (rel, path, textFn, io, label, fp) => {
    if (fp && !changedSince(M, fp)) {
      const b = await originalBytes(M, path);
      if (b) { out.push({ name: `${folder}/${rel}`, bytes: b }); copied.push(label || rel); return; }
    }
    addText(rel, textFn(), io, label);
  };
  const strip = p => String(p).replace(/^\.[\\/]/, '').replace(/\\/g, '/');

  if (M.source.kind === 'nnl-xml') {
    await addOriginalOr(`${folder}.xml`, M.source.mainPath.split('/').pop(), () => serializeMainXml(M), M.raw.mainIO, 'main paradigm file', ['main']);
    await addOriginalOr(strip(M.raw.trialsFile.path), M.raw.trialsFile.path, () => serializeTrialsXml(M), M.raw.trialsFile.io, 'trials', ['trials']);
    for (const set of M.slideSets) {
      if (set.missing) continue;
      await addOriginalOr(strip(set.path), set.path, () => serializeSlideSetXml(M, set), set.io, 'stimuli ' + strip(set.path), ['slides', set.path]);
    }
    for (const d of M.descriptions.filter(d => !d.inline)) {
      if (d.missing) continue;
      await addOriginalOr(strip(d.path), d.path, () => serializeDescriptionXml(M, d), d.io, 'description ' + d.language, ['desc', d.language]);
    }
    for (const f of (M.raw.defaultsFiles || [])) {
      if (f.missing) continue;
      await addOriginalOr(strip(f.path), f.path, () => serializeDefaultsXml(M, f), f.io, 'defaults ' + f.version, ['defaults', f.version]);
    }
  } else {
    /* Anything not read from an XML package is written as a paradigm JSON. */
    const name = `${folder}.json`;
    addText(name, serializeParadigmJson(M, ACTIVE.version, ACTIVE.language), { enc: 'utf-8', bom: false }, 'paradigm JSON');
  }

  for (const a of M.assets) {
    const bytes = new Uint8Array(await a.file.arrayBuffer());
    out.push({ name: `${folder}/${a.rel.replace(/\\/g, '/')}`, bytes });
  }
  return { files: out, folder, bad: [...bad], rewritten, copied };
}

async function openExport() {
  const dlg = $('#exportDlg');
  dlg.querySelector('.dlg-h').textContent = 'Export paradigm';
  $('#exportZip').hidden = false;
  $('#exportFolder').hidden = false;
  const body = $('#exportBody');
  body.innerHTML = '<p class="mut">Preparing files...</p>';
  dlg.showModal();

  const { files, folder, bad, rewritten, copied } = await buildExportFiles();
  body.innerHTML = '';
  const xmlN = files.filter(f => /\.(xml|json)$/i.test(f.name)).length;
  body.appendChild(el('p', { html: `Package <b>${esc(folder)}/</b> containing <b>${files.length}</b> files: ${xmlN} definition file${xmlN === 1 ? '' : 's'} and ${files.length - xmlN} media file${files.length - xmlN === 1 ? '' : 's'}.` }));

  if (VAL.errs.length)
    body.appendChild(el('div', { class: 'vrow err' }, [el('span', { class: 'ic', text: '!' }), el('span', { text: `${VAL.errs.length} validation error${VAL.errs.length > 1 ? 's' : ''} remain. The package can still be written as a draft, but resolve them before using it on a scanner.` })]));
  else
    body.appendChild(el('div', { class: 'vrow ok' }, [el('span', { class: 'ic', text: 'i' }), el('span', { text: 'No validation errors.' })]));
  if (VAL.warns.length)
    body.appendChild(el('div', { class: 'vrow warn' }, [el('span', { class: 'ic', text: '?' }), el('span', { text: `${VAL.warns.length} warning${VAL.warns.length > 1 ? 's' : ''}. See the Validate tab.` })]));
  if (bad.length)
    body.appendChild(el('div', { class: 'vrow err' }, [el('span', { class: 'ic', text: '!' }), el('span', { text: `These characters cannot be represented in the original file encoding and have been replaced with a question mark: ${bad.join(' ')}. Replace them before export.` })]));

  if (copied.length)
    body.appendChild(el('div', { class: 'vrow ok' }, [el('span', { class: 'ic', text: 'i' }), el('span', { text: `${copied.length} unedited file${copied.length > 1 ? 's are' : ' is'} copied byte for byte from the original: ${copied.join(', ')}.` })]));
  if (rewritten.length)
    body.appendChild(el('div', { class: 'vrow warn' }, [el('span', { class: 'ic', text: '?' }), el('span', { text: `${rewritten.length} file${rewritten.length > 1 ? 's are' : ' is'} regenerated: ${rewritten.join(', ')}.` })]));

  const det = el('details');
  det.appendChild(el('summary', { text: 'Full file list' }));
  det.appendChild(el('div', {
    class: 'scroll mono', style: 'padding:6px;font-size:11px',
    html: files.map(f => `${esc(f.name)}  <span class="mut">${f.bytes.length} bytes</span>`).join('<br>')
  }));
  body.appendChild(det);

  dlg._files = files;
  dlg._folder = folder;
}

async function doZip() {
  const dlg = $('#exportDlg');
  if (!dlg._files) return;
  downloadBlob(zipStore(dlg._files), dlg._folder + '.zip');
  dlg.close();
  toast('Downloaded ' + dlg._folder + '.zip');
}
async function doFolder() {
  const dlg = $('#exportDlg');
  if (!dlg._files) return;
  if (!window.showDirectoryPicker) { toast('Saving to a folder needs a Chromium based browser. Use the zip instead.'); return; }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    let root = dir;
    try { root = await dir.getDirectoryHandle(dlg._folder, { create: true }); } catch (_) {}
    for (const f of dlg._files) {
      const rel = f.name.slice(dlg._folder.length + 1);
      const parts = rel.split('/');
      let d = root;
      for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i], { create: true });
      const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(f.bytes);
      await w.close();
    }
    dlg.close();
    toast(`Saved ${dlg._files.length} files into ${dlg._folder}/`);
  } catch (e) {
    if (e.name !== 'AbortError') toast('Save failed: ' + e.message);
  }
}
