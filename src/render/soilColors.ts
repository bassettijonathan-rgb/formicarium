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
