import { test, expect } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createCanvas } from "canvas";
import cv from "./cv.js";
import { trackPoint, Frame } from "./tracker.js";
import { drawBackground, drawPaths } from "./annotate.js";

const TESTDATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../testdata");
const OUTPUT = path.join(TESTDATA, "output");

const verbose = !!process.env.VERBOSE;

const hasFFmpeg = (() => {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; }
  catch { return false; }
})();

function videoInfo(file: string, startTime: number, endTime?: number): { width: number; height: number; nbFrames: number } {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,nb_frames,duration",
    "-of", "csv=p=0",
    path.join(TESTDATA, file),
  ]).toString().trim();
  const [w, h, nbStr, durStr] = out.split(",");
  let [width, height] = [Number(w), Number(h)];
  const totalFrames = parseInt(nbStr);
  const duration = parseFloat(durStr);
  const fps = totalFrames / duration;
  const nbFrames = Math.round(((endTime ?? duration) - startTime) * fps);

  const rotOut = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream_side_data=rotation",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path.join(TESTDATA, file),
  ]).toString().trim();
  const rotate = ((parseInt(rotOut) || 0) + 360) % 360;
  if (rotate === 90 || rotate === 270) [width, height] = [height, width];

  return { width, height, nbFrames };
}

async function* decodeFrames(
  file: string,
  startTime: number,
  width: number,
  height: number,
  endTime?: number,
): AsyncGenerator<Frame> {
  const frameSize = width * height * 4;
  const proc = spawn("ffmpeg", [
    "-loglevel", "error",
    ...(startTime > 0 ? ["-ss", String(startTime)] : []),
    "-i", path.join(TESTDATA, file),
    ...(endTime !== undefined ? ["-t", String(endTime - startTime)] : []),
    "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
  ]);

  let buf = Buffer.alloc(0);
  for await (const chunk of proc.stdout) {
    buf = Buffer.concat([buf, chunk as Buffer]);
    while (buf.length >= frameSize) {
      yield { data: new Uint8ClampedArray(buf.subarray(0, frameSize)), width, height };
      buf = buf.subarray(frameSize);
    }
  }
}

export function videoTrackingTest(file: string, time: number, x: number, y: number, endTime?: number): void {
  test.skipIf(!hasFFmpeg)("tracks to end without loss and writes annotated PNG", async () => {
    const { width, height, nbFrames } = videoInfo(file, time, endTime);
    let pt = { x, y };
    let prev: Frame | null = null;
    let firstFrame: Frame | null = null;
    const positions: { x: number; y: number }[] = [pt];
    let frameCount = 0;
    let lastUpdateAt = Date.now();
    let lastUpdateFrame = 0;

    const label = `${file} from t=${time}`;
    let lostAt: number | null = null;
    for await (const frame of decodeFrames(file, time, width, height, endTime)) {
      if (firstFrame === null) firstFrame = frame;
      if (prev !== null && lostAt === null) {
        const next = trackPoint(cv, prev, frame, pt);
        if (next === null) { lostAt = frameCount; }
        else { pt = next; positions.push(pt); }
      }
      prev = frame;
      frameCount++;
      if (verbose && frameCount % 30 === 0) {
        const now = Date.now();
        const procFps = (frameCount - lastUpdateFrame) / ((now - lastUpdateAt) / 1000);
        lastUpdateAt = now;
        lastUpdateFrame = frameCount;
        const pct = Math.round(frameCount / nbFrames * 100);
        const eta = Math.round((nbFrames - frameCount) / procFps);
        process.stderr.write(`  ${label}: ${pct}% done (${frameCount}/${nbFrames}) @ ${procFps.toFixed(1)} fps, ~${eta}s remaining\n`);
      }
    }
    if (verbose) process.stderr.write(`  ${label}: done (${frameCount}/${nbFrames} frames)\n`);

    expect(frameCount).toBeGreaterThan(1);

    const canvas = createCanvas(width, height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = canvas.getContext("2d") as any;
    drawBackground(ctx, firstFrame!);
    drawPaths(ctx, positions, [{ startFrame: 0, endFrame: positions.length - 1 }], ["#ff0000"]);

    const stem = file.replace(/\.mp4$/, "");
    writeFileSync(path.join(OUTPUT, `${stem}.png`), canvas.toBuffer("image/png"));

    expect(lostAt, `tracking lost at frame ${lostAt} of ${frameCount}`).toBeNull();
  }, 240_000);
}
