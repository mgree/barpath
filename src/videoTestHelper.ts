import { test, expect } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import cv from "./cv.js";
import { trackPoint, Frame } from "./tracker.js";

const TESTDATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../testdata");

const verbose = !!process.env.VERBOSE;

const hasFFmpeg = (() => {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; }
  catch { return false; }
})();

const TRANSPOSE: Record<number, string> = {
  90:  "transpose=1",
  180: "vflip,hflip",
  270: "transpose=2",
};

function videoInfo(file: string): { width: number; height: number; rotateFilter: string; nbFrames: number } {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,nb_frames",
    "-of", "csv=p=0",
    path.join(TESTDATA, file),
  ]).toString().trim();
  const [w, h, nbStr] = out.split(",");
  let [width, height] = [Number(w), Number(h)];
  const nbFrames = parseInt(nbStr);

  const rotOut = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream_side_data=rotation",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path.join(TESTDATA, file),
  ]).toString().trim();
  const rotate = ((parseInt(rotOut) || 0) + 360) % 360;

  const rotateFilter = TRANSPOSE[rotate] ?? "";
  if (rotate === 90 || rotate === 270) [width, height] = [height, width];

  return { width, height, rotateFilter, nbFrames };
}

async function* decodeFrames(
  file: string,
  startTime: number,
  width: number,
  height: number,
  rotateFilter: string,
): AsyncGenerator<Frame> {
  const frameSize = width * height * 4;
  const proc = spawn("ffmpeg", [
    "-loglevel", "error",
    ...(startTime > 0 ? ["-ss", String(startTime)] : []),
    "-i", path.join(TESTDATA, file),
    ...(rotateFilter ? ["-vf", rotateFilter] : []),
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

export interface Fixture {
  file: string;
  time: number;
  x: number;
  y: number;
}

export function videoTrackingTest(fix: Fixture): void {
  test.skipIf(!hasFFmpeg)("tracks to end without loss", async () => {
    const { width, height, rotateFilter, nbFrames } = videoInfo(fix.file);
    let pt = { x: fix.x, y: fix.y };
    let prev: Frame | null = null;
    let frameCount = 0;
    let lastUpdateAt = Date.now();
    let lastUpdateFrame = 0;

    const label = `${fix.file} from t=${fix.time}`;
    for await (const frame of decodeFrames(fix.file, fix.time, width, height, rotateFilter)) {
      if (prev !== null) {
        const next = trackPoint(cv, prev, frame, pt);
        expect(next, `tracking lost at frame ${frameCount}`).not.toBeNull();
        pt = next!;
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
  }, 240_000);
}
