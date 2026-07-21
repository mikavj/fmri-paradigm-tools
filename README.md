# fMRI Paradigm Studio

A single web page for viewing, editing and converting fMRI block-design paradigm files.
It runs entirely in the browser. No server, no installation, no upload: every file you open
is read locally and nothing leaves the machine.

The purpose is to let engineers, physicists, psychologists and clinicians look at the same
paradigm and change it together, without anyone needing to install a particular vendor's
software or learn its file syntax.

**This is a design and communication aid, not a clinical device.** Nothing here is
validated for diagnosis or treatment planning. Check any output in the software that will
actually present it before using it on a scanner.

---

## Files

| File | What it is |
|---|---|
| `ParadigmStudio.html` | The whole application. Open it in a browser, or host it as a static page. |
| `index.html` | Redirects to `ParadigmStudio.html`, so the bare Pages URL works. |
| `check-timing.mjs` | Command line batch check over a whole paradigm library. Needs Node. |
| `src/` | The source parts the single page is built from, plus `build.sh` which concatenates them. |
| `README.md` | This file. |

`ParadigmStudio.html` replaces the earlier `ParadigmViewer.html` and `ParadigmEditor.html`,
which were separate programs. Everything both of them did is here, in one page, with the
editor and the preview on screen at the same time.

Those two file names still exist, but only as short pages that point here and list the
defects that made them unsafe to keep using. They are stubs so that an existing bookmark or
a shared link does not silently continue to serve a version with known timing errors. The
original source of both is in the repository history.

## Using it

Open `ParadigmStudio.html` in Chrome, Edge, Firefox or Safari and drop a paradigm folder
onto the page. Open the folder rather than a single file whenever the paradigm references
pictures, audio or video, so that the media can be found and previewed.

To sweep a library from the command line:

```
node check-timing.mjs "/path/to/paradigm library"
node check-timing.mjs "/path/to/paradigm library" --verbose
```

It exits with status 1 if any paradigm's design length disagrees with its declared volume
count, so it can be used in a check script.

## Hosting on GitHub Pages

Still entirely possible, and nothing about this build changes that. The page is one static
file with no dependencies, no build step and no network calls. Commit it to the repository,
enable Pages for the branch, and the file is live. It also works opened directly from disk
with a `file://` URL, which matters on an isolated scanner console with no network.

The live site is at:

    https://mikavj.github.io/fmri-paradigm-tools/

The site root redirects to `ParadigmStudio.html`. The earlier addresses
`.../ParadigmViewer.html` and `.../ParadigmEditor.html` still resolve, now to short pages
that point at Paradigm Studio.

---

## Starting without a file

The opening screen offers two ways in besides opening your own paradigm.

**Open a working demo** loads one of two complete paradigms written from scratch for this
tool: a bilateral finger tapping block design, and a reversing checkerboard localiser. Both
contain no site or patient material, both generate their own pictures in the browser, and
both are internally consistent, meaning the design length equals the declared volume count
exactly. Either can be exported as a complete package and run.

**Start a new paradigm** creates a scaffold in whichever form you want to end up with. The
scaffold is a rest, task, rest sandwich that already validates cleanly, so the status bar
starts green and stays green as you extend it.

## The eight tabs

**Design.** Acquisition parameters, session order, blocks, trials and variables on the
left; the live preview, the timeline and the display target on the right. Every edit
recomputes the timing immediately, so the run length and the volume count in the status bar
respond as you type.

**Stimuli.** The stimulus sets, their text, pictures, audio, video and expected responses,
with a sizing report against the screen you will actually present on.

**Timeline.** The block design chart, the session broken into segments, and the fully
expanded event list with onsets in seconds.

**Calibrate.** Answers the two questions that come up the first time anyone builds stimuli:
how large should the text be, and how large should the pictures be. A slider previews text
at a chosen pixel height against the real display geometry and reports whether your longest
word still fits across the screen. A second slider turns a proportion of screen height into
the exact pixel dimensions to export your stimuli at, for every display version at once. The
chosen font size can be written straight into the paradigm.

For the final answer it also writes a small calibration paradigm to run on the in bore
display: a ladder of text sizes and a ladder of outlined boxes of known pixel size, each
screen advancing on a key press. Nothing in it acquires data. The box images are generated
in the browser, with the size label placed in the margin rather than across the outline, so
the box it is measuring stays unobstructed.

**Convert.** Writes the paradigm into the other formats. Each target states plainly what it
does not carry across.

**Raw Files.** Every file the paradigm is made of, as raw text, editable directly. Applying an
edit reparses the whole paradigm through the same reader used for a file opened from disk,
so a mistake surfaces as a parse error and is refused rather than being written out. There
is a check button that parses without applying.

**Validate.** Errors, warnings and notes, each naming the specific item at fault.

**Information.** What can and cannot be converted and why, a reference on the software used
in this field and how each handles the scanner trigger, known limitations, and contact
details. It is readable before any file is opened.

### Hints

Several sections carry a collapsed hint below them, marked with a caret. They stay shut
until asked for, so the interface is quiet for someone who knows the format. The one under
Variables lists the names that recur across the real paradigm library with what each one
means, and adds the one you pick with a typical starting value, which saves guessing or
going to the manual. Those names are a convention observed in real files rather than a
published vocabulary, and the hint says so.

---

## Time, and the two things that go wrong

Everything inside the tool is held in whole milliseconds, and time zero is the scanner
trigger. Both choices exist to prevent a specific, common and quiet failure.

**Origin.** Analysis packages take an onset of zero to mean the start of the first analysed
volume. Presentation programs do not all agree. A paradigm exported with onsets measured
from when the program started, rather than from the trigger, shifts every onset by however
long the instruction screen was up. The spacing between events still looks correct, so the
error survives inspection. Anything presented before the trigger is given a negative onset
here, shown separately on the timeline, and excluded from every export.

**Units.** Presentation programs work in milliseconds, analysis formats in seconds. Reading
one as the other is a thousandfold error, and in the direction that makes everything too
short it looks like a fast event-related design rather than a fault. Conversion to seconds
happens only at the moment a file is written, and the tool warns when a run length or a
typical event duration is physically implausible.

There is a third, on the Convert tab: **volumes discarded at the start of a run**. If the
scanner threw them away and never wrote them, your onsets are already correct. If they were
written and are dropped during analysis, every onset must move earlier by that many
repetition times. The setting is zero by default, nothing is applied silently, and the shift
is stated on every file written.

---

## Formats

| Format | Read | Write | Notes |
|---|---|---|---|
| Paradigm folder, XML | yes | yes | Unedited files are written back byte for byte. |
| Paradigm JSON | yes | yes | Both the identifier-referenced and name-referenced dialects. |
| Design file `.des` | no | yes | The XML design file read by the matching analysis software: condition, onset, duration and amplitude in seconds. |
| Neutral paradigm JSON | yes | yes | This tool's own lossless interchange file. |
| BIDS `_events.tsv` + sidecar | yes | yes | Onset and duration in seconds. The safest way to hand timing to an analyst. |
| FSL three-column EV | yes | yes | Onset, duration, weight, in seconds, one file per condition. |
| AFNI stimulus times | yes | yes | One row per run in seconds. Pass `-local_times` to `3dDeconvolve`. |
| SPM multiple conditions | no | partial | A MATLAB binary cannot be written from a browser. A script that builds it is written instead, plus the same data as JSON. |
| Siemens inline BOLD `.ini` | partial | yes | Read only far enough to check a shipped companion file against the design. |
| PsychoPy conditions CSV | yes | yes | |
| PsychoPy `.psyexp` | no | yes | Parameters can contain arbitrary Python, so a file cannot be interpreted without running it. |
| Presentation `.sce` | no | yes | Confirm the pulse settings against your own scanner. |
| OpenSesame script | no | yes | |
| E-Prime list conditions | no | yes | Only useful if the receiving List is already set to load from a file. |
| E-Prime `.es3`, `.edat3` | no | no | Proprietary and undocumented. No published schema exists. |
| SuperLab stimulus list | no | yes | Paths only. The format carries nothing else. |
| SuperLab `.sl5`, `.sl6` | no | no | See below. |

### Why SuperLab and E-Prime experiment files are not supported

Not an oversight. `.sl5` is a length-prefixed binary object graph with no record tags, no
table of contents, no chunk lengths and no field names. Its container mechanics can be
worked out far enough to prove that there is no way to tell which number in the file is a
duration in milliseconds and which is a randomisation setting. E-Prime's `.es3` has no
published specification and no third-party reader.

Scavenging plausible-looking strings and numbers out of either would produce a partial,
unlabelled timing file. In a tool used for clinical research communication that is worse
than declining, because a file that exists will be used. Where a documented text-based
route into those programs exists, such as a stimulus list or a list conditions file, that
route is supported instead.

---

## Checks worth knowing about

**Design length against declared volumes.** The most useful number in the tool. If the
block design produces a different run length from the volume count the scanner is told to
acquire, one of the two is wrong, unless the difference is deliberate stabilisation volumes.

**Description against design.** Paradigm packs carry a written description, and often a
scanner-side companion file. When a paradigm is re-timed these are frequently not updated,
and the next person reads the description rather than the timing. The tool compares
statements about block length, cycle count, repetition time and volume count against what
the design actually does, and reports the ones that no longer agree. Repeated findings
across a dozen translated descriptions are grouped into one message.

**Condition source.** A block is the unit that carries a condition. When a trial runs inside
a block, the block's condition governs; a trial's own condition applies only when the
session runs that trial directly. This matters because converted paradigm files often carry
a default condition of zero on every trial while the blocks keep the real values. Reading
the trial first in that situation erases every active block and turns a language or motor
task into a design with no task in it. The tool reports the disagreement rather than hiding
it.

---

## Round-trip safety

A file you did not edit is written back from its original bytes, so opening a paradigm and
saving it again cannot disturb formatting, comments, indentation, line endings or character
encoding. Which parts of the model map onto which file is worked out by fingerprinting at
load and comparing at export, so editing one field rewrites one file rather than all of
them. The export dialog lists which files were copied verbatim and which were regenerated.

Paradigm files ship in a mixture of Windows-1252 and UTF-8, some with a byte order mark.
Each file's encoding is detected on read and reproduced exactly on write. If an edit
introduces a character that the original encoding cannot represent, the export dialog says
so and names the character rather than silently substituting it.

---

## Font size and picture size

Font size in these files is the height of the text in pixels on the actual display, not a
point size and not a fraction. It is held once per display version, and any single stimulus
can override it. Both are editable: the per version default on the Design tab, the per
stimulus override in the header row of each stimulus on the Stimuli tab.

Pictures are presented at their native pixel size and centred. Nothing is scaled to fit, so
the dimensions of the file are the dimensions on screen, and a picture prepared for one
display version is the wrong size on another. The Calibrate tab turns the size you want on
screen into the pixel dimensions to export at, for every version at once, and the sizing
report on the Stimuli tab flags anything that would be cropped or would come out very small.

## Behaviour taken from the published syntax

Four rules come from the vendor syntax description rather than from inspecting files, and
each one changes the computed timing or the rendering.

**A duration of zero, or no duration, means the stimulus is presented until the next
stimulus appears.** It does not mean zero length, and it does not block the sequence.

**An overlap of true means the following command is processed immediately**, so the
stimulus can remain on screen while the next is drawn. It advances the run clock by
nothing even when a duration is given. Treating either of these as blocking inflates the
computed run length.

**A position binds to the item it follows.** A slide holding a picture, then a position,
then a second picture positions only the first picture. The second is placed by the slide
default. This is why element order is preserved on export rather than normalised.

**Positions given as numbers are pixel coordinates on an 800 by 600 matrix**, with 0,0 at
the top left. This confirms what was previously inferred from the per version font sizes.

**Block order** of 1 randomises the trials within the block and 0 keeps them as listed. Some
paradigm files carry a comment beside this element that contradicts its value; the value is
what governs. The preview shows a randomised block in its written order and marks it.

## Assumptions the tool has to make

Two things are not recorded in the paradigm files and had to be derived. Both are visible
and adjustable rather than hidden.

**Display geometry.** VisualSystem 800 by 600, VisualSystem-HD and LCD-HD 1920 by 1080,
LCD-4K 3840 by 2160. These were first derived from the per version font sizes in the
reference paradigms, which are 58, 104, 104 and 208: font size scales with screen height,
208 is exactly twice 104, and 58 is 104 multiplied by 600/1080. The values were then
confirmed against the vendor syntax notes in the calibration pack, which state the same
three resolutions directly. Override them in the display target panel if your site differs.

**Numeric stimulus positions.** Some paradigms place a stimulus at a coordinate such as 150
or 550 rather than at a keyword. The file does not record which coordinate space those
numbers belong to. The same 800 by 600 space explains them, since 150 and 550 sit a quarter
and three quarters of the way across an 800 pixel screen. The assumed space is shown and
editable on the Design tab.

---

## Keyboard

## Contact

Problems, requests for specific functionality, and offers of sample files:
**fmri@openadaptive.org**. Sample files are the main constraint on format support, since a
format is only supported once it can be verified against a file that was actually used.
Please remove patient identifiers before sending anything.

| Left, Right | Move one second, or ten seconds with Shift |
| Home | Return to the trigger |

Playback defaults to 1x, real time. That is the rate at which you can judge whether the
pacing is tolerable for a patient, which is usually the reason for watching it at all.
