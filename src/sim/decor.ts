/**
 * Decorations in the keeper's arena (DESIGN.md section 3.3, A4, A5): stones,
 * a piece of cork bark and a water tube that stand up from the floor, and dry
 * leaves, twigs and moss lying flat. Each new tank lays them out from its seed.
 *
 * The ones that stand up are written into the arena's `relief`, the height of
 * the surface above each mm of floor, so the ants climb over them (A5). The
 * shapes are kept too, as plain data, so the page can draw them; `reliefOf`
 * is the same shape the page draws, so an ant on a stone is drawn on it.
 */
import type { Arena } from './arena';
import { Purpose, Rng } from './rng';

export type Decoration =
  /** A rounded stone: an irregular outline (radius times `outline[k]` at angle 2πk/n) and a height, mm. */
  | { kind: 'stone'; x: number; y: number; radius: number; height: number; outline: number[] }
  /** A curved piece of cork bark lying on the floor: an ellipse `length` x `width` turned by `angle`. */
  | { kind: 'bark'; x: number; y: number; length: number; width: number; height: number; angle: number }
  /** A water tube with a cotton plug, lying along the floor from (x0, y) to (x1, y). */
  | { kind: 'tube'; x0: number; x1: number; y: number; radius: number }
  /** A dry leaf, flat. */
  | { kind: 'leaf'; x: number; y: number; length: number; width: number; angle: number; shade: number }
  /** A twig lying on the floor, from one end to the other, with a side shoot at `fork` of its length. */
  | { kind: 'twig'; x0: number; y0: number; x1: number; y1: number; width: number; fork: number }
  /** A cushion of moss, flat enough to walk over. */
  | { kind: 'moss'; x: number; y: number; radius: number }
  /** The keeper's feeding dish (B4): a shallow plastic dish, its floor `base` mm thick and its rim `rim` mm high. */
  | { kind: 'dish'; x: number; y: number; radius: number; rim: number; base: number }
  /**
   * The keeper's liquid feeder (B5): a test tube of sugar water lying on the
   * floor from (x0, y) to (x1, y), its cotton plug at x0, holding `capacity`
   * µL when full. The sugar water itself is a food drop at the plug.
   */
  | { kind: 'feeder'; x0: number; x1: number; y: number; radius: number; capacity: number }
  /** A round branch lying on the floor (B3), from one end to the other, thick enough to climb along. */
  | { kind: 'branch'; x0: number; y0: number; x1: number; y1: number; radius: number };

/** Places a new tank's first food goes and the ants come in: decorations keep clear of them. */
export interface KeepClear {
  x: number;
  y: number;
  radius: number;
}

/** Ants need room to pass between obstacles and round the arena's walls, mm. */
const GAP = 12;

/** True if the decoration stands up from the floor (and ants climb it). */
export function isObstacle(d: Decoration): boolean {
  return d.kind === 'stone' || d.kind === 'bark' || d.kind === 'tube' || d.kind === 'dish' || d.kind === 'feeder' || d.kind === 'branch';
}

/** Where a decoration that stands up is drawn in depth (the floor y of its middle), and its highest point, mm. */
export function standing(d: Decoration): { y: number; top: number } {
  switch (d.kind) {
    case 'stone':
    case 'bark':
      return { y: d.y, top: d.height };
    case 'tube':
    case 'feeder':
      return { y: d.y, top: 2 * d.radius };
    case 'dish':
      return { y: d.y, top: d.rim };
    case 'branch':
      return { y: (d.y0 + d.y1) / 2, top: 2 * d.radius };
    default:
      return { y: 0, top: 0 };
  }
}

/** Lays out a tank's decorations from its seed, clear of `keepClear` and of each other. */
export function layDecorations(seed: number, width: number, height: number, keepClear: KeepClear[]): Decoration[] {
  const rng = new Rng(seed, Purpose.decor);
  const placed: { x: number; y: number; r: number }[] = keepClear.map((k) => ({ x: k.x, y: k.y, r: k.radius }));
  const out: Decoration[] = [];
  /** Finds a free spot for something of radius `r`, at least `margin` mm from the walls, or null. */
  const spot = (r: number, margin = GAP, gap = GAP): { x: number; y: number } | null => {
    for (let tries = 0; tries < 60; tries++) {
      const x = rng.range(r + margin, width - r - margin);
      const y = rng.range(r + margin, height - r - margin);
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + gap)) {
        placed.push({ x, y, r });
        return { x, y };
      }
    }
    return null;
  };

  // A water tube along the back wall, its plug toward the middle.
  const tubeLength = Math.min(120, width * 0.3);
  const tx = rng.range(width * 0.45, width - tubeLength - GAP);
  const tube = { kind: 'tube' as const, x0: tx, x1: tx + tubeLength, y: GAP + 10, radius: 8 };
  if (placed.every((p) => p.x + p.r < tube.x0 - GAP || p.x - p.r > tube.x1 + GAP || p.y - p.r > tube.y + tube.radius + GAP)) {
    out.push(tube);
    for (let x = tube.x0; x <= tube.x1; x += 2 * tube.radius) placed.push({ x, y: tube.y, r: tube.radius });
  }
  // One piece of bark.
  const barkLength = rng.range(45, 65);
  const bark = spot(barkLength, GAP + 8);
  if (bark) out.push({ kind: 'bark', x: bark.x, y: bark.y, length: barkLength, width: rng.range(18, 26), height: rng.range(15, 22), angle: rng.range(-0.6, 0.6) });
  // Five to seven stones, a few big and the rest small.
  const stones = 5 + rng.int(3);
  for (let k = 0; k < stones; k++) {
    const radius = k < 2 ? rng.range(18, 28) : rng.range(8, 15);
    const at = spot(radius);
    if (!at) continue;
    const outline = Array.from({ length: 20 }, () => rng.range(0.84, 1.1));
    out.push({ kind: 'stone', x: at.x, y: at.y, radius, height: radius * rng.range(0.55, 0.8), outline });
  }
  // Flat things: leaves, twigs and moss, which may lie anywhere the obstacles are not.
  const flatSpot = (r: number) => {
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.range(r + 4, width - r - 4);
      const y = rng.range(r + 4, height - r - 4);
      if (placed.every((p, n) => n < keepClear.length || Math.hypot(p.x - x, p.y - y) > p.r + r)) return { x, y };
    }
    return null;
  };
  for (let k = 0, n = 3 + rng.int(3); k < n; k++) {
    const length = rng.range(26, 42);
    const at = flatSpot(length / 2);
    if (at) out.push({ kind: 'leaf', x: at.x, y: at.y, length, width: length * rng.range(0.45, 0.6), angle: rng.range(-Math.PI, Math.PI), shade: rng.float() });
  }
  for (let k = 0; k < 2; k++) {
    const length = rng.range(70, 120);
    const angle = rng.range(-0.5, 0.5) + (k === 1 ? Math.PI / 2 : 0);
    const at = flatSpot(length / 2);
    if (!at) continue;
    const dx = (Math.cos(angle) * length) / 2;
    const dy = (Math.sin(angle) * length) / 2;
    out.push({ kind: 'twig', x0: at.x - dx, y0: at.y - dy, x1: at.x + dx, y1: at.y + dy, width: rng.range(2, 3), fork: rng.range(0.4, 0.7) });
  }
  for (let k = 0; k < 2; k++) {
    const radius = rng.range(18, 30);
    const at = flatSpot(radius);
    if (at) out.push({ kind: 'moss', x: at.x, y: at.y, radius });
  }
  return out;
}

/** True if (x, y) lies under the decoration's footprint on the floor (obstacles only). */
export function covers(d: Decoration, x: number, y: number): boolean {
  switch (d.kind) {
    case 'stone': {
      const dx = x - d.x;
      const dy = y - d.y;
      const r = Math.hypot(dx, dy);
      if (r > d.radius * 1.1) return false;
      // The outline's radius at this angle, interpolated between its points.
      const n = d.outline.length;
      const a = ((Math.atan2(dy, dx) / (2 * Math.PI)) * n + n) % n;
      const k = Math.floor(a);
      const t = a - k;
      const f = d.outline[k]! * (1 - t) + d.outline[(k + 1) % n]! * t;
      return r <= d.radius * f;
    }
    case 'bark': {
      const c = Math.cos(-d.angle);
      const s = Math.sin(-d.angle);
      const u = (x - d.x) * c - (y - d.y) * s;
      const v = (x - d.x) * s + (y - d.y) * c;
      return (u / d.length) ** 2 + (v / (d.width / 2)) ** 2 <= 1;
    }
    case 'tube':
      return x >= d.x0 - d.radius && x <= d.x1 + d.radius && Math.abs(y - d.y) <= d.radius;
    default:
      return false;
  }
}

/**
 * Height of the decoration's top surface above the floor point (x, y), mm, or
 * 0 off it. Stones and bark are half ellipsoids over their outline (the page
 * draws them as stacked slices of the same shape); the water tube is a
 * cylinder lying on the floor, with rounded ends.
 */
export function reliefOf(d: Decoration, x: number, y: number): number {
  switch (d.kind) {
    case 'stone': {
      const dx = x - d.x;
      const dy = y - d.y;
      const r = Math.hypot(dx, dy);
      if (r >= d.radius * 1.1) return 0;
      const n = d.outline.length;
      const a = ((Math.atan2(dy, dx) / (2 * Math.PI)) * n + n) % n;
      const k = Math.floor(a);
      const t = a - k;
      const f = r / (d.radius * (d.outline[k]! * (1 - t) + d.outline[(k + 1) % n]! * t));
      return f < 1 ? d.height * Math.sqrt(1 - f * f) : 0;
    }
    case 'bark': {
      const c = Math.cos(-d.angle);
      const s = Math.sin(-d.angle);
      const u = (x - d.x) * c - (y - d.y) * s;
      const v = (x - d.x) * s + (y - d.y) * c;
      const q = (u / d.length) ** 2 + (v / (d.width / 2)) ** 2;
      return q < 1 ? d.height * Math.sqrt(1 - q) : 0;
    }
    case 'tube':
    case 'feeder': {
      const dx = x < d.x0 ? d.x0 - x : x > d.x1 ? x - d.x1 : 0;
      const off = Math.hypot(dx, y - d.y);
      return off < d.radius ? d.radius + Math.sqrt(d.radius * d.radius - off * off) : 0;
    }
    case 'branch': {
      const off = segmentDistance(x, y, d.x0, d.y0, d.x1, d.y1);
      return off < d.radius ? d.radius + Math.sqrt(d.radius * d.radius - off * off) : 0;
    }
    case 'dish': {
      const r = Math.hypot(x - d.x, y - d.y);
      return r > d.radius ? 0 : r > d.radius - DISH_WALL ? d.rim : d.base;
    }
    default:
      return 0;
  }
}

/** The thickness of the feeding dish's wall, mm. */
export const DISH_WALL = 1.2;

/** True if (x, y) is on the floor inside a feeding dish, where food put down stays (B4). */
export function inDish(d: Decoration, x: number, y: number): boolean {
  return d.kind === 'dish' && Math.hypot(x - d.x, y - d.y) < d.radius - DISH_WALL - 0.5;
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The decoration under the floor point (x, y), as an index into `decor`, or
 * -1: things that stand up first (the nearest to the viewer if several),
 * then flat ones. For the keeper's move and remove tools.
 */
export function decorationAt(decor: Decoration[], x: number, y: number): number {
  let best = -1;
  let bestY = -Infinity;
  decor.forEach((d, k) => {
    if (isObstacle(d) && reliefOf(d, x, y) > 0 && standing(d).y > bestY) {
      best = k;
      bestY = standing(d).y;
    }
  });
  if (best >= 0) return best;
  for (let k = decor.length - 1; k >= 0; k--) {
    const d = decor[k]!;
    if (d.kind === 'moss' && Math.hypot(x - d.x, y - d.y) < d.radius) return k;
    if (d.kind === 'twig' && segmentDistance(x, y, d.x0, d.y0, d.x1, d.y1) < 3) return k;
    if (d.kind === 'leaf') {
      const c = Math.cos(-d.angle);
      const s = Math.sin(-d.angle);
      const u = (x - d.x) * c - (y - d.y) * s;
      const v = (x - d.x) * s + (y - d.y) * c;
      if ((u / (d.length / 2)) ** 2 + (v / (d.width / 2)) ** 2 <= 1) return k;
    }
  }
  return -1;
}

/** The decoration moved by (dx, dy) mm. */
export function shifted(d: Decoration, dx: number, dy: number): Decoration {
  if ('x0' in d) {
    const out = { ...d, x0: d.x0 + dx, x1: d.x1 + dx };
    if ('y0' in out) return { ...out, y0: out.y0 + dy, y1: out.y1 + dy };
    return { ...out, y: (out as { y: number }).y + dy } as Decoration;
  }
  return { ...d, x: d.x + dx, y: d.y + dy };
}

/** A point the decoration is moved by: its middle on the floor. */
export function middleOf(d: Decoration): { x: number; y: number } {
  if ('x0' in d) return { x: (d.x0 + d.x1) / 2, y: 'y0' in d ? (d.y0 + d.y1) / 2 : d.y };
  return { x: d.x, y: d.y };
}

/** The relief of a floor `width` x `height` mm with these decorations: the surface's height over each cell's centre, mm. */
export function buildRelief(width: number, height: number, decorations: Decoration[]): Float32Array {
  const relief = new Float32Array(width * height);
  for (const d of decorations) {
    if (!isObstacle(d)) continue;
    const [x0, y0, x1, y1] = footprint(d);
    for (let cy = Math.max(0, Math.floor(y0)); cy <= Math.min(height - 1, Math.ceil(y1)); cy++) {
      for (let cx = Math.max(0, Math.floor(x0)); cx <= Math.min(width - 1, Math.ceil(x1)); cx++) {
        const h = reliefOf(d, cx + 0.5, cy + 0.5);
        const i = cy * width + cx;
        if (h > relief[i]!) relief[i] = h;
      }
    }
  }
  return relief;
}

/** A box round the decoration's footprint on the floor: x0, y0, x1, y1, mm. */
function footprint(d: Decoration): [number, number, number, number] {
  switch (d.kind) {
    case 'stone':
      return [d.x - 1.1 * d.radius, d.y - 1.1 * d.radius, d.x + 1.1 * d.radius, d.y + 1.1 * d.radius];
    case 'bark':
      return [d.x - d.length, d.y - d.length, d.x + d.length, d.y + d.length];
    case 'tube':
    case 'feeder':
      return [d.x0 - d.radius, d.y - d.radius, d.x1 + d.radius, d.y + d.radius];
    case 'branch':
      return [Math.min(d.x0, d.x1) - d.radius, Math.min(d.y0, d.y1) - d.radius, Math.max(d.x0, d.x1) + d.radius, Math.max(d.y0, d.y1) + d.radius];
    case 'dish':
      return [d.x - d.radius, d.y - d.radius, d.x + d.radius, d.y + d.radius];
    default:
      return [0, 0, -1, -1];
  }
}

/** A box round where the decoration lies on the floor, flat ones included: x0, y0, x1, y1, mm. */
export function extent(d: Decoration): [number, number, number, number] {
  switch (d.kind) {
    case 'leaf':
      return [d.x - d.length / 2, d.y - d.length / 2, d.x + d.length / 2, d.y + d.length / 2];
    case 'moss':
      return [d.x - d.radius, d.y - d.radius, d.x + d.radius, d.y + d.radius];
    case 'twig':
      return [Math.min(d.x0, d.x1) - 2, Math.min(d.y0, d.y1) - 2, Math.max(d.x0, d.x1) + 2, Math.max(d.y0, d.y1) + 2];
    default:
      return footprint(d);
  }
}

/** Writes the decorations that stand up into the arena's `relief`, which ants walk over (A5). */
export function stampDecorations(arena: Arena, decorations: Decoration[]): void {
  arena.relief = buildRelief(arena.width, arena.height, decorations);
}

