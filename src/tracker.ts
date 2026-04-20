// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function trackPoint(
  cv: CV,
  prevGray: Frame,
  nextGray: Frame,
  pt: { x: number; y: number }
): { x: number; y: number } | null {
  const prev = cv.matFromImageData(prevGray);
  const next = cv.matFromImageData(nextGray);
  const prevG = new cv.Mat();
  const nextG = new cv.Mat();
  cv.cvtColor(prev, prevG, cv.COLOR_RGBA2GRAY);
  cv.cvtColor(next, nextG, cv.COLOR_RGBA2GRAY);

  const prevPts = cv.matFromArray(1, 1, cv.CV_32FC2, [pt.x, pt.y]);
  const nextPts = new cv.Mat();
  const status = new cv.Mat();
  const err = new cv.Mat();

  cv.calcOpticalFlowPyrLK(prevG, nextG, prevPts, nextPts, status, err);

  let result: { x: number; y: number } | null = null;
  if (status.data[0] === 1) {
    result = { x: nextPts.data32F[0], y: nextPts.data32F[1] };
  }

  prev.delete(); next.delete(); prevG.delete(); nextG.delete();
  prevPts.delete(); nextPts.delete(); status.delete(); err.delete();
  return result;
}
