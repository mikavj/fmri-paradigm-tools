# fMRI Paradigm Studio

A single web page for reading, editing, validating and converting block-design fMRI
paradigm files. It runs entirely in the browser: files are read locally and nothing is
transmitted, and the page functions without a network connection.

**This is a design and communication aid, not a clinical device.** Nothing here is
validated for diagnosis or for treatment planning. Check any output in the software that
will present it before using it on a scanner.

Live at <https://mikavj.github.io/fmri-paradigm-tools/>.

## Functions

- **Design.** Acquisition parameters, session order, blocks, trials and variables, with a
  live preview and timeline that recompute as they are edited.
- **Stimuli.** Stimulus text, pictures, audio, video and expected responses, with a sizing
  report against the target display.
- **Timeline.** The block-design chart, the session segments, and the expanded event list
  with onsets in seconds.
- **Calibrate.** Converts a required on-screen size into the font size and picture
  dimensions to author at, for each display version, and generates a bench-test paradigm
  for the in-bore display.
- **Convert.** Writes the paradigm into other presentation and analysis formats, each
  stating what it does not carry.
- **Raw Files.** The underlying files as editable text; applying an edit reparses the
  whole paradigm and reports any syntax error rather than writing it out.
- **Validate.** Errors, warnings and notes, each naming the item at fault.
- **Information.** Format reference, scanner-trigger handling by package, limitations and
  contact details. Readable before any file is opened.

## Timing, units and conversion

All internal values are held in whole milliseconds, with time zero at the scanner trigger.

**Origin.** Analysis packages take an onset of zero to mean the first analysed volume;
presentation programs do not all use the same origin. Material presented before the trigger
carries a negative onset, is shown separately, and is excluded from every export. A paradigm
with no trigger wait is reported.

**Units.** Presentation formats are in milliseconds and analysis formats in seconds; reading
one as the other is a thousandfold error. Conversion to seconds occurs only when a file is
written, and implausible run lengths or event durations are reported.

**Discarded volumes.** Where stabilisation volumes are acquired and later excluded, onsets
must be brought forward by that many repetition times. The correction is on the Convert
tab, is zero by default, and is stated on every file written.

## Formats

| Format | Read | Write | Notes |
|---|---|---|---|
| Paradigm folder, XML | yes | yes | Unedited files are written back byte for byte. |
| Paradigm JSON | yes | yes | Both the identifier- and name-referenced dialects. |
| Neutral paradigm JSON | yes | yes | Lossless interchange format. |
| BIDS `_events.tsv` + sidecar | yes | yes | Onset and duration in seconds. |
| FSL three-column EV | yes | yes | Onset, duration, weight, in seconds. |
| AFNI stimulus times | yes | yes | One run in seconds. Pass `-local_times` to `3dDeconvolve`. |
| Design file `.des` | no | yes | Condition, onset, duration, amplitude in seconds. |
| SPM multiple conditions | no | partial | A script that builds the `.mat`, plus JSON. |
| Siemens inline BOLD `.ini` | partial | yes | Read only to check a companion file against the design. |
| PsychoPy conditions CSV | yes | yes | |
| PsychoPy `.psyexp` | no | yes | Parameters may contain arbitrary Python. |
| Presentation `.sce` | no | yes | Confirm pulse settings against the scanner. |
| OpenSesame script | no | yes | |
| E-Prime list conditions | no | yes | Requires a List configured to load from a file. |
| SuperLab stimulus list | no | yes | File paths only. |
| E-Prime `.es3`, SuperLab `.sl5`/`.sl6` | no | no | Proprietary binary, no published schema. |

## Limitations

Some experiment files are closed binary formats with no published description. Where that is
the case the tool declines rather than inferring structure, since a partially correct timing
file is more damaging than none. Video stimuli are preserved but untested against a real
paradigm. Reading of PsychoPy, Presentation and OpenSesame experiment files is not supported.
The model describes a single run. Randomisation within a block is stored and reported but
previewed in written order. Generated presentation-format output has not been verified
against files run on a scanner.

## Assumptions

Two values are not recorded in the paradigm files and are derived. Both are shown and
adjustable in the interface.

**Display geometry.** VisualSystem 800 by 600, VisualSystem-HD and LCD-HD 1920 by 1080,
LCD-4K 3840 by 2160. Derived from the per-version font sizes and confirmed against the
vendor syntax description.

**Numeric stimulus positions.** Given as pixel coordinates on an 800 by 600 matrix with
0,0 at the top left, per the vendor syntax description.

## Contact

Problems, requests for functionality, and offers of sample files: **fmri@openadaptive.org**.
Format support is limited by what can be verified against a file that was actually used.
Please remove patient identifiers before sending anything.
