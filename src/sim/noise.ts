/**
 * Smooth value noise for generating soil (DESIGN.md section 3.2).
 *
 * Random values on a coarse lattice, blended with a smoothstep, give patches
 * of a chosen size. Lattice values come from the seeded Rng, so the result
 * is deterministic.
 */
import type { Rng } from './rng';

/** Returns a function giving smooth noise in [0, 1) over a w x h area, with features about `cell` units across. */
export function valueNoise2D(rng: Rng, w: number, h: number, cell: number): (x: number, y: number) => number {
  const cols = Math.ceil(w / cell) + 2;
  const rows = Math.ceil(h / cell) + 2;
  const lattice = new Float64Array(cols * rows);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.float();
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smoothstep(fx - x0);
    const ty = smoothstep(fy - y0);
    const at = (cx: number, cy: number) => lattice[cy * cols + cx]!;
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
