import { describe, test, expect } from "vitest";
import { smooth, velocity, detectReps, detectPauses } from "./analysis.js";
import type { Rep } from "./annotate.js";

// Box-Muller: uniform -> Gaussian
function randn(): number {
  const u = 1 - Math.random(); // (0, 1]
  const v = Math.random(); // [0, 1)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mse(pts: { x: number; y: number }[], truth: { x: number; y: number }[]): number {
  return pts.reduce((s, p, i) => s + (p.x - truth[i].x) ** 2 + (p.y - truth[i].y) ** 2, 0) / pts.length;
}

function msev(vels: { vx: number; vy: number }[], truth: { vx: number; vy: number }[]): number {
  return vels.reduce((s, v, i) => s + (v.vx - truth[i].vx) ** 2 + (v.vy - truth[i].vy) ** 2, 0) / vels.length;
}

describe("smooth", () => {
  test("reduces MSE against ground truth when noise is added", { repeats: 1000 }, () => {
    const N = 100;
    const noise = 3;

    // Ground truth: diagonal line
    const truth = Array.from({ length: N }, (_, i) => ({ x: i * 0.5, y: i * 1.2 }));
    const noisy = truth.map(p => ({ x: p.x + randn() * noise, y: p.y + randn() * noise }));

    const smoothed = smooth(noisy, 7);

    expect(mse(smoothed, truth)).toBeLessThan(mse(noisy, truth));
  });
});

describe("detectReps", () => {
  // Signal: y[i] = A*cos(2π*i/T), N = numReps*T+1 frames.
  // T=20 chosen so the cosine drops ~2.4px per frame near the peak, making endpoint peaks
  // reliably detectable even with σ=2 noise after window-7 smoothing.
  // Endpoint peaks at 0 and numReps*T, interior peaks at T,2T,...,(numReps-1)*T.
  // Total peaks = numReps+1, valleys = numReps → boundary kind = peak → numReps reps.
  const A = 50, T = 20, numReps = 4, fps = 30;
  const N = numReps * T + 1;

  test("recovers rep count and boundaries from noisy cosine signal", { repeats: 100 }, () => {
    const ys = Array.from({ length: N }, (_, i) =>
      A * Math.cos(2 * Math.PI * i / T) + randn() * 2
    );
    const smoothedYs = smooth(ys.map(y => ({ x: 0, y })), 7).map(p => p.y);
    const reps = detectReps(smoothedYs, fps);

    expect(reps.length).toBe(numReps);
    for (let k = 0; k < numReps; k++) {
      expect(Math.abs(reps[k].startFrame - k * T)).toBeLessThan(4);
      expect(Math.abs(reps[k].endFrame - (k + 1) * T)).toBeLessThan(4);
    }
  });

  test("mean concentric velocity is close to theoretical value", { repeats: 100 }, () => {
    // True mean |vy| during concentric (vy < 0): A*(2π/T)*(2/π) = 4A/T = 10 px/frame.
    // Window-7 smoothing damps amplitude by ~0.82 at T=20, so expected ~8.2 px/frame.
    const trueVelocity = 4 * A / T;
    const ys = Array.from({ length: N }, (_, i) =>
      A * Math.cos(2 * Math.PI * i / T) + randn() * 2
    );
    const smoothedYs = smooth(ys.map(y => ({ x: 0, y })), 7).map(p => p.y);
    const reps = detectReps(smoothedYs, fps);

    expect(reps.length).toBeGreaterThan(0);
    for (const rep of reps) {
      expect(rep.velocity).toBeDefined();
      expect(rep.velocity!).toBeGreaterThan(trueVelocity * 0.5);
      expect(rep.velocity!).toBeLessThan(trueVelocity * 1.5);
    }
  });
});

describe("detectPauses", () => {
  test("detects a within-rep pause at lockout", () => {
    // Signal: linear descent (A → -A over T/2 frames), flat pause at -A for P frames,
    // linear ascent (-A → A over T/2 frames). One rep spans the whole signal.
    const A = 50, T = 60, P = 30, fps = 30;
    const N = T + P;
    const positions = Array.from({ length: N }, (_, i) => {
      let y: number;
      if (i < T / 2) {
        y = A - (2 * A / (T / 2)) * i;              // A → -A
      } else if (i < T / 2 + P) {
        y = -A;                                       // pause at lockout
      } else {
        y = -A + (2 * A / (T / 2)) * (i - T / 2 - P); // -A → A
      }
      return { x: 0, y };
    });
    const smoothed = smooth(positions, 3);
    const reps: Rep[] = [{ startFrame: 0, endFrame: N - 1 }];
    const pauses = detectPauses(smoothed, reps, fps, { minDurationSec: 0.5 });

    expect(pauses.length).toBe(1);
    const detectedFrames = pauses[0].durationMs / 1000 * fps;
    expect(detectedFrames).toBeGreaterThan(P * 0.7);
    expect(detectedFrames).toBeLessThan(P * 1.3);
  });

  test("does not return pauses that fall entirely between reps", () => {
    // Linear ramps (fast-moving) with a flat rest segment in between.
    // Rep boundaries are in the middle of the fast-moving phases, clearly separated
    // from the flat segment so smoothed velocity at the boundaries stays above threshold.
    const fps = 30;
    const rampLen = 30, pauseLen = 30;
    const N = rampLen + pauseLen + rampLen;
    const positions = Array.from({ length: N }, (_, i) => {
      let y: number;
      if (i < rampLen)                    y = -50 + (100 / rampLen) * i;       // fast ramp up
      else if (i < rampLen + pauseLen)    y = 50;                               // flat rest
      else                                y = 50 - (100 / rampLen) * (i - rampLen - pauseLen); // fast ramp down
      return { x: 0, y };
    });
    const smoothed = smooth(positions, 3);
    // Reps cover only the fast-moving portions — the flat segment [30..59] is outside both.
    const reps: Rep[] = [
      { startFrame: 0,               endFrame: rampLen - 1 },
      { startFrame: rampLen + pauseLen, endFrame: N - 1 },
    ];
    const pauses = detectPauses(smoothed, reps, fps, { minDurationSec: 0.5 });
    expect(pauses.length).toBe(0);
  });
});

describe("velocity", () => {
  test("smooth-then-differentiate recovers velocity better than differentiating noisy signal", { repeats: 1000 }, () => {
    const N = 100;
    const A = 50, T = 40; // amplitude, period in frames
    const noise = 3;

    // True positions and velocities for y = A*sin(2π*i/T), x constant
    const truth = Array.from({ length: N }, (_, i) => ({ x: 0, y: A * Math.sin(2 * Math.PI * i / T) }));
    const trueVel = Array.from({ length: N }, (_, i) => ({ vx: 0, vy: A * (2 * Math.PI / T) * Math.cos(2 * Math.PI * i / T) }));

    const noisy = truth.map(p => ({ x: p.x + randn() * noise, y: p.y + randn() * noise }));

    const noisyVel = velocity(noisy);
    const smoothedVel = velocity(smooth(noisy, 7));

    expect(msev(smoothedVel, trueVel)).toBeLessThan(msev(noisyVel, trueVel));
  });
});
