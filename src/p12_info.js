/* ======================================================================================
   9. INFORMATION PAGE

   A reference for people arriving from different disciplines. An engineer, a physicist, a
   psychologist and a clinician each know a different part of this and rarely the same
   part, and most of the friction in designing a paradigm together comes from that gap
   rather than from disagreement about the science.

   Every statement about a file format here reflects what could be verified from published
   documentation or from real files. Where something could not be verified it says so.
   ====================================================================================== */

const INFO_TOOLS = [
  {
    name: 'PsychoPy',
    meta: 'Open source, GPL. Free. Windows, macOS and Linux. Python.',
    what: 'A stimulus presentation package with two authoring routes: a graphical builder whose experiments are saved as readable XML, and a code route where the experiment is an ordinary Python script. It has largely displaced the older commercial packages in new academic work.',
    formats: 'The builder file is <code>.psyexp</code>, which is XML. Every property of every object is a <code>&lt;Param name val valType&gt;</code> element. Trial content comes from a conditions table in <code>.csv</code> or <code>.xlsx</code>, one row per trial, where each column becomes a variable. Timing is expressed in SECONDS, or in monitor frames.',
    trigger: 'A routine that waits for a keypress is the usual approach, because most scanners are configured to emulate a key when a volume starts. There is also a hardware emulator plugin providing a launch and sync helper for offline timing tests, and parallel or serial port polling for sites that expose a TTL line.',
    pros: ['No licence cost and no per seat limit', 'The experiment file is text, so it can be read, compared and version controlled', 'Very large user community and a great deal of published example code', 'The same experiment can be run in a browser for behavioural piloting'],
    cons: ['A builder file carries no absolute onsets, only relative start and stop values, so a full timeline has to be reconstructed by walking the flow', 'Parameters can hold arbitrary Python, so a file cannot be fully understood without running it', 'Timing precision depends on the machine and the graphics configuration, and needs to be checked locally'],
    here: 'This tool writes a conditions file carrying onset and duration columns, and can write a builder experiment. It does not read <code>.psyexp</code>, because a file whose parameters may contain arbitrary code cannot be interpreted reliably without a Python interpreter.'
  },
  {
    name: 'E-Prime',
    meta: 'Commercial, Psychology Software Tools. Paid licence. Windows only.',
    what: 'A long established commercial package widely used in clinical and cognitive research. The fMRI specific add on, E-Prime Extensions for fMRI, handles scanner synchronisation and writes a log aligned to the trigger.',
    formats: 'The experiment design lives in <code>.es3</code>, which is proprietary and undocumented. Behavioural data is written to <code>.edat3</code>, also proprietary, and to a plain text log. The text log is a stream of indented records delimited by <code>*** LogFrame Start ***</code> and <code>*** LogFrame End ***</code>, with times in integer MILLISECONDS. The fMRI extension additionally writes a flat tab delimited <code>.PDAT</code> file whose time column is already relative to the scanner trigger.',
    trigger: 'The fMRI extension waits for the first trigger and then runs on the computer clock. There is no per volume record, so drift between the presentation machine and the scanner cannot be detected or corrected after the fact.',
    pros: ['Millisecond level control and a mature, well documented authoring environment', 'The fMRI extension produces output that is already aligned to the trigger', 'Widely used, so protocols are often shared in this form'],
    cons: ['The experiment file format is closed, so a paradigm cannot be inspected, converted or archived in an open form', 'Windows only, and licensing has a real cost per seat', 'Reading a paradigm requires the software that wrote it'],
    here: 'The experiment file cannot be read or written, and this tool does not pretend otherwise. It can write a tab delimited list conditions file, which is the documented way to feed stimulus content into an experiment that was authored to load a list from a file.'
  },
  {
    name: 'Cedrus SuperLab',
    meta: 'Commercial, Cedrus. Paid licence. Windows and macOS.',
    what: 'A graphical experiment builder organised as experiment, then block, then trial, then event. Randomisation, stimulus lists and trial level rules are configured through the interface rather than by writing code, which makes it approachable for people who do not program.',
    formats: 'The experiment file is <code>.sl5</code> or <code>.sl6</code>, a proprietary binary serialisation. Behavioural output is tab separated text with a documented layout, and Cedrus explicitly encourages third party readers for it. Stimulus lists can be imported from a plain text file containing one file path per line.',
    trigger: 'Either a hardware interface box that converts the scanner signal into a keypress or a TTL event, or software pacing where the trial duration is set to the repetition time and the experiment free runs against the scanner. The software only route has no synchronisation after the start of the run.',
    pros: ['Randomisation and trial level logic are configurable without programming, which suits a clinician or psychologist designing a task', 'Good support presence, with worked examples posted for specific problems', 'The behavioural output format is documented and stable'],
    cons: ['The experiment file is closed, so a design cannot be reviewed or converted outside the software', 'Scanner synchronisation on some scanners needs an interface box and site specific configuration', 'A design cannot be diffed or version controlled meaningfully'],
    here: 'The experiment file cannot be read. Its container was examined far enough to establish why: it is a length prefixed binary object graph with no record tags, no table of contents and no field names, so there is no way to tell which number in the file is a duration and which is a setting. Guessing would be worse than declining. A stimulus list file can be written.'
  },
  {
    name: 'Neurobehavioral Systems Presentation',
    meta: 'Commercial, Neurobehavioral Systems. Paid licence. Windows.',
    what: 'A presentation package built around a plain text scenario language, with a separate procedural language for logic. It is common where precise timing and port signalling matter, and it has a long history in fMRI and electrophysiology.',
    formats: 'The scenario file is <code>.sce</code>, plain text, with header settings followed by object definitions such as <code>picture</code>, <code>text</code>, <code>bitmap</code>, <code>sound</code>, <code>trial</code> and <code>stimulus_event</code>. Logic lives in a <code>.pcl</code> file. Timing is in MILLISECONDS. The log file is tab delimited text.',
    trigger: 'The scenario type can be set so that the program is driven by scanner pulses, with settings for the pulse code and the number of pulses per scan. This makes the trigger a first class part of the scenario rather than something bolted on.',
    pros: ['The scenario is plain text, so a paradigm can be read, reviewed and version controlled', 'Timing and port signalling are precise and explicitly modelled', 'Trigger handling is part of the language rather than an add on'],
    cons: ['The scenario language has to be learned, which is a real barrier for a non programmer', 'Commercial licence, Windows only', 'Splitting a design across a scenario and a procedural file makes simple paradigms more verbose than they need to be'],
    here: 'This tool writes a scenario containing one stimulus event per paradigm event inside a single fixed duration trial. Check the pulse settings against your own scanner before using it, because those are site specific.'
  },
  {
    name: 'OpenSesame',
    meta: 'Open source, GPL. Free. Windows, macOS and Linux.',
    what: 'A graphical experiment builder aimed at people who do not want to write code, with an escape hatch into Python. It is popular in teaching and in behavioural laboratories.',
    formats: 'The experiment file is <code>.osexp</code>, either a plain text script or an archive containing that script plus the media pool. The script is indentation based, with <code>define sketchpad</code> and <code>define sequence</code> blocks and property lines such as <code>set duration 1000</code>. Timing is in MILLISECONDS.',
    trigger: 'Handled through a response box plugin, a parallel port, or by treating the trigger as a keypress. There is no dedicated fMRI synchronisation layer comparable to the commercial packages.',
    pros: ['Free, open, and the experiment file is readable text', 'Approachable for people new to experiment design', 'The script format is stable enough for another program to generate'],
    cons: ['Less established in fMRI than in behavioural work', 'Scanner synchronisation needs assembling from parts rather than being provided', 'A long block design becomes a very long script when written out event by event'],
    here: 'This tool writes a script containing one sketchpad per event plus a sequence that runs them. Paste it into the script editor of a new experiment.'
  },
  {
    name: 'BIDS task events',
    meta: 'Open community standard. Free. Not a program.',
    what: 'Not a presentation package but the agreed way of recording what happened when, alongside the imaging data. It is the closest thing this field has to a neutral interchange format, and every major analysis package can consume it.',
    formats: 'A tab separated <code>_events.tsv</code> whose first two columns must be <code>onset</code> and <code>duration</code>, both in SECONDS measured from the first volume of the run. <code>trial_type</code> names the condition. Missing values are written as <code>n/a</code>. An optional <code>_events.json</code> sidecar describes each column and lists the levels of a categorical one.',
    trigger: 'Not applicable directly, but the definition of time zero as the first acquired volume is precisely the thing that presentation formats leave implicit, which is why it is the safest thing to convert into.',
    pros: ['Open, simple, and readable in any spreadsheet or text editor', 'Accepted by every major analysis pipeline', 'Self describing through its sidecar, so a colleague can interpret it without asking'],
    cons: ['Carries timing only, with no stimulus content, geometry or response definitions', 'Does not describe what the participant saw, only when the condition was active', 'Seconds rather than milliseconds, so a conversion step is always involved'],
    here: 'Read and written. This is the recommended way to hand a paradigm to anyone doing the analysis.'
  },
  {
    name: 'FSL, AFNI and SPM',
    meta: 'Analysis packages. FSL and AFNI are free for academic use, SPM is free and runs on MATLAB.',
    what: 'The three main first level analysis packages. Each wants the same information, the onset and duration of each condition, but each wants it in a different arrangement, which is a recurring source of avoidable error.',
    formats: 'FSL uses a three column explanatory variable file, whitespace separated, columns onset, duration and weight, in SECONDS, one file per condition. AFNI uses a stimulus times file with one row per run and onset times in SECONDS separated by spaces, where a lone asterisk marks a run with no events, and a duration modulated form writes onset and duration together. SPM uses a MATLAB file containing cell arrays named names, onsets and durations, with the design units set to either seconds or scans.',
    trigger: 'All three assume that time zero is the first analysed volume. Anything shown before the trigger has to be excluded, and discarded stabilisation volumes have to be accounted for before the onsets are correct.',
    pros: ['Simple, well documented and stable', 'Text based in the FSL and AFNI cases, so easy to check by eye', 'A design that is correct in one of these can be converted mechanically into the others'],
    cons: ['Three different arrangements of the same numbers invites transcription error', 'None of them records where time zero was, so a file cannot be validated on its own', 'The SPM container is a MATLAB binary, which is awkward to produce outside MATLAB'],
    here: 'All three are written. For SPM the tool writes a short MATLAB script that constructs and saves the conditions file, because a MATLAB binary cannot be produced from a browser, plus the same content as JSON.'
  },
  {
    name: 'Scanner side configuration',
    meta: 'Siemens, GE and Philips. Not a paradigm format.',
    what: 'The scanner also needs to know about the design when inline statistics are used on the console, and clinical paradigm packs often ship a companion file for this. Keeping that companion in step with the paradigm is a common failure point, because re-timing the paradigm does not update it.',
    formats: 'On Siemens the inline BOLD evaluation reads a plain text file with sections for the measurement parameters, the design matrix and the contrast matrix, giving the required repetition time and number of measurements. This is written as an ordinary text file and is straightforward to generate.',
    trigger: 'The scanner emits a signal at the start of each volume. How it is delivered varies by manufacturer and by site, commonly as an emulated keypress, and an interface box is often used to convert it. Whether the signal arrives once per run or once per volume changes what the presentation program can do about drift, so it is worth confirming locally rather than assuming.',
    pros: ['A generated companion file cannot drift out of step with the paradigm it was generated from'],
    cons: ['Details are site specific and manufacturer specific', 'A companion file shipped inside a paradigm pack is easy to forget when the timing changes'],
    here: 'The Siemens inline file is written, with one design matrix row per volume so that there is no ambiguity about how a cycle repeats. This tool also checks any companion file it finds inside an opened paradigm folder and reports when it disagrees with the design.'
  }
];

function tabInfo(host) {
  host.innerHTML = '';
  const wrap = el('div', { class: 'prose' });

  wrap.appendChild(el('h2', { text: 'What this tool is for' }));
  wrap.appendChild(el('p', { text: 'fMRI Paradigm Studio provides a single interface for reading, editing, validating and converting block-design paradigm files. It removes the need to edit those files by hand, or to install each vendor\'s authoring software in order to inspect a design.' }));
  wrap.appendChild(el('p', { text: 'The tool renders the paradigm timeline, plays the run at real time so that stimulus pacing can be assessed, verifies file syntax and internal references, and reports any disagreement between the length the design produces and the acquisition the file declares. A paradigm can then be written out in another presentation format, or as the timing files required for first level analysis.' }));
  wrap.appendChild(el('p', { text: 'Processing is performed locally in the browser. No file is transmitted, and the page functions without a network connection.' }));
  wrap.appendChild(el('div', { class: 'banner warn' }, el('div', { html: '<b>This is a design and communication aid, not a clinical device.</b> Nothing here is validated for diagnosis or for treatment planning, and no output should be used on a scanner without being checked in the software that will present it.' })));

  wrap.appendChild(el('h2', { text: 'Time origin and units' }));
  wrap.appendChild(el('h3', { text: 'Where time zero is' }));
  wrap.appendChild(el('p', { text: 'Analysis packages take an onset of zero to mean the start of the first analysed volume. Presentation programs do not all adopt the same origin. Some measure from when the program started, which includes the time the instruction screen was displayed. A paradigm handed over with onsets measured from the wrong origin shifts every onset by a constant, while the spacing between events remains correct, so the error is not apparent on inspection.' }));
  wrap.appendChild(el('p', { text: 'This tool measures from the scanner trigger. Material presented before the trigger carries a negative onset, is shown separately on the timeline, and is excluded from every export. A paradigm that defines no trigger wait is reported as a warning rather than assumed.' }));
  wrap.appendChild(el('h3', { text: 'Seconds and milliseconds' }));
  wrap.appendChild(el('p', { text: 'Presentation formats are specified in milliseconds and analysis formats in seconds. Reading one as the other produces a thousandfold error which, in the direction that shortens everything, resembles a fast event related design rather than a fault. All internal values are held in whole milliseconds and converted only when a file is written. Run lengths and event durations outside plausible ranges are reported.' }));

  wrap.appendChild(el('h2', { text: 'Volumes discarded at the start of a run' }));
  wrap.appendChild(el('p', { text: 'Scanners commonly acquire several volumes before the signal reaches steady state. Where these are discarded by the scanner and never written, existing onsets are already correct. Where they are written and excluded during analysis, every onset must be brought forward by the number of discarded volumes multiplied by the repetition time. An error here shifts the entire design by several seconds.' }));
  wrap.appendChild(el('p', { html: 'The setting is on the Convert tab. It is zero by default, no correction is applied without it, and the shift is stated on every file written.' }));

  wrap.appendChild(el('h2', { text: 'Block design conventions' }));
  wrap.appendChild(el('p', { text: 'A block design alternates periods during which the participant performs the task with periods during which they do not, and the contrast between them produces the statistical map. Blocks are typically twenty to thirty seconds, long enough for the haemodynamic response to plateau and short enough to limit habituation and to remain tolerable for a patient. The repetition time is the interval required to acquire one volume, so the volume count multiplied by the repetition time is the length of the run. Where that product and the design length disagree, either acquisition stops before the task completes or continues after it ends. The status bar compares the two continuously.' }));

  /* --- what can and cannot be converted, ahead of the software reference --- */
  wrap.appendChild(el('h2', { text: 'What can and cannot be converted' }));
  wrap.appendChild(el('p', { text: 'Several experiment files are closed binary formats with no published description. Where that is the case the tool reports it and declines, rather than inferring structure. A partially correct timing file is more damaging than no file, because it will be used.' }));
  const tbl = el('table');
  tbl.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: 'Format' }), el('th', { text: 'Read' }), el('th', { text: 'Write' }), el('th', { text: 'Basis' })
  ])));
  const tb = el('tbody');
  const yes = '<span class="pill ok">yes</span>', no = '<span class="pill bad">no</span>', part = '<span class="pill warn">partial</span>';
  for (const r of [
    ['Paradigm folder, XML', yes, yes, 'Open XML with a published syntax description. Unedited files are written back byte for byte.'],
    ['Paradigm JSON, both dialects', yes, yes, 'Open JSON. Both the identifier referenced and name referenced dialects are handled.'],
    ['Design file, .des', no, yes, 'Documented XML listing condition, onset, duration and amplitude in seconds.'],
    ['Neutral paradigm JSON', yes, yes, 'This tool\'s own lossless interchange format.'],
    ['BIDS events', yes, yes, 'Open specification, plain text.'],
    ['FSL three column EV', yes, yes, 'Plain numeric text.'],
    ['AFNI stimulus times', yes, yes, 'Plain numeric text. A single run is read.'],
    ['SPM conditions', no, part, 'The container is a MATLAB binary. A script that constructs it is written instead.'],
    ['Siemens inline BOLD', part, yes, 'Plain text. Read only to check a shipped companion file against the design.'],
    ['PsychoPy conditions table', yes, yes, 'Plain CSV.'],
    ['PsychoPy experiment', no, yes, 'Parameters may contain arbitrary Python, so a file cannot be interpreted without executing it.'],
    ['Presentation scenario', no, yes, 'Plain text and writable. Reading the full scenario language is out of scope.'],
    ['OpenSesame script', no, yes, 'Plain text and writable.'],
    ['E-Prime experiment', no, no, 'Proprietary and undocumented. No published schema exists.'],
    ['E-Prime list conditions', no, yes, 'Documented tab delimited text.'],
    ['SuperLab experiment', no, no, 'Proprietary binary object graph with no field names or record tags.'],
    ['SuperLab stimulus list', no, yes, 'Plain text, one file path per line.']
  ]) tb.appendChild(el('tr', {}, [el('td', { html: `<b>${r[0]}</b>` }), el('td', { html: r[1] }), el('td', { html: r[2] }), el('td', { class: 'mut', text: r[3] })]));
  tbl.appendChild(tb);
  wrap.appendChild(el('div', { class: 'scroll' }, tbl));

  /* --- software reference, collapsible, open by default --- */
  const soft = el('details', { class: 'panel', open: true, style: 'margin-top:18px' });
  soft.appendChild(el('summary', {}, [
    el('span', {}, [el('span', { class: 'caret', text: '›' }), ' Software']),
    el('span', { class: 'mut', style: 'text-transform:none;letter-spacing:0', text: INFO_TOOLS.length + ' entries' })
  ]));
  const softBody = el('div');
  for (const t of INFO_TOOLS) {
    const c = el('div', { class: 'toolcard' });
    c.appendChild(el('h3', { text: t.name }));
    c.appendChild(el('div', { class: 'meta', text: t.meta }));
    c.appendChild(el('p', { text: t.what }));
    c.appendChild(el('p', { html: '<b>Files.</b> ' + t.formats }));
    c.appendChild(el('p', { html: '<b>Scanner trigger.</b> ' + t.trigger }));
    const pc = el('div', { class: 'proscons' });
    pc.appendChild(el('div', {}, [el('h4', { text: 'Strengths' }), el('ul', {}, t.pros.map(x => el('li', { text: x })))]));
    pc.appendChild(el('div', {}, [el('h4', { text: 'Limitations' }), el('ul', {}, t.cons.map(x => el('li', { text: x })))]));
    c.appendChild(pc);
    c.appendChild(el('p', { class: 'hint', html: '<b>In this tool.</b> ' + t.here }));
    softBody.appendChild(c);
  }
  soft.appendChild(softBody);
  wrap.appendChild(soft);

  wrap.appendChild(el('h2', { text: 'Reading the checks' }));
  wrap.appendChild(el('p', { html: 'An <b>error</b> means the paradigm refers to something that does not exist, or will not behave as written. A <b>warning</b> means it is internally valid but something is unusual or rests on an assumption. A <b>note</b> is context. Two checks are worth knowing about specifically.' }));
  wrap.appendChild(el('p', { html: '<b>Design length against declared volumes.</b> If the block design produces a different run length from the volume count the scanner is instructed to acquire, one of the two is incorrect, unless the difference is deliberate stabilisation volumes.' }));
  wrap.appendChild(el('p', { html: '<b>Description against design.</b> Paradigm packages carry a written description and often a scanner side companion file. When a paradigm is re-timed these are frequently not updated, and are then read in preference to the timing. Statements of block length, cycle count, repetition time and volume count are compared against the design, and those that no longer agree are reported.' }));

  wrap.appendChild(el('h2', { text: 'Future work and dependencies' }));
  wrap.appendChild(el('p', { text: 'The following are known limitations. Progress on most of them depends on obtaining reference material, since a format is only supported once it can be verified against a file that was actually used.' }));
  const fut = el('ul');
  for (const x of [
    'Video stimuli are parsed and preserved but have never been exercised against a real paradigm, as none in the reference set uses them.',
    'Reading PsychoPy experiment files, which would require evaluating embedded Python.',
    'Reading Presentation and OpenSesame experiment files, currently write only.',
    'Multiple run and multiple session designs. The model describes a single run.',
    'Event related and jittered designs are represented and exported correctly, but the editing interface is oriented towards block designs.',
    'Randomisation within a block is stored and reported but not simulated, so a randomised order is previewed in its written order.',
    'Verification of the generated PsychoPy, Presentation, OpenSesame, E-Prime and SuperLab outputs against files that have been run on a scanner.'
  ]) fut.appendChild(el('li', { text: x }));
  wrap.appendChild(fut);
  wrap.appendChild(el('p', { html: 'Sample files are the main constraint. Useful contributions include a <code>.psyexp</code> and its conditions CSV, a Presentation <code>.sce</code>, an E-Prime list conditions file, an OpenSesame <code>.osexp</code>, a Siemens inline BOLD <code>.ini</code> with the paradigm it belongs to, and any paradigm using video or response collection.' }));

  wrap.appendChild(el('h2', { text: 'Contact' }));
  wrap.appendChild(el('p', { html: 'Problems, requests for specific functionality, and offers of sample files: <a href="mailto:fmri@openadaptive.org">fmri@openadaptive.org</a>. Sample files are particularly welcome, since format support is limited by what can be verified rather than by effort. Please remove patient identifiers before sending anything.' }));

  wrap.appendChild(el('h2', { text: 'Privacy' }));
  wrap.appendChild(el('p', { text: 'Files are read in the browser and are not transmitted. There is no server, no analytics and no network request of any kind after the page has loaded. The page can be saved to disk and used without a network connection.' }));

  host.appendChild(wrap);
}
