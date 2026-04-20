import { test, expect } from "vitest";
import cv from "./cv.js";
import { trackPoint, Frame } from "./tracker.js";

const WIDTH = 200;
const HEIGHT = 200;
const DOT_RADIUS = 8;
const FRAMES = 30;

function makeFrame(cx: number, cy: number): Frame {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(255);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= DOT_RADIUS ** 2) {
        const i = (y * WIDTH + x) * 4;
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; // black dot, alpha stays 255
      }
    }
  }
  return { data, width: WIDTH, height: HEIGHT };
}

// Dot travels from near top to near bottom and back (triangle wave).
function groundTruth(): { x: number; y: number }[] {
  const yMin = DOT_RADIUS + 5;
  const yMax = HEIGHT - DOT_RADIUS - 5;
  const x = WIDTH / 2;
  return Array.from({ length: FRAMES }, (_, i) => {
    const t = i / (FRAMES - 1);
    const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
    return { x, y: yMin + tri * (yMax - yMin) };
  });
}

test("tracks a dot moving down then up", () => {
  const positions = groundTruth();
  const frames = positions.map(({ x, y }) => makeFrame(x, y));

  const tracked: { x: number; y: number }[] = [positions[0]];
  let pt = positions[0];

  for (let i = 1; i < FRAMES; i++) {
    const next = trackPoint(cv, frames[i - 1], frames[i], pt);
    expect(next, `tracking lost at frame ${i}`).not.toBeNull();
    pt = next!;
    tracked.push(pt);
  }

  const maxErr = tracked.reduce((max, p, i) => {
    const err = Math.hypot(p.x - positions[i].x, p.y - positions[i].y);
    return Math.max(max, err);
  }, 0);

  console.log(`max tracking error: ${maxErr.toFixed(3)}px`);
  expect(maxErr).toBeLessThan(1);
});
