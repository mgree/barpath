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

# Architecture — three clear modules, testable in isolation:

 - `tracker.js` just pure functions: Lucas-Kanade via OpenCV.js, forward-backward error check, drift/loss detection
 - `analysis.js` just pure functions: pause detection, path straightness metrics, timing calculations.
 - `renderer.js` DOM-dependent canvas drawing: path overlay, pause annotations, frame export loop. First cut can just export a still frame with the path overlaid on it.

# Test strategy:

 - Generate a synthetic test video (a dot moving in a known pattern, generated via canvas + MediaRecorder) as a ground-truth fixture (parameter recovery, essentially) for tracker and export tests
 - Use a variety of squat/bench/deadlift videos from a variety of angles as a more realistic test suite.
 - Stand up Vitest immediately and write unit tests for `analysis.js` before or alongside implementation
 - Add Playwright once the canvas UI exists for click-to-mark and overlay rendering
 - Some kind of snapshot tests for making sure we treat the real videos similarly across changes

# For later

 - MP4 export (WebM only)
 - audio in export , automatic re-initialization on tracking loss (prompt user to re-click instead).
