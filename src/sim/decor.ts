/**
 * Decorations in the keeper's arena (DESIGN.md section 3.3, A4): stones, a
 * piece of cork bark and a water tube that the ants must walk round, and dry
 * leaves, twigs and moss lying flat that they walk over. Each new tank lays
 * them out from its seed.
 *
 * The obstacles are written into the arena's `wall` grid, so the ants meet
 * them exactly as they meet any wall: by bumping into them and sliding along
 * (`moveAnt`). The shapes are kept too, as plain data, so the page can draw them.
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
  | { kind: 'moss'; x: number; y: number; radius: number };

/** Places a new tank's first food goes and the ants come in: decorations keep clear of them. */
export interface KeepClear {
  x: number;
  y: number;
  radius: number;
}

/** Ants need room to pass between obstacles and round the arena's walls, mm. */
const GAP = 12;

/** True if the decoration is in the ants' way. */
export function isObstacle(d: Decoration): boolean {
  return d.kind === 'stone' || d.kind === 'bark' || d.kind === 'tube';
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

/** Writes the obstacles into the arena's `wall` grid (a cell is blocked if its centre is covered). */
export function stampDecorations(arena: Arena, decorations: Decoration[]): void {
  for (const d of decorations) {
    if (!isObstacle(d)) continue;
    for (let cy = 0; cy < arena.height; cy++) {
      for (let cx = 0; cx < arena.width; cx++) {
        if (covers(d, cx + 0.5, cy + 0.5)) arena.wall[cy * arena.width + cx] = 1;
      }
    }
  }
}

