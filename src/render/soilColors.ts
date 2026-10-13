/**
 * Colours for the farm's soil (DESIGN.md D11). Pure functions, so they can be
 * tested without a browser.
 */
import { Material } from '../sim/materials';

/** Dry colour of each material as [r, g, b], indexed by `Material`. */
const DRY: readonly (readonly [number, number, number])[] = [
  [24, 26, 30], // air: the dark gap behind the glass
  [214, 182, 128], // sand: pale tan
  [140, 101, 66], // loam: mid brown
  [158, 92, 62], // clay: reddish brown
];

/** How much fully wet soil darkens, as a fraction of its dry brightness. */
const WET_DARKENING = 0.5;
/** Loose grains are drawn this much brighter than packed soil of the same kind. */
const LOOSE_BRIGHTENING = 1.18;

/** Colour of a single grain of a material (a carried grain), as 0xrrggbb, a little damp. */
export function grainColor(material: number): number {
  const [r, g, b] = DRY[material] ?? DRY[Material.sand]!;
  const k = 0.8;
  return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k);
}

/**
 * Writes RGBA pixels for a soil grid into `out` (length 4 * cells).
 * Wet soil is darker, and each grain gets a small fixed brightness jitter so
 * the soil reads as grains rather than flat colour.
 */
export function paintSoil(
  material: Uint8Array,
  moisture: Uint8Array,
  out: Uint8ClampedArray,
  loose?: Uint8Array,
): void {
  for (let i = 0; i < material.length; i++) {
    const m = material[i]!;
    const rgb = DRY[m] ?? DRY[0]!;
    let k = 1;
    if (m !== Material.air) {
      k = (1 - WET_DARKENING * (moisture[i]! / 255)) * (0.88 + 0.24 * grainJitter(i));
      // Loose spoil is crumbly and lets light between the grains: a little paler, more speckled.
      if (loose?.[i]) k *= LOOSE_BRIGHTENING * (0.85 + 0.3 * grainJitter(i + 7919));
    }
    out[4 * i] = rgb[0] * k;
    out[4 * i + 1] = rgb[1] * k;
    out[4 * i + 2] = rgb[2] * k;
    out[4 * i + 3] = 255;
  }
}

/** A fixed pseudo-random value in [0, 1) per cell, so grains don't flicker between redraws. */
function grainJitter(i: number): number {
  let x = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x165667b1);
  x ^= x >>> 13;
  return (x >>> 0) / 0x1_0000_0000;
}

/**
 * A shaft or tunnel mouth narrower than this, in mm, going down into the ground
 * stays dark; the air above the ground is see-through (the room shows behind).
 */
const OPEN_AIR = 6;

/** Solid thinner than this, in mm, hanging over air does not roof it over. */
const THIN_ROOF = 3;

/** How far either side the ground between spoil heaps is looked for, mm. */
const GROUND_REACH = 30;

/**
 * Makes the air above the soil surface see-through (alpha 0), so the headspace
 * shows the room behind the farm. A column is clear from the lid down to its
 * first solid cell, but never deeper than the ground nearby: the deepest
 * stretch of surface at least OPEN_AIR + 1 mm wide within GROUND_REACH mm. So a
 * slot between two spoil heaps clears down to the ground, while tunnel mouths
 * and shafts going down into the soil stay dark like the rest of the nest.
 */
export function clearHeadspace(material: Uint8Array, width: number, height: number, rgba: Uint8ClampedArray): void {
  // Each column's first solid cell with something under it: a crumb of damp spoil
  // hanging over a hole (thinner than THIN_ROOF) does not darken the air below it.
  const first = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    let y = 0;
    for (;;) {
      while (y < height && material[y * width + x] === Material.air) y++;
      let run = 0;
      while (y + run < height && run < THIN_ROOF && material[(y + run) * width + x] !== Material.air) run++;
      if (run >= THIN_ROOF || y + run >= height) break;
      y += run;
    }
    first[x] = y;
  }
  const at = (x: number) => Math.min(width - 1, Math.max(0, x));
  // The surface with anything narrower than OPEN_AIR + 1 columns filled in.
  const reach = Math.floor(OPEN_AIR / 2);
  const wide = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    let surface = height;
    for (let dx = -reach; dx <= reach; dx++) surface = Math.min(surface, first[at(x + dx)]!);
    wide[x] = surface;
  }
  for (let x = 0; x < width; x++) {
    let ground = 0;
    for (let dx = -GROUND_REACH; dx <= GROUND_REACH; dx++) ground = Math.max(ground, wide[at(x + dx)]!);
    const clear = Math.min(first[x]!, ground);
    for (let y = 0; y < clear; y++) if (material[y * width + x] === Material.air) rgba[4 * (y * width + x) + 3] = 0;
  }
}
