/**
 * The colony graphs (M6c; DESIGN.md section 8): the colony's history drawn
 * as small charts on plain canvases. Read only.
 */
import { Activity } from '../sim/ants';
import type { Census } from '../sim/history';
import { STEPS_PER_SECOND } from '../sim/time';

interface Series {
  label: string;
  color: string;
  values: number[];
}

const AXIS = '#5b6370';
const TEXT = '#9aa4b1';
const FONT = '12px system-ui, sans-serif';

/** A chart's canvas, sized to its box at the screen's pixel density. */
function prepare(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * devicePixelRatio);
  canvas.height = Math.round(h * devicePixelRatio);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  return { ctx, w, h };
}

/** A round number at or above `v`, for the top of an axis. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const PAD = { left: 40, right: 8, top: 22, bottom: 20 };

function frame(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, days: number, top: number, unit: string): void {
  ctx.fillStyle = TEXT;
  ctx.fillText(title, PAD.left, 14);
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, h - PAD.bottom);
  ctx.lineTo(w - PAD.right, h - PAD.bottom);
  ctx.stroke();
  ctx.textAlign = 'right';
  ctx.fillText(`${top}${unit}`, PAD.left - 4, PAD.top + 9);
  ctx.fillText('0', PAD.left - 4, h - PAD.bottom);
  ctx.fillText(`day ${days < 10 ? days.toFixed(1) : Math.round(days)}`, w - PAD.right, h - 5);
  ctx.textAlign = 'left';
}

/** Lines over tank days, with a legend along the top. */
function lines(canvas: HTMLCanvasElement, title: string, days: number[], series: Series[], unit = '', fixedTop?: number): void {
  const { ctx, w, h } = prepare(canvas);
  const end = days.at(-1) ?? 0;
  const top = fixedTop ?? niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  frame(ctx, w, h, title, end, top, unit);
  const x = (d: number) => PAD.left + ((w - PAD.left - PAD.right) * d) / Math.max(end, 1e-9);
  const y = (v: number) => h - PAD.bottom - ((h - PAD.top - PAD.bottom) * v) / top;
  let lx = PAD.left + ctx.measureText(title).width + 14;
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    s.values.forEach((v, n) => (n === 0 ? ctx.moveTo(x(days[n]!), y(v)) : ctx.lineTo(x(days[n]!), y(v))));
    ctx.stroke();
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, 6, 10, 10);
    ctx.fillStyle = TEXT;
    ctx.fillText(s.label, lx + 14, 15);
    lx += ctx.measureText(s.label).width + 22;
  }
}

/** Shares stacked to 100%, over tank days. */
function stacked(canvas: HTMLCanvasElement, title: string, days: number[], series: Series[]): void {
  const { ctx, w, h } = prepare(canvas);
  const end = days.at(-1) ?? 0;
  frame(ctx, w, h, title, end, 100, '%');
  const x = (d: number) => PAD.left + ((w - PAD.left - PAD.right) * d) / Math.max(end, 1e-9);
  const y = (f: number) => h - PAD.bottom - (h - PAD.top - PAD.bottom) * f;
  const totals = days.map((_, n) => series.reduce((sum, s) => sum + s.values[n]!, 0) || 1);
  const below = days.map(() => 0);
  let lx = PAD.left + ctx.measureText(title).width + 14;
  for (const s of series) {
    const above = below.map((b, n) => b + s.values[n]! / totals[n]!);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    days.forEach((d, n) => (n === 0 ? ctx.moveTo(x(d), y(above[n]!)) : ctx.lineTo(x(d), y(above[n]!))));
    for (let n = days.length - 1; n >= 0; n--) ctx.lineTo(x(days[n]!), y(below[n]!));
    ctx.closePath();
    ctx.fill();
    above.forEach((a, n) => (below[n] = a));
    ctx.fillRect(lx, 6, 10, 10);
    ctx.fillStyle = TEXT;
    ctx.fillText(s.label, lx + 14, 15);
    lx += ctx.measureText(s.label).width + 22;
  }
}

/**
 * Draws the colony graphs into the canvases of `box`:
 * population by stage, how full the workers are, what they are doing, and the nest.
 */
export function drawGraphs(box: HTMLElement, censuses: Census[], daySeconds: number, cropLoad: number): void {
  const canvases = [...box.querySelectorAll('canvas')];
  if (censuses.length < 2) {
    for (const c of canvases) {
      const { ctx } = prepare(c);
      ctx.fillStyle = TEXT;
      ctx.fillText('The graphs start after the first few minutes of ant time.', 10, 20);
    }
    return;
  }
  const days = censuses.map((c) => c.step / STEPS_PER_SECOND / daySeconds);
  const pick = (f: (c: Census) => number) => censuses.map(f);
  lines(canvases[0]!, 'Colony', days, [
    { label: 'workers', color: '#d8dde3', values: pick((c) => c.workers) },
    { label: 'eggs', color: '#f2e6b8', values: pick((c) => c.eggs) },
    { label: 'larvae', color: '#9fd0a0', values: pick((c) => c.larvae) },
    { label: 'pupae', color: '#d9a066', values: pick((c) => c.pupae) },
  ]);
  lines(
    canvases[1]!,
    'Workers',
    days,
    [
      { label: 'crop full', color: '#f0c05a', values: pick((c) => (c.workers > 0 ? (100 * c.crops) / (c.workers * cropLoad) : 0)) },
      { label: 'fat body', color: '#e58f6b', values: pick((c) => 100 * c.fat) },
    ],
    '%',
    100,
  );
  const act = (a: number) => pick((c) => c.activity?.[a] ?? 0);
  stacked(canvases[2]!, 'Workers doing', days, [
    { label: 'out', color: '#6d9bd1', values: act(Activity.out) },
    { label: 'dig', color: '#b5835a', values: act(Activity.digging) },
    { label: 'brood', color: '#9fd0a0', values: act(Activity.brood) },
    { label: 'share', color: '#f0c05a', values: act(Activity.sharing) },
    { label: 'dead', color: '#8a8f99', values: act(Activity.dead) },
    { label: 'about', color: '#59606b', values: act(Activity.about) },
    { label: 'rest', color: '#3a404a', values: act(Activity.resting) },
  ]);
  lines(canvases[3]!, 'Nest', days, [{ label: 'dug out, cm²', color: '#c9a27a', values: pick((c) => c.nest / 100) }]);
}
