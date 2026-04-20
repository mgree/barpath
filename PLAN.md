# barpath

An entirely client-side barbell tracking app: the user identifies the barbell, we detect its path and pauses and play it back.

# Tech stack

Vanilla TS, OpenCV.js (WASM), Canvas API, MediaRecorder, Vite, Vitest, Playwright.

Use vanilla/stock everything where possible---no frameworks.

# Core flow

 - User uploads a video
 - User clicks the barbell cap center on the first frame (a cutout shows a zoomed in section of where their mouse is)
 - Lucas-Kanade optical flow tracks the point forward frame-by-frame
 - The path is overlaid on the canvas during playback, with pause segments highlighted and timed
 - User can export an annotated WebM via MediaRecorder + captureStream

# Architecture

 - `tracker.js` just pure functions: Lucas-Kanade via OpenCV.js, forward-backward error check, drift/loss detection
 - `analysis.js` just pure functions: pause detection, path straightness metrics, timing calculations.
 - `annotate.js` DOM-dependent canvas drawing: path overlay, pause annotations, frame export loop. First cut can just export a still frame with the path overlaid on it.

# Testing

 - [x] Generate a synthetic test video (a dot moving in a known pattern, generated via canvas + MediaRecorder) as a ground-truth fixture (parameter recovery, essentially) for tracker and export tests
 - [x] Use a variety of squat/bench/deadlift videos from a variety of angles as a more realistic test suite.
 - [ ] Unit tests for `analysis.js` before or alongside implementation
 - [ ] Add Playwright once the canvas UI exists for click-to-mark and overlay rendering
 - Some kind of snapshot tests for making sure we treat the real videos similarly across changes

# Implementation

## `analysis.ts`

Inputs throughout: `positions: {x, y}[]` (one per frame) and `fps` from video metadata.

- [x] **Smoothing**: apply a moving average (window ~5 frames, tunable) to positions before any derivative-dependent step.
- [x] **Velocity**: take finite differences of the smoothed positions; output speed in px/frame (or px/s via fps). Two passes: smooth first, differentiate second.
- [ ] **Rep detection**: find local extrema in smoothed y — zero-crossings of velocity that exceed an amplitude threshold to ignore wobbles. Output: `{startFrame, bottomFrame, endFrame}[]`.
- [ ] **Pause detection**: within each rep, find contiguous regions where speed is below a threshold (tunable, ~5–10% of peak speed for that rep) for at least N frames. Output: `{startFrame, endFrame, durationMs}[]` per rep. Use a shorter smoothing window here than for rep detection so brief pauses aren't averaged away.
- [ ] **Path straightness**: per rep, compute (a) RMS horizontal deviation of x from the rep's mean x, and (b) sinuosity = total path length / straight-line displacement. 1.0 sinuosity is a perfect vertical line.

## `annotate.ts`

Inputs: a `CanvasRenderingContext2D` (or `OffscreenCanvas`), analysis results, and a background frame. No DOM access — the UI layer owns the canvas element and calls in. All sub-functions individually exported for testability.

- [ ] **`drawBackground(ctx, frame, frameIndex)`**: draw the given frame as the canvas background. `frameIndex` is a parameter; the UI decides which frame to use (callers need to skip past e.g. unrack).
- [ ] **`drawPaths(ctx, positions, reps, palette)`**: draw each rep's positions as a polyline in `palette[i]`. Palette is caller-supplied so the UI can render a matching legend (e.g. in a rep summary table).
- [ ] **`drawPauseMarkers(ctx, positions, pauses)`**: for each pause, draw a dot at the midpoint position and a duration label (e.g. "1.2s") nearby.
- [ ] **`annotate(ctx, frame, frameIndex, positions, reps, pauses, palette)`**: convenience wrapper that calls the three above in order. Used by both the UI and the export path.

## UI / `index.html`

**Build order:** `analysis.ts` → `annotate.ts` → pipeline PNG tests → UI → Playwright.

- [ ] **Pipeline PNG tests**: before any UI work, add tests that run the full pipeline on each real video (track → analyze → annotate onto `OffscreenCanvas` → write PNG to `testdata/output/`). Not snapshot assertions — just smoke tests that confirm the pipeline doesn't throw and produce eyeball-able output. Snapshot assertions come later once output stabilizes.
- [ ] **State machine**: model the UI as a state machine (`upload → frameSelection → identification → report`) in a plain TS module with no DOM dependencies. Use `history.pushState` to sync each state to a URL so the back button works naturally and "upload a new video" is just navigating back to the start state. Unit-test the state logic directly.
- [ ] **Upload**: full-page drop zone + centered "Upload video" button (`<input type="file" accept="video/*">`). Drop zone covers the whole page on desktop; the button is the primary path on mobile (also surfaces camera roll on iOS/Android).
- [ ] **Frame selection**: video with play/pause, scrubber, and explicit prev-frame/next-frame buttons. Instruction label: "Find the frame just before your first rep." Confirm button saves the frame index.
- [ ] **Barbell identification**: tap/click to place a point; a fixed magnified inset in a corner (default: bottom-right, with a way to change corners in case the hand or bar is in the way) shows the area under the cursor/finger with a crosshair. Drag to adjust. Confirm button saves the point.
- [ ] **Report view**: annotated still canvas; table below with columns: color swatch, rep number, eccentric velocity, concentric velocity, pause duration(s); per-row toggle (eye icon) to show/hide that rep's overlay. UI owns the palette and passes it to `annotate.ts`. PNG export via `canvas.toBlob` (labeled "Export image").

# For later

## Tracking improvements

- [ ] Automatic re-initialization on tracking loss (prompt user to re-click or advance frames instead)
- [ ] **Forward-backward error check**: after tracking p → p' forward, track p' → p'' backward and reject the result if `|p - p''|` exceeds a threshold (~1–2px). Catches cases where LK converges but onto the wrong feature.
- [ ] **Drift detection**: accumulating subpixel errors compound silently over many frames while `status === 1` stays true. Mitigate with periodic template re-detection (save a patch at frame 0, run `matchTemplate` to snap the LK track back when confidence is higher) or use FB error spikes as a proxy signal.
- [ ] **Velocity consistency check**: a sudden jump > N pixels between frames (relative to expected bar speed) signals loss; flag and prompt user to re-click.

## Better export

 - [ ] MP4 export (WebM only)
 - [ ] audio in export
