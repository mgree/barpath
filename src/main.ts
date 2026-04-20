import { trackPoint } from "./tracker.js";

declare const cv: any;

const fileInput = document.getElementById("file-input") as HTMLInputElement;
const info = document.getElementById("info")!;
const fixture = document.getElementById("fixture")!;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const video = document.getElementById("video") as HTMLVideoElement;
const ctx = canvas.getContext("2d")!;

// Wait for OpenCV WASM to initialize.
await new Promise<void>((resolve) => {
  if (cv.Mat) resolve();
  else cv.onRuntimeInitialized = resolve;
});

// --- helpers ---

function drawFrame() {
  ctx.drawImage(video, 0, 0);
}

function captureFrame() {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function seek(t: number): Promise<void> {
  return new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = t;
  });
}

// --- state ---

let fileName = "";
let startTime = 0;
let startPt: { x: number; y: number } | null = null;

// --- file load ---

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileName = file.name;
  startPt = null;
  fixture.style.display = "none";
  fixture.textContent = "";
  video.src = URL.createObjectURL(file);
});

video.addEventListener("loadedmetadata", async () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  await seek(0);
  drawFrame();
  info.textContent = `${fileName} — ${video.videoWidth}×${video.videoHeight}, ${video.duration.toFixed(2)}s. Seek with arrow keys, click to mark start.`;
});

video.addEventListener("seeked", drawFrame);

// Keyboard scrubbing: arrow keys step by ~1/30s.
document.addEventListener("keydown", (e) => {
  if (!video.src) return;
  const step = 1 / 30;
  if (e.key === "ArrowRight") video.currentTime = Math.min(video.duration, video.currentTime + step);
  if (e.key === "ArrowLeft")  video.currentTime = Math.max(0, video.currentTime - step);
});

// Show coordinates while hovering.
canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  const x = Math.round((e.clientX - r.left) * scaleX);
  const y = Math.round((e.clientY - r.top) * scaleY);
  if (startPt) return; // don't clobber tracking status
  info.textContent = `t=${video.currentTime.toFixed(4)}  x=${x}  y=${y}`;
});

// Click to mark start, then track.
canvas.addEventListener("click", async (e) => {
  if (!video.src) return;
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  const x = Math.round((e.clientX - r.left) * scaleX);
  const y = Math.round((e.clientY - r.top) * scaleY);

  startTime = video.currentTime;
  startPt = { x, y };

  // Show fixture immediately.
  const fixtureData = { file: fileName, time: +startTime.toFixed(4), x, y };
  fixture.textContent = JSON.stringify(fixtureData, null, 2);
  fixture.style.display = "block";

  info.textContent = `Tracking from t=${startTime.toFixed(4)} (${x}, ${y})…`;

  // Track forward frame by frame.
  const STEP = 1 / 30;
  const path: { x: number; y: number }[] = [startPt];
  let pt = startPt;
  let prevFrame = captureFrame();

  for (let t = startTime + STEP; t <= video.duration; t += STEP) {
    await seek(t);
    drawFrame();
    const frame = captureFrame();
    const next = trackPoint(cv, prevFrame, frame, pt);
    if (!next) { info.textContent = `Tracking lost at t=${t.toFixed(3)}.`; break; }
    pt = next;
    path.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
    prevFrame = frame;
  }

  // Overlay path.
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.beginPath();
  path.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  // Mark start.
  ctx.fillStyle = "lime";
  ctx.beginPath();
  ctx.arc(startPt.x, startPt.y, 6, 0, Math.PI * 2);
  ctx.fill();

  info.textContent = `Done — ${path.length} frames tracked. Copy the fixture above.`;
});
