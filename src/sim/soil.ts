/**
 * Soil physics in the farm (DESIGN.md section 3.2).
 *
 * Two rules, both local:
 *
 * 1. A loose grain falls straight down if there is air below, or slides
 *    diagonally down if both the side and the cell below the side are air
 *    (a 45° angle of repose). Damp grains stick to any grain beside them,
 *    and a free one only topples off a drop of two cells, so damp spoil
 *    heaps stand steep and don't pour into tunnel mouths.
 * 2. A packed grain with air below is a piece of ceiling. It holds while the
 *    gap under it is no wider than its material can span: damp clay bridges
 *    a wide chamber, dry sand barely an ant's width. A wider gap and it
 *    comes loose and falls.
 *
 * Spans are rough values chosen so tunnels behave as ant keepers describe:
 * dry sand caves in, damp sand-loam mixes hold tunnels and galleries, clay
 * holds wide chambers. In a thin farm, damp soil also clings to the glass,
 * which is why the spans are generous for damp soil.
 */
import { type Farm, cellSolid } from './farm';
import { Material } from './materials';
import type { Rng } from './rng';

/** Widest gap (mm) a damp ceiling of each material can bridge, indexed by `Material`. */
const DAMP_SPAN = [0, 10, 40, 80];

/** Moisture (0-1) at which soil reaches full strength; drier soil is weaker. */
const FULL_STRENGTH_MOISTURE = 0.4;
/** Moisture (0-1) above which loose grains stick and stand in steeper heaps. */
const STICKY_MOISTURE = 0.25;

/** Widest gap the packed cell at index `i` can bridge, mm. */
export function maxSpan(farm: Farm, i: number): number {
  const m = farm.material[i]!;
  if (farm.loose[i]) return 0;
  const w = farm.moisture[i]! / 255;
  const strength = 0.25 + 0.75 * Math.min(1, w / FULL_STRENGTH_MOISTURE);
  return (DAMP_SPAN[m] ?? 0) * strength;
}

/** Takes the grain at (cx, cy) out of the soil; returns what it was made of. */
export function removeGrain(farm: Farm, cx: number, cy: number): { material: number; moisture: number } {
  const i = cy * farm.width + cx;
  const grain = { material: farm.material[i]!, moisture: farm.moisture[i]! };
  farm.material[i] = Material.air;
  farm.moisture[i] = 0;
  farm.loose[i] = 0;
  farm.version++;
  disturb(farm, cx, cy);
  return grain;
}

/** Puts a loose grain at (cx, cy), which must be air; it will settle by itself. */
export function placeGrain(farm: Farm, cx: number, cy: number, material: number, moisture: number): void {
  const i = cy * farm.width + cx;
  farm.material[i] = material;
  farm.moisture[i] = moisture;
  farm.loose[i] = 1;
  farm.version++;
  farm.falling.push(i);
}

/** Moves every falling grain at most one cell. Bottom rows first, so a column falls together. */
export function stepSoil(farm: Farm, rng: Rng): void {
  if (farm.falling.length === 0) return;
  const queue = [...new Set(farm.falling)].sort((a, b) => b - a);
  farm.falling = [];
  const w = farm.width;
  for (const i of queue) {
    if (farm.material[i] === Material.air) continue;
    const cx = i % w;
    const cy = (i - cx) / w;
    if (!farm.loose[i]) {
      // A ceiling cell that may have lost its support.
      if (!collapses(farm, cx, cy)) continue;
      farm.loose[i] = 1;
    }
    let tx = cx; // straight down if there is air below
    if (cellSolid(farm, cx, cy + 1)) {
      // Dry grains slide down a 45° slope. Damp ones stick to a grain beside them,
      // and a free one only topples off a steeper slope.
      const damp = farm.moisture[i]! / 255 >= STICKY_MOISTURE;
      if (damp && (cellSolid(farm, cx - 1, cy) || cellSolid(farm, cx + 1, cy))) continue;
      const drop = damp ? 2 : 1;
      const first = rng.chance(0.5) ? -1 : 1;
      tx = slide(farm, cx, cy, first, drop) ?? slide(farm, cx, cy, -first, drop) ?? cx;
      if (tx === cx) continue; // settled
    }
    const j = (cy + 1) * w + tx;
    farm.material[j] = farm.material[i]!;
    farm.moisture[j] = farm.moisture[i]!;
    farm.loose[j] = 1;
    farm.material[i] = Material.air;
    farm.moisture[i] = 0;
    farm.loose[i] = 0;
    farm.falling.push(j);
    farm.version++;
    disturb(farm, cx, cy);
  }
}

/**
 * The column to slide into, one step to the side `dx` and down, or undefined
 * if blocked. The side must be clear for `drop` cells below the grain's level.
 */
function slide(farm: Farm, cx: number, cy: number, dx: number, drop: number): number | undefined {
  for (let d = 0; d <= drop; d++) if (cellSolid(farm, cx + dx, cy + d)) return undefined;
  return cx + dx;
}

/** A cell just became air: the grains around and above it may now fall. */
function disturb(farm: Farm, cx: number, cy: number): void {
  const w = farm.width;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= farm.height) continue;
      if (farm.material[y * w + x] !== Material.air) farm.falling.push(y * w + x);
    }
  }
  // Removing a cell can also widen the gap under ceilings further along the row above it.
  const reach = DAMP_SPAN[Material.clay]!;
  for (let x = Math.max(0, cx - reach); x <= Math.min(w - 1, cx + reach); x++) {
    const y = cy - 1;
    if (y >= 0 && farm.material[y * w + x] !== Material.air && !cellSolid(farm, x, cy)) farm.falling.push(y * w + x);
  }
}

/** True if the packed cell at (cx, cy) has air below wider than it can span. */
function collapses(farm: Farm, cx: number, cy: number): boolean {
  if (cellSolid(farm, cx, cy + 1)) return false;
  const limit = maxSpan(farm, cy * farm.width + cx);
  let span = 1;
  for (let x = cx - 1; !cellSolid(farm, x, cy + 1) && span <= limit; x--) span++;
  for (let x = cx + 1; !cellSolid(farm, x, cy + 1) && span <= limit; x++) span++;
  return span > limit;
}
