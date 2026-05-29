import { test, expect } from "vitest";
import cv from "../src/cv.js";

test("opencv loads and can allocate a Mat", () => {
  const m = new cv.Mat(4, 4, cv.CV_8UC1);
  expect(m.rows).toBe(4);
  expect(m.cols).toBe(4);
  m.delete();
});
