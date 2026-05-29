import { describe, test, expect } from "vitest";
import { createCanvas } from "canvas";
import { drawBackground, drawPaths, drawPauseMarkers, annotate } from "../src/annotate.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCtx(w = 100, h = 100): any {
  return createCanvas(w, h).getContext("2d");
}

function pixel(ctx: ReturnType<typeof makeCtx>, x: number, y: number) {
  return Array.from(ctx.getImageData(x, y, 1, 1).data) as [number, number, number, number];
}

function redFrame(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
  return { data, width: w, height: h };
}

describe("drawBackground", () => {
  test("fills canvas with frame pixels", () => {
    const ctx = makeCtx();
    drawBackground(ctx, redFrame(100, 100));
    expect(pixel(ctx, 50, 50)).toEqual([255, 0, 0, 255]);
  });
});

describe("drawPaths", () => {
  test("draws a colored stroke along rep positions", () => {
    const ctx = makeCtx();
    const positions = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 50 }));
    drawPaths(ctx, positions, [{ startFrame: 0, endFrame: 9 }], ["#ff0000"]);
    const [r, , , a] = pixel(ctx, 50, 50);
    expect(r).toBe(255);
    expect(a).toBe(255);
  });

  test("uses palette colors per rep", () => {
    const ctx = makeCtx(200, 100);
    const positions = [
      ...Array.from({ length: 5 }, (_, i) => ({ x: i * 10, y: 25 })),
      ...Array.from({ length: 5 }, (_, i) => ({ x: i * 10, y: 75 })),
    ];
    drawPaths(ctx, positions,
      [{ startFrame: 0, endFrame: 4 }, { startFrame: 5, endFrame: 9 }],
      ["#ff0000", "#0000ff"]
    );
    expect(pixel(ctx, 20, 25)[0]).toBe(255); // red rep: red channel
    expect(pixel(ctx, 20, 75)[2]).toBe(255); // blue rep: blue channel
  });
});

describe("drawPauseMarkers", () => {
  test("does not throw with valid pauses", () => {
    const ctx = makeCtx();
    const positions = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 50 }));
    expect(() => drawPauseMarkers(ctx, positions, [{ startFrame: 2, endFrame: 6, durationMs: 1200 }])).not.toThrow();
  });

  test("draws something at the pause midpoint", () => {
    const ctx = makeCtx();
    const positions = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 50 }));
    drawPauseMarkers(ctx, positions, [{ startFrame: 2, endFrame: 6, durationMs: 1200 }]);
    const [, , , a] = pixel(ctx, 40, 50); // midpoint x=40, y=50
    expect(a).toBeGreaterThan(0);
  });
});

describe("annotate", () => {
  test("does not throw with well-formed inputs", () => {
    const ctx = makeCtx();
    const positions = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 50 }));
    expect(() => annotate(
      ctx,
      redFrame(100, 100),
      positions,
      [{ startFrame: 0, endFrame: 9 }],
      [{ startFrame: 3, endFrame: 6, durationMs: 800 }],
      ["#00ff00"]
    )).not.toThrow();
  });
});
