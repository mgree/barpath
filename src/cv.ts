import { createRequire } from "module";

const cv = createRequire(import.meta.url)("../vendor/opencv.cjs");

await new Promise<void>((resolve) => {
  if (cv.Mat) resolve();
  else cv.onRuntimeInitialized = resolve;
});

export default cv;
