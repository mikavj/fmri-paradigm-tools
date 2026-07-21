/* ---------------------------------------------------------------------------
   5e. Additional presentation targets

   These write into other packages rather than into an analysis pipeline. Each one is a
   starting point that still has to be opened and checked in its own software, which is
   said plainly on the card rather than implied.
   --------------------------------------------------------------------------- */

/* PsychoPy Builder experiment.

   The design is expressed as a sequential loop over a conditions table, one row per
   event, with a routine that presents the stimulus for the duration named in that row.
   Absolute onsets are therefore implicit in the ordering rather than written out, which
   is how PsychoPy works: a Builder file has no absolute onset anywhere in it. The
   conditions file carries the onsets as an extra column so that they are not lost, and so
   that they can be logged. */
function writePsychopyExperiment(m, tl) {
  const P = (name, val, valType = 'str', updates = 'None') =>
    `        <Param name="${escA(name)}" updates="${escA(updates)}" val="${escA(val)}" valType="${escA(valType)}"/>`;
  const conditionsFile = safeName(m.name) + '_conditions.csv';
  const L = [];
  L.push('<?xml version="1.0" ?>');
  L.push('<PsychoPy2experiment encoding="utf-8" version="2024.2.0">');
  L.push('  <Settings>');
  L.push(P('expName', m.name));
  L.push(P('Experiment info', "{'participant':'', 'session':'001'}", 'code'));
  L.push(P('Data filename', "u'data/%s_%s_%s' % (expInfo['participant'], expName, expInfo['date'])", 'code'));
  L.push(P('Full-screen window', 'True', 'bool'));
  L.push(P('Units', 'height'));
  L.push(P('color', String(m.defaults.bg || 'black'), 'color'));
  L.push('  </Settings>');
  L.push('  <Routines>');

  /* A routine that holds until the scanner trigger key arrives. */
  L.push('    <Routine name="wait_for_scanner">');
  L.push('      <TextComponent name="wait_text" plugin="None">');
  L.push(P('name', 'wait_text', 'code'));
  L.push(P('text', 'Waiting for the scanner'));
  L.push(P('color', String(m.defaults.fg || 'white'), 'color'));
  L.push(P('letterHeight', '0.05', 'num', 'constant'));
  L.push(P('startType', 'time (s)'));
  L.push(P('startVal', '0.0', 'code'));
  L.push(P('stopType', 'duration (s)'));
  L.push(P('stopVal', '', 'code', 'constant'));
  L.push('      </TextComponent>');
  L.push('      <KeyboardComponent name="scanner_trigger" plugin="None">');
  L.push(P('name', 'scanner_trigger', 'code'));
  L.push(P('allowedKeys', `'${(triggerKeysOf(m)[0] || '5')}'`, 'list', 'constant'));
  L.push(P('forceEndRoutine', 'True', 'bool', 'constant'));
  L.push(P('startType', 'time (s)'));
  L.push(P('startVal', '0.0', 'code'));
  L.push(P('stopType', 'duration (s)'));
  L.push(P('stopVal', '', 'code', 'constant'));
  L.push(P('store', 'first key'));
  L.push('      </KeyboardComponent>');
  L.push('    </Routine>');

  /* One routine presenting whatever the current conditions row names. */
  L.push('    <Routine name="event">');
  L.push('      <TextComponent name="event_text" plugin="None">');
  L.push(P('name', 'event_text', 'code'));
  L.push(P('text', '$text', 'str', 'set every repeat'));
  L.push(P('color', String(m.defaults.fg || 'white'), 'color'));
  L.push(P('letterHeight', '0.08', 'num', 'constant'));
  L.push(P('startType', 'time (s)'));
  L.push(P('startVal', '0.0', 'code'));
  L.push(P('stopType', 'duration (s)'));
  L.push(P('stopVal', '$duration_s', 'code', 'set every repeat'));
  L.push('      </TextComponent>');
  L.push('      <ImageComponent name="event_image" plugin="None">');
  L.push(P('name', 'event_image', 'code'));
  L.push(P('image', '$image', 'file', 'set every repeat'));
  L.push(P('size', '', 'list', 'constant'));
  L.push(P('startType', 'time (s)'));
  L.push(P('startVal', '0.0', 'code'));
  L.push(P('stopType', 'duration (s)'));
  L.push(P('stopVal', '$duration_s', 'code', 'set every repeat'));
  L.push('      </ImageComponent>');
  L.push('    </Routine>');
  L.push('  </Routines>');

  L.push('  <Flow>');
  L.push('    <Routine name="wait_for_scanner"/>');
  L.push('    <LoopInitiator loopType="TrialHandler" name="events">');
  L.push(P('Selected rows', '').replace(/^ {8}/, '      '));
  L.push(`      <Param name="conditionsFile" updates="None" val="${escA(conditionsFile)}" valType="file"/>`);
  L.push('      <Param name="endPoints" updates="None" val="[0, 1]" valType="num"/>');
  L.push('      <Param name="isTrials" updates="None" val="True" valType="bool"/>');
  L.push('      <Param name="loopType" updates="None" val="sequential" valType="str"/>');
  L.push('      <Param name="nReps" updates="None" val="1" valType="num"/>');
  L.push('      <Param name="name" updates="None" val="events" valType="code"/>');
  L.push('      <Param name="random seed" updates="None" val="" valType="code"/>');
  L.push('    </LoopInitiator>');
  L.push('    <Routine name="event"/>');
  L.push('    <LoopTerminator name="events"/>');
  L.push('  </Flow>');
  L.push('</PsychoPy2experiment>');
  return L.join('\n') + '\n';
}
function triggerKeysOf(m) {
  for (const t of m.trials) {
    const r = (t.ops || []).find(o => o.type === 'register');
    if (r && (r.keys || []).length) return r.keys;
  }
  return ['5'];
}

/* SuperLab stimulus list. One absolute path per line, which is the documented import
   form. It carries paths and nothing else, so it is a way of getting the media into an
   experiment, not a way of getting the design into one. */
function writeSuperlabStimulusList(m, tl, opts = {}) {
  const root = (opts.folder || '/path/to/' + safeName(m.name)).replace(/\/+$/, '');
  const seen = new Set();
  const lines = [];
  for (const e of tl.events) {
    if (e.t0 < 0 || !e.slide) continue;
    for (const p of (e.slide.pictures || [])) {
      const rel = String(p.value).replace(/^[./\\]+/, '').replace(/\\/g, '/');
      if (seen.has(rel)) continue;
      seen.add(rel);
      lines.push(root + '/' + rel);
    }
  }
  return lines.join('\r\n') + '\r\n';
}

/* E-Prime list conditions file. Tab delimited, and the first three columns must be
   Weight, Nested and Procedure in that order. It only does anything if the receiving
   experiment already has a List set to load its conditions from a file, and it carries no
   timing, because in E-Prime the durations live in the closed experiment file. */
function writeEprimeList(m, tl, opts = {}) {
  const rows = [['Weight', 'Nested', 'Procedure', 'Condition', 'Stimulus', 'Duration', 'ImageFile', 'SoundFile']];
  for (const e of tl.events) {
    if (e.t0 < 0 || e.kind === 'trigger' || e.dur <= 0) continue;
    const sl = e.slide || {};
    rows.push([
      '1', '', 'TrialProc',
      e.cond > 0 ? (e.blockName || 'active') : 'rest',
      (sl.text || e.slideName || '').replace(/[\t\r\n]+/g, ' '),
      String(Math.round(e.dur)),
      sl.pictures && sl.pictures[0] ? String(sl.pictures[0].value).replace(/^[./\\]+/, '') : '',
      sl.sound ? String(sl.sound.value).replace(/^[./\\]+/, '') : ''
    ]);
  }
  return rows.map(r => r.join('\t')).join('\r\n') + '\r\n';
}
