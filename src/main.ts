import { transition, AppState, AppEvent } from "./state.js";
import { drawPaths } from "./annotate.js";
import { trackPoint } from "./tracker.js";

declare const cv: any;

// ---- DOM refs ----

const videoArea  = document.getElementById("video-area")!;
const video      = document.getElementById("video") as HTMLVideoElement;
const overlay    = document.getElementById("overlay") as HTMLCanvasElement;
const zoomModal  = document.getElementById("zoom-modal")!;
const zoomCanvas = document.getElementById("zoom-canvas") as HTMLCanvasElement;
const controls   = document.getElementById("controls")!;
const ctx        = overlay.getContext("2d")!;
const zoomCtx    = zoomCanvas.getContext("2d")!;
const captureCanvas = document.createElement("canvas");
const captureCtx    = captureCanvas.getContext("2d")!;

// ---- OpenCV ----

const cvReady = new Promise<void>((resolve) => {
  if (cv.Mat) resolve();
  else cv.onRuntimeInitialized = resolve;
});

// ---- State ----

let state: AppState = { stage: "upload" };

function dispatch(event: AppEvent) {
  const next = transition(state, event);
  if (next === state) return;
  if (event.type !== "back") history.pushState({ stage: next.stage }, "");
  state = next;
  render();
}

window.addEventListener("popstate", () => {
  dispatch({ type: "back" });
});

// ---- Video helpers ----

let fps = 30;

function seek(t: number): Promise<void> {
  return new Promise((resolve) => { video.onseeked = () => resolve(); video.currentTime = t; });
}

function captureFrame() {
  captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCtx.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
}

function syncOverlaySize() {
  overlay.width  = video.videoWidth;
  overlay.height = video.videoHeight;
  captureCanvas.width  = video.videoWidth;
  captureCanvas.height = video.videoHeight;
  document.documentElement.style.setProperty("--video-aspect", String(video.videoWidth / video.videoHeight));
}

function toVideoCoords(clientX: number, clientY: number) {
  const r = overlay.getBoundingClientRect();
  const coords = {
    x: (clientX - r.left) * (video.videoWidth / r.width),
    y: (clientY - r.top)  * (video.videoHeight / r.height),
  };
  return coords;
}

// ---- Zoom modal ----

const ZOOM_CANVAS_SIZE = 240; // display px
const ZOOM_HALF = 60;         // video px — shows 120×120 native px at 2× zoom

let zoomViewCenter: { x: number; y: number } | null = null;

function renderZoomCanvas() {
  if (!zoomViewCenter) return;
  captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
  zoomCtx.fillStyle = "#000";
  zoomCtx.fillRect(0, 0, ZOOM_CANVAS_SIZE, ZOOM_CANVAS_SIZE);
  const { x, y } = zoomViewCenter;
  zoomCtx.drawImage(captureCanvas,
    x - ZOOM_HALF, y - ZOOM_HALF, ZOOM_HALF * 2, ZOOM_HALF * 2,
    0, 0, ZOOM_CANVAS_SIZE, ZOOM_CANVAS_SIZE
  );
  paintCrosshair(zoomCtx, ZOOM_CANVAS_SIZE / 2, ZOOM_CANVAS_SIZE / 2);
}

function openZoomModal(vx: number, vy: number) {
  zoomViewCenter = { x: vx, y: vy };
  renderZoomCanvas();
  zoomModal.classList.add("open");
}

function closeZoomModal() {
  zoomModal.classList.remove("open");
}

function panZoom(dvx: number, dvy: number) {
  if (!zoomViewCenter) return;
  const panStep = ZOOM_HALF * 2 * 0.33;
  zoomViewCenter = {
    x: Math.max(ZOOM_HALF, Math.min(video.videoWidth  - ZOOM_HALF, zoomViewCenter.x + dvx * panStep)),
    y: Math.max(ZOOM_HALF, Math.min(video.videoHeight - ZOOM_HALF, zoomViewCenter.y + dvy * panStep)),
  };
  renderZoomCanvas();
}

document.getElementById("zoom-close")!.addEventListener("click", closeZoomModal);
document.getElementById("zoom-up")!.addEventListener("click",    () => panZoom( 0, -1));
document.getElementById("zoom-down")!.addEventListener("click",  () => panZoom( 0,  1));
document.getElementById("zoom-left")!.addEventListener("click",  () => panZoom(-1,  0));
document.getElementById("zoom-right")!.addEventListener("click", () => panZoom( 1,  0));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeZoomModal(); });

// ---- Crosshair ----

function paintCrosshair(c: CanvasRenderingContext2D, x: number, y: number) {
  const R = 16;
  c.strokeStyle = "rgba(0,255,0,0.9)";
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, y - R); c.lineTo(x, y + R); c.stroke();
  c.beginPath(); c.moveTo(x - R, y); c.lineTo(x + R, y); c.stroke();
  c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke();
}

function drawCrosshair(x: number, y: number) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  paintCrosshair(ctx, x, y);
}

// ---- Controls panels ----

function renderUpload() {
  overlay.style.display = "none";
  closeZoomModal();
  video.style.display = "none";
  controls.innerHTML = `
    <p class="hint">Upload a video to begin.</p>
    <label class="btn btn-primary" style="text-align:center">
      Choose video
      <input type="file" accept="video/*" style="display:none" id="file-input">
    </label>
  `;
  document.documentElement.style.removeProperty("--video-aspect");

  const dropZone = document.body;
  dropZone.addEventListener("dragover", (e) => e.preventDefault(), { once: false });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) loadFile(file);
  }, { once: true });

  document.getElementById("file-input")!.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) loadFile(file);
  });
}

function loadFile(file: File) {
  video.src = URL.createObjectURL(file);
  video.load();
  video.addEventListener("loadedmetadata", async () => {
    syncOverlaySize();
    fps = 30; // default; no reliable browser API for exact fps
    await seek(0);
    dispatch({ type: "fileSelected", file });
  }, { once: true });
}

async function renderEndcapSelect() {
  if (state.stage !== "endcapSelect") return;
  video.style.display = "";
  overlay.style.display = "";
  closeZoomModal();

  if (state.startTime > 0) await seek(state.startTime);

  controls.innerHTML = `
    <p class="hint">Scrub to the starting frame, then tap the barbell endcap.</p>
    <input type="range" id="scrubber" min="0" max="${video.duration}" step="any" value="${video.currentTime}">
    <div class="transport">
      <button class="btn btn-secondary" id="skip-back-big">⏮</button>
      <button class="btn btn-secondary" id="step-back">◀</button>
      <button class="btn btn-secondary" id="play-pause">▶</button>
      <button class="btn btn-secondary" id="step-fwd">▶</button>
      <button class="btn btn-secondary" id="skip-fwd-big">⏭</button>
    </div>
    <button class="btn btn-primary" id="confirm-endcap" disabled>Confirm →</button>
  `;

  const scrubber = document.getElementById("scrubber") as HTMLInputElement;
  const playPauseBtn = document.getElementById("play-pause")!;
  const confirmBtn = document.getElementById("confirm-endcap") as HTMLButtonElement;
  let selectedPt: { x: number; y: number } | null = null;

  video.addEventListener("timeupdate", () => { scrubber.value = String(video.currentTime); });
  video.addEventListener("play",  () => { playPauseBtn.textContent = "⏸"; });
  video.addEventListener("pause", () => { playPauseBtn.textContent = "▶"; });

  scrubber.addEventListener("input", () => seek(Number(scrubber.value)));

  document.getElementById("play-pause")!.addEventListener("click", () => {
    video.paused ? video.play() : video.pause();
  });
  document.getElementById("step-back")!.addEventListener("click", () => {
    video.pause(); video.currentTime = Math.max(0, video.currentTime - 1 / fps);
  });
  document.getElementById("step-fwd")!.addEventListener("click", () => {
    video.pause(); video.currentTime = Math.min(video.duration, video.currentTime + 1 / fps);
  });
  document.getElementById("skip-back-big")!.addEventListener("click", () => {
    video.pause(); video.currentTime = Math.max(0, video.currentTime - 0.25);
  });
  document.getElementById("skip-fwd-big")!.addEventListener("click", () => {
    video.pause(); video.currentTime = Math.min(video.duration, video.currentTime + 0.25);
  });

  overlay.addEventListener("click", (e) => {
    const pt = toVideoCoords(e.clientX, e.clientY);
    openZoomModal(pt.x, pt.y);
  });

  zoomCanvas.addEventListener("click", (e) => {
    if (!zoomViewCenter) return;
    const r = zoomCanvas.getBoundingClientRect();
    const relX = (e.clientX - r.left) / r.width;
    const relY = (e.clientY - r.top)  / r.height;
    selectedPt = {
      x: zoomViewCenter.x + (relX - 0.5) * ZOOM_HALF * 2,
      y: zoomViewCenter.y + (relY - 0.5) * ZOOM_HALF * 2,
    };
    closeZoomModal();
    drawCrosshair(selectedPt.x, selectedPt.y);
    confirmBtn.disabled = false;
  });

  confirmBtn.addEventListener("click", () => {
    if (!selectedPt) return;
    video.pause();
    dispatch({ type: "endcapConfirmed", startPt: selectedPt, startTime: video.currentTime });
  });
}

async function renderAnalyzing() {
  if (state.stage !== "analyzing") return;
  const { startTime, startPt } = state;

  video.style.display = "";
  overlay.style.display = "";
  closeZoomModal();

  controls.innerHTML = `
    <p class="hint" id="progress-label">Preparing…</p>
    <div class="progress-bar"><div class="progress-bar-fill" id="progress-fill" style="width:0%"></div></div>
  `;

  const label = document.getElementById("progress-label")!;
  const fill  = document.getElementById("progress-fill")!;

  await cvReady;
  await seek(startTime);

  const positions: { x: number; y: number }[] = [startPt];
  let pt = startPt;
  let prevFrame = captureFrame();
  const step = 1 / fps;
  const totalTime = video.duration - startTime;
  let frameIdx = 0;

  for (let t = startTime + step; t <= video.duration; t += step) {
    // check if user navigated away
    if (state.stage !== "analyzing") return;

    await seek(t);
    const frame = captureFrame();
    const next = trackPoint(cv, prevFrame, frame, pt);
    if (!next) break;
    pt = next;
    positions.push({ x: pt.x, y: pt.y });
    prevFrame = frame;
    frameIdx++;

    const pct = Math.min(100, Math.round((t - startTime) / totalTime * 100));
    label.textContent = `Analyzing… frame ${frameIdx}`;
    fill.style.width = `${pct}%`;

    // draw growing path
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    positions.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }

  const palette = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
  // For now, treat the whole run as one rep; analysis.ts rep detection to be wired up later.
  dispatch({
    type: "analysisComplete",
    positions,
    reps: [{ startFrame: 0, endFrame: positions.length - 1 }],
    pauses: [],
    palette,
  });
}

function renderResults() {
  if (state.stage !== "results") return;
  const { positions, reps, pauses, palette, startTime } = state;

  video.style.display = "";
  overlay.style.display = "";
  closeZoomModal();

  const visibility = reps.map(() => true);

  function redraw() {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const visibleReps = reps.filter((_, i) => visibility[i]);
    const visiblePalette = palette.filter((_, i) => visibility[i]);
    drawPaths(ctx as any, positions, visibleReps, visiblePalette);
  }

  redraw();

  const startPct = (startTime / video.duration * 100).toFixed(3);

  // Transport controls
  controls.innerHTML = `
    <div class="transport">
      <button class="btn btn-secondary" id="res-play-pause">▶</button>
      <div style="flex:1;position:relative">
        <input type="range" id="res-scrubber" min="0" max="${video.duration}" step="any" value="${video.currentTime}" style="width:100%">
        <div style="position:absolute;top:0;bottom:0;left:${startPct}%;width:2px;background:#facc15;pointer-events:none;transform:translateX(-50%)"></div>
      </div>
    </div>
    <table class="rep-table">
      <thead><tr><th></th><th>#</th><th>Frames</th></tr></thead>
      <tbody id="rep-tbody"></tbody>
    </table>
    <button class="btn btn-secondary" id="export-btn">Export PNG</button>
  `;

  const playPauseBtn = document.getElementById("res-play-pause")!;
  const scrubber = document.getElementById("res-scrubber") as HTMLInputElement;

  video.addEventListener("timeupdate", () => { scrubber.value = String(video.currentTime); });
  video.addEventListener("play",  () => { playPauseBtn.textContent = "⏸"; });
  video.addEventListener("pause", () => { playPauseBtn.textContent = "▶"; });

  playPauseBtn.addEventListener("click", () => { video.paused ? video.play() : video.pause(); });
  scrubber.addEventListener("input", () => seek(Number(scrubber.value)));

  const tbody = document.getElementById("rep-tbody")!;
  reps.forEach((rep, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="swatch" style="background:${palette[i % palette.length]}"></span></td>
      <td>${i + 1}</td>
      <td>${rep.endFrame - rep.startFrame + 1}</td>
    `;
    tr.addEventListener("click", () => {
      visibility[i] = !visibility[i];
      tr.classList.toggle("muted", !visibility[i]);
      redraw();
    });
    tbody.appendChild(tr);
  });

  document.getElementById("export-btn")!.addEventListener("click", () => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width  = video.videoWidth;
    exportCanvas.height = video.videoHeight;
    const exportCtx = exportCanvas.getContext("2d")!;
    exportCtx.drawImage(video, 0, 0);
    exportCtx.drawImage(overlay, 0, 0);
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "barpath.png";
      a.click();
    });
  });
}

// ---- Main render ----

function render() {
  switch (state.stage) {
    case "upload":       renderUpload();   break;
    case "endcapSelect": renderEndcapSelect(); break;
    case "analyzing":    renderAnalyzing(); break;
    case "results":      renderResults(); break;
  }
}

render();
