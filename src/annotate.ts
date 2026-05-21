export type Rep = { startFrame: number; endFrame: number; velocity?: number };
export type Pause = { startFrame: number; endFrame: number; durationMs: number };

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawBackground(
  ctx: Ctx,
  frame: { data: Uint8ClampedArray; width: number; height: number }
): void {
  const imageData = ctx.createImageData(frame.width, frame.height);
  imageData.data.set(frame.data);
  ctx.putImageData(imageData, 0, 0);
}

export function drawPaths(
  ctx: Ctx,
  positions: { x: number; y: number }[],
  reps: Rep[],
  palette: string[]
): void {
  for (let r = 0; r < reps.length; r++) {
    const { startFrame, endFrame } = reps[r];
    ctx.beginPath();
    ctx.strokeStyle = palette[r % palette.length];
    ctx.lineWidth = 4;
    for (let i = startFrame; i <= endFrame; i++) {
      const p = positions[i];
      if (!p) continue;
      if (i === startFrame) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

export function drawPauseMarkers(
  ctx: Ctx,
  positions: { x: number; y: number }[],
  pauses: Pause[]
): void {
  for (const pause of pauses) {
    const p = positions[Math.round((pause.startFrame + pause.endFrame) / 2)];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "white";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${(pause.durationMs / 1000).toFixed(1)}s`, p.x + 8, p.y + 4);
  }
}

export function annotate(
  ctx: Ctx,
  frame: { data: Uint8ClampedArray; width: number; height: number },
  positions: { x: number; y: number }[],
  reps: Rep[],
  pauses: Pause[],
  palette: string[]
): void {
  drawBackground(ctx, frame);
  drawPaths(ctx, positions, reps, palette);
  drawPauseMarkers(ctx, positions, pauses);
}
