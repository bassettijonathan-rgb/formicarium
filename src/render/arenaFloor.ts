/**
 * The arena's floor as a picture (DESIGN.md A4): fine sand, with the flat
 * decorations (dry leaves, twigs, moss) lying on it and the shadows of the
 * stones, bark and water tube. Painted once per tank on a canvas in floor mm,
 * then laid on the floor in perspective.
 */
import type { Decoration } from '../sim/decor';

/** Canvas pixels per arena mm. */
export const FLOOR_PX_PER_MM = 3;

/** A repeatable pseudo-random number in [0, 1) for an integer: the sand's grain. Drawing only. */
function grain(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function paintFloor(canvas: HTMLCanvasElement, width: number, height: number, decor: Decoration[]): void {
  const px = FLOOR_PX_PER_MM;
  canvas.width = width * px;
  canvas.height = height * px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Fine pale sand, each pixel a little lighter or darker, a few grains darker still (but never dark enough to pass for an ant).
  const image = ctx.createImageData(canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    const n = grain(i);
    const dark = n > 0.96 ? 0.9 : 1;
    const v = (0.93 + 0.1 * grain(i + 7919)) * dark;
    d[4 * i] = 214 * v;
    d[4 * i + 1] = 198 * v;
    d[4 * i + 2] = 166 * v;
    d[4 * i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  ctx.scale(px, px);

  // Soft shadows, cast toward the front by the light from the window behind and above.
  for (const o of decor) {
    if (o.kind === 'stone') shadow(ctx, o.x, o.y + o.height * 0.5, o.radius * 1.15, o.radius * 0.95);
    else if (o.kind === 'bark') {
      ctx.save();
      ctx.translate(o.x, o.y + o.height * 0.5);
      ctx.rotate(o.angle);
      shadow(ctx, 0, 0, o.length * 1.08, o.width * 0.75);
      ctx.restore();
    } else if (o.kind === 'tube') {
      for (let x = o.x0; x <= o.x1; x += o.radius) shadow(ctx, x, o.y + o.radius * 1.2, o.radius * 1.6, o.radius * 1.2, 0.18);
    }
  }
  for (const o of decor) {
    if (o.kind === 'moss') moss(ctx, o.x, o.y, o.radius);
  }
  for (const o of decor) {
    if (o.kind === 'twig') twig(ctx, o.x0, o.y0, o.x1, o.y1, o.width, o.fork);
  }
  for (const o of decor) {
    if (o.kind === 'leaf') leaf(ctx, o.x, o.y, o.length, o.width, o.angle, o.shade);
  }
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.32): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(40,28,15,${alpha})`);
  g.addColorStop(0.6, `rgba(40,28,15,${alpha * 0.6})`);
  g.addColorStop(1, 'rgba(40,28,15,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

/** A cushion of moss: hundreds of tiny tufts, darker underneath and brighter toward the top. */
function moss(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  const seed = Math.round(x * 131 + y * 71);
  shadow(ctx, x, y + 2, radius * 1.05, radius * 0.95, 0.25);
  const n = Math.round(radius * radius * 2.2);
  for (let k = 0; k < n; k++) {
    const a = 2 * Math.PI * grain(seed + 4 * k);
    // The edge is ragged: some tufts reach a little past the cushion.
    const r = radius * Math.sqrt(grain(seed + 4 * k + 1)) * (0.85 + 0.25 * grain(seed + 4 * k + 3));
    const t = grain(seed + 4 * k + 2);
    // Later tufts lie on top, so they are drawn brighter: the cushion looks lit from above.
    const light = 0.45 + 0.4 * (k / n) + 0.25 * t;
    const yellow = 1 + 0.25 * grain(seed + 4 * k + 3);
    ctx.fillStyle = `rgb(${Math.round(78 * light * yellow)},${Math.round(122 * light)},${Math.round(40 * light)})`;
    ctx.beginPath();
    ctx.arc(x + r * Math.cos(a), y + r * Math.sin(a), 0.45 + 0.7 * t, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/** A thin dry twig with one side shoot. */
function twig(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, fork: number): void {
  const fx = x0 + (x1 - x0) * fork;
  const fy = y0 + (y1 - y0) * fork;
  const a = Math.atan2(y1 - y0, x1 - x0) + 0.55;
  const len = Math.hypot(x1 - x0, y1 - y0) * 0.3;
  const bx = fx + Math.cos(a) * len;
  const by = fy + Math.sin(a) * len;
  ctx.lineCap = 'round';
  const stroke = (w: number, colour: string, dy: number) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + dy);
    ctx.lineTo(x1, y1 + dy);
    ctx.moveTo(fx, fy + dy);
    ctx.lineTo(bx, by + dy);
    ctx.stroke();
  };
  stroke(width * 1.3, 'rgba(40,28,15,0.25)', width * 0.8);
  stroke(width, '#5a4330', 0);
  stroke(width * 0.35, 'rgba(160,130,95,0.6)', -width * 0.2);
}

/** A dry leaf: a pointed oval in ochre to brown, with its midrib and veins. */
function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, width: number, angle: number, shade: number): void {
  const l = length / 2;
  const w = width / 2;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(-l, 0);
    ctx.quadraticCurveTo(-l * 0.1, -w * 1.9, l, 0);
    ctx.quadraticCurveTo(-l * 0.1, w * 1.9, -l, 0);
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.save();
  ctx.translate(0.8, 1.6);
  outline();
  ctx.fillStyle = 'rgba(40,28,15,0.22)';
  ctx.fill();
  ctx.restore();
  const r = Math.round(165 - 70 * shade);
  const g = Math.round(112 - 45 * shade);
  const b = Math.round(55 - 25 * shade);
  outline();
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${r * 0.6},${g * 0.6},${b * 0.6},0.8)`;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // The stalk, the midrib and pairs of veins.
  ctx.beginPath();
  ctx.moveTo(-l - 4, 0.4);
  ctx.lineTo(l * 0.95, 0);
  for (let k = 1; k <= 5; k++) {
    const vx = -l + (2 * l * k) / 6.5;
    const reach = w * 0.8 * Math.sin((Math.PI * k) / 6.5);
    ctx.moveTo(vx, 0);
    ctx.lineTo(vx + reach * 0.7, -reach);
    ctx.moveTo(vx, 0);
    ctx.lineTo(vx + reach * 0.7, reach);
  }
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.restore();
}
