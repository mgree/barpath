import { test, expect } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { createCanvas } from "canvas";
import cv from "../src/cv.js";
import { trackPoint, Frame } from "../src/tracker.js";
import { drawBackground, drawPaths } from "../src/annotate.js";
import { smooth, detectReps } from "../src/analysis.js";

const TESTDATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "./data");
const OUTPUT = path.join(TESTDATA, "output");

const verbose = !!process.env.VERBOSE;

const hasFFmpeg = (() => {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; }
  catch { return false; }
})();

const ManifestEntrySchema = z.object({
  meta: z.string().optional(),
  start_time: z.number().optional(),
  seed_x: z.number(),
  seed_y: z.number(),
  end_time: z.number().optional(),
  expect: z.object({
    reps: z.number().nullable().optional(),
    // pauses: z.array(z.object({ rep: z.number(), min_sec: z.number(), max_sec: z.number() })).optional(),
    // velocity: z.object({ min: z.number(), max: z.number() }).optional(),
  }).optional(),
});

const ManifestSchema = z.record(ManifestEntrySchema);

type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

function videoInfo(
  file: string,
  startTime: number,
  endTime?: number,
): { width: number; height: number; nbFrames: number; fps: number } {
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

  return { width, height, nbFrames, fps };
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

async function runVideoTest(file: string, entry: ManifestEntry): Promise<void> {
  const startTime = entry.start_time ?? 0;
  const { width, height, nbFrames, fps } = videoInfo(file, startTime, entry.end_time);
  let pt = { x: entry.seed_x, y: entry.seed_y };
  let prev: Frame | null = null;
  let firstFrame: Frame | null = null;
  const positions: { x: number; y: number }[] = [pt];
  let frameCount = 0;
  let lastUpdateAt = Date.now();
  let lastUpdateFrame = 0;

  const label = `${file} from t=${startTime}`;
  let lostAt: number | null = null;
  for await (const frame of decodeFrames(file, startTime, width, height, entry.end_time)) {
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

  if (entry.expect?.reps != null) {
    const smoothed = smooth(positions);
    const reps = detectReps(smoothed.map(p => p.y), fps);
    expect(reps.length, `expected ${entry.expect.reps} reps`).toBe(entry.expect.reps);
  }
}

const manifestResult = ManifestSchema.safeParse(
  parse(readFileSync(path.join(TESTDATA, "manifest.yml"), "utf-8")) ?? {}
);

test("manifest.yml matches schema", () => {
  if (manifestResult.error) throw manifestResult.error;
  expect(manifestResult.data).toBeDefined();
});

const manifest = manifestResult.data ?? {};
const videos = readdirSync(TESTDATA).filter(f => f.endsWith(".mp4"));

test("manifest has no entries without a corresponding video", () => {
  const videoSet = new Set(videos);
  const orphans = Object.keys(manifest).filter(k => !videoSet.has(k));
  expect(orphans).toEqual([]);
});

function registerTests() {
  if (!hasFFmpeg) {
    console.warn("ffmpeg not available; skipping video tracking tests");
    return;
  }

  for (const video of videos) {
    const entry = manifest[video];
    const label = entry?.meta ? `${video}: ${entry.meta}` : video;

    if (!entry) {
      test(label, () => { throw new Error(`${video} has no manifest entry`); });
      continue;
    }

    test.concurrent(label, async () => runVideoTest(video, entry), 240_000);
  }
}

registerTests();
