# fMRI Paradigm Tools

Two self-contained, browser-based tools for working with fMRI block-design paradigm files (the XML format with a main `.xml` + `_trials.xml` + `_slides_*.xml` + `Defaults_*.xml` + `Pictures/`). Everything runs locally in your browser — nothing is installed and nothing is uploaded.

- **`ParadigmViewer.html`** — preview a paradigm and test its **timing** and **image sizing** before you load it on the scanner.
          https://mika-vafaie-janbahan.github.io/fmri-paradigm-tools/ParadigmViewer.html
- **`ParadigmEditor.html`** — edit a paradigm (block design, timing, trials, slide text/pictures, sizing, colours, contrasts) and **export** a complete, scanner-ready folder.
          https://mika-vafaie-janbahan.github.io/fmri-paradigm-tools/ParadigmEditor.html
- **`check-timing.mjs`** — a command-line companion that batch-checks the timing of every paradigm under a folder.

These are independent helper tools. They are not affiliated with, or produced by, any scanner-software vendor.

### Stimulus types & file encoding

Both tools handle every stimulus type the format uses:

- **Text** — multi-line, rendered at the version's `FontSize`.
- **Images** — single or **layered** (multiple `<Picture>` per slide, drawn in order).
- **Audio** — `<Sound>` (`.wav` in `Tones/`, `.mp3` in `audio/`); the viewer plays it during Playback, the editor lets you add/replace it.
- **Video** — `<Video>` is preserved and previewed (placeholder); the format allows it though it's uncommon in practice.
- **Response collection** — `<expectedResponse>` (button presses, e.g. for decision tasks) is parsed, shown, and editable.

Files are read and written in their **original encoding** — paradigms ship as either **windows-1252** or **UTF-8 (with or without a BOM)**, and each file's encoding is detected on load and preserved exactly on export, so nothing is corrupted on round-trip.

---

## ParadigmViewer.html

**Double-click it** to open in your browser (Chrome or Safari), then **Choose folder…** (or drag a folder in) and pick a single paradigm folder, or a parent folder holding several (each one is listed in the **Paradigm** dropdown).

- **Timing** — total scan length, computed vs. declared `Volumes`, active/rest split, a block-design timeline, and a per-segment breakdown. Flags any paradigm where the block design doesn't equal `Volumes × TR`.
- **Sizing** — for the screen you'll present on (LCD-HD / LCD-4K / VisualSystem, all editable), the native pixel size of every picture, the % of screen it fills, and warnings for images larger than the screen (cropped) or far too small. Renders each slide to scale.
- **Playback** — plays the real on-screen sequence at the durations in the XML (1×–60×) so you can eyeball pacing and image size together.

> Tip: the folder picker needs all of the paradigm's files (`_slides`, `_trials`, `Defaults_*`, and the `Pictures/` subfolder), so pick the **folder**, not the single `.xml`.

## ParadigmEditor.html

**Double-click it**, load a paradigm folder the same way, then edit across the tabs:

- **Timing & acquisition** — TR, Volumes, Slices, InterPulseInterval, AverageBlockLength, and the `$variables`.
- **Block design** — add / remove / reorder blocks and session steps; per-block trials, repetitions, sequential vs. random order.
- **Trials** — edit each trial's ordered operations (show / wait / clear / register, with durations and conditions).
- **Slides & text** — edit slide text (multi-line preserved), replace or add pictures, set durations / conditions / positions, per screen-version file.
- **Sizing** — per-version screen + FontSize, with a to-scale preview and a per-picture native-px report.
- **Appearance & BOLD** — background/foreground colours, positions, and contrasts.

As you edit, the **status bar recomputes timing live** (with a one-click **Fix** to set `Volumes` to match the block design), and the **Validation** tab continuously checks for problems (dangling slide/trial/block references, missing pictures, naming/encoding issues) that would stop a paradigm from loading.

**Export** writes a complete folder — correct text encoding, exact element order, all unchanged images carried over verbatim — as a downloadable `.zip`, or saved straight into a folder (Chrome/Edge).

## check-timing.mjs (command line)

Batch-check timing for every paradigm under a folder:

```sh
node check-timing.mjs "/path/to/your/paradigm-folder"
```

One line per paradigm: TR, computed duration, computed volumes, declared `Volumes`, and a ✅ match / ⛔ mismatch flag.

---

## How the timing test works

For each session it expands `runtrial` / `runblock` into real durations:

- a `wait` contributes its ms; a `show` contributes its `duration` (trial-level, else the slide's);
- a block's duration = (sum of its listed trials) × `repetitions`;
- the `Start` trial waits for the scanner trigger key, so it adds **0** scan time.

Total session time ÷ `TimeToRepeat` is the **computed volume count**, compared against the file's declared `Volumes`. The engine was validated against 28 reference paradigms (all match their declared volumes).

## How the sizing test works

Each picture is centered at its **native pixel size** (no auto-scaling) on the presentation screen, and text renders at the version's `FontSize`. The tools resolve the version-specific picture (`_lcd`, `_lcd-4K`, …), read each image's real dimensions, and report:

- **oversized → cropped** (image larger than the screen),
- **small on screen** (image fills < 25% in both dimensions),
- **file missing** (slide references a picture that isn't in the folder).

Screen presets (editable): `LCD-HD` 1920×1080, `LCD-4K` 3840×2160, `VisualSystem` 1920×1200.

---

## License

Licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE). You may use, modify, and redistribute these tools; redistributed versions must remain open-source under the same license.
