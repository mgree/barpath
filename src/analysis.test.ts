import { describe, test, expect } from "vitest";
import { smooth, velocity } from "./analysis.js";

// Box-Muller: uniform -> Gaussian
function randn(): number {
  return Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
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
