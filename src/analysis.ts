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
