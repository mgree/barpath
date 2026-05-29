import type { Rep, Pause } from "./annotate.js";

export function velocity(positions: { x: number; y: number }[]): { vx: number; vy: number }[] {
  const n = positions.length;
  if (n === 0) return [];
  if (n === 1) return [{ vx: 0, vy: 0 }];
  return positions.map((_, i) => {
    const lo = i === 0 ? 0 : i - 1;
    const hi = i === n - 1 ? n - 1 : i + 1;
    const d = hi - lo;
    return {
      vx: (positions[hi].x - positions[lo].x) / d,
      vy: (positions[hi].y - positions[lo].y) / d,
    };
  });
}

// ---- Rep / pause detection ----

type Extremum = { frame: number; kind: "peak" | "valley" };

function maxRange(ys: number[], lo: number, hi: number): number {
  let m = ys[lo];
  for (let i = lo + 1; i <= hi; i++) if (ys[i] > m) m = ys[i];
  return m;
}

function minRange(ys: number[], lo: number, hi: number): number {
  let m = ys[lo];
  for (let i = lo + 1; i <= hi; i++) if (ys[i] < m) m = ys[i];
  return m;
}

function localExtrema(ys: number[]): Extremum[] {
  const n = ys.length;
  if (n < 2) return [];
  const raw: Extremum[] = [];

  if (ys[0] > ys[1]) raw.push({ frame: 0, kind: "peak" });
  else if (ys[0] < ys[1]) raw.push({ frame: 0, kind: "valley" });

  for (let i = 1; i < n - 1; i++) {
    if (ys[i] > ys[i - 1] && ys[i] > ys[i + 1]) raw.push({ frame: i, kind: "peak" });
    else if (ys[i] < ys[i - 1] && ys[i] < ys[i + 1]) raw.push({ frame: i, kind: "valley" });
  }

  if (ys[n - 1] > ys[n - 2]) raw.push({ frame: n - 1, kind: "peak" });
  else if (ys[n - 1] < ys[n - 2]) raw.push({ frame: n - 1, kind: "valley" });

  // Enforce alternating: consecutive same-kind → keep the more extreme one
  const result: Extremum[] = [];
  for (const e of raw) {
    const last = result[result.length - 1];
    if (!last || last.kind !== e.kind) {
      result.push(e);
    } else if (
      (e.kind === "peak"   && ys[e.frame] > ys[last.frame]) ||
      (e.kind === "valley" && ys[e.frame] < ys[last.frame])
    ) {
      result[result.length - 1] = e;
    }
  }
  return result;
}

function extremumProminence(e: Extremum, ys: number[]): number {
  const i = e.frame;
  const n = ys.length;
  if (e.kind === "valley") {
    // Endpoint: only one side exists; treat the missing side as Infinity so it doesn't constrain.
    const lm = i === 0     ? Infinity : maxRange(ys, 0, i);
    const rm = i === n - 1 ? Infinity : maxRange(ys, i, n - 1);
    return Math.min(lm, rm) - ys[i];
  } else {
    const lm = i === 0     ? -Infinity : minRange(ys, 0, i);
    const rm = i === n - 1 ? -Infinity : minRange(ys, i, n - 1);
    return ys[i] - Math.max(lm, rm);
  }
}

function meanConcentricVelocity(vel: { vx: number; vy: number }[], rep: Rep): number {
  let sum = 0, count = 0;
  for (let i = rep.startFrame; i <= rep.endFrame && i < vel.length; i++) {
    if (vel[i].vy < 0) { sum += -vel[i].vy; count++; }
  }
  return count > 0 ? sum / count : 0;
}

export { maxRange, minRange };

export function detectReps(
  ys: number[],
  fps: number,
  opts?: { minProminenceFraction?: number; minDurationSec?: number; minRepDepthFraction?: number }
): Rep[] {
  const minProminenceFraction = opts?.minProminenceFraction ?? 0.10;
  const minDurationFrames     = Math.round((opts?.minDurationSec ?? 0.5) * fps);
  const minRepDepthFraction   = opts?.minRepDepthFraction ?? 0.5;

  const n = ys.length;
  if (n < 3) return [];

  const yMax = maxRange(ys, 0, n - 1);
  const yMin = minRange(ys, 0, n - 1);
  const range = yMax - yMin;
  if (range === 0) return [];

  const minProm = minProminenceFraction * range;
  const extrema = localExtrema(ys).filter(e => extremumProminence(e, ys) >= minProm);
  if (extrema.length < 2) return [];

  const nPeaks   = extrema.filter(e => e.kind === "peak").length;
  const nValleys = extrema.filter(e => e.kind === "valley").length;
  const boundaryKind = nPeaks !== nValleys
    ? (nPeaks > nValleys ? "peak" : "valley")
    : extrema[0].kind;

  // Merge boundary extrema that are closer than minDurationFrames, keeping the more extreme.
  const merged: Extremum[] = [];
  for (const b of extrema.filter(e => e.kind === boundaryKind)) {
    const last = merged[merged.length - 1];
    if (last && b.frame - last.frame < minDurationFrames) {
      if ((boundaryKind === "valley" && ys[b.frame] < ys[last.frame]) ||
          (boundaryKind === "peak"   && ys[b.frame] > ys[last.frame]))
        merged[merged.length - 1] = b;
    } else {
      merged.push(b);
    }
  }

  // Form candidate rep intervals and apply adaptive inner-range filter.
  const vel = velocity(ys.map(y => ({ x: 0, y })));
  const candidates = Array.from({ length: merged.length - 1 }, (_, i) => ({
    startFrame: merged[i].frame, endFrame: merged[i + 1].frame,
  }));
  const innerRanges = candidates.map(c =>
    maxRange(ys, c.startFrame, c.endFrame) - minRange(ys, c.startFrame, c.endFrame));
  const maxInner = Math.max(...innerRanges, 0);
  const minInner = minRepDepthFraction * maxInner;

  return candidates
    .filter((_, i) => innerRanges[i] >= minInner)
    .map(c => ({ ...c, velocity: meanConcentricVelocity(vel, c) }));
}

export function detectPauses(
  smoothed: { x: number; y: number }[],
  reps: Rep[],
  fps: number,
  opts?: { velocityThresholdFraction?: number; minDurationSec?: number }
): Pause[] {
  const velocityThresholdFraction = opts?.velocityThresholdFraction ?? 0.05;
  const minDurationFrames = Math.round((opts?.minDurationSec ?? 0.2) * fps);

  const vel = velocity(smoothed);
  const maxSpeed = vel.reduce((m, v) => Math.max(m, Math.abs(v.vy)), 0);
  if (maxSpeed === 0) return [];
  const threshold = velocityThresholdFraction * maxSpeed;

  const pauses: Pause[] = [];
  let segStart = -1;

  for (let i = 0; i <= smoothed.length; i++) {
    const slow = i < smoothed.length && Math.abs(vel[i].vy) < threshold;
    if (slow && segStart === -1) {
      segStart = i;
    } else if (!slow && segStart !== -1) {
      const segEnd = i - 1;
      if (segEnd - segStart + 1 >= minDurationFrames) {
        const withinRep = reps.some(r => segStart <= r.endFrame && segEnd >= r.startFrame);
        if (withinRep) {
          pauses.push({ startFrame: segStart, endFrame: segEnd,
            durationMs: (segEnd - segStart + 1) / fps * 1000 });
        }
      }
      segStart = -1;
    }
  }

  return pauses;
}

// ---- Smoothing ----

// Centered moving average; window shrinks at edges rather than padding.
export function smooth(positions: { x: number; y: number }[], window: number = 5): { x: number; y: number }[] {
  const half = Math.floor(window / 2);
  return positions.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(positions.length - 1, i + half);
    let sx = 0, sy = 0;
    for (let j = lo; j <= hi; j++) { sx += positions[j].x; sy += positions[j].y; }
    const n = hi - lo + 1;
    return { x: sx / n, y: sy / n };
  });
}
