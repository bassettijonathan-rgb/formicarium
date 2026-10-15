/**
 * Worker sizes (Messor barbarus, DESIGN.md 4.4, step 2 of the Messor plan).
 *
 * A harvester colony has workers of very different sizes: minors, medias
 * and majors (Heredia & Detrain 2000), 3 to 12 mm long (keepers' care
 * sheets). Each worker gets its size when it comes out of its cocoon, and a
 * young colony makes only minors: medias appear once it has about 50
 * workers and majors once it has about 150 (rough: keepers see majors in a
 * colony's second year; no growth curve was measured).
 *
 * Saved per ant (`Ants.size`, tenths of a mm); 0 is the species' standard
 * worker, which is what every ant of the other species is, and every Messor
 * worker of a tank kept before sizes (a media).
 */
import type { Ants } from './ants';
import type { AntParams } from './params';
import type { Rng } from './rng';

/** Length of a standard (media) Messor worker, mm: the one the model's other numbers are for. */
export const MEDIA_LENGTH = 7;

/** The size classes, by length in mm (rough, after keepers' minor 3-5, media 5-8, major 8-12). */
export const SIZE_CLASSES = { minor: [3, 5], media: [5, 8], major: [8, 12] } as const;
export type SizeClass = keyof typeof SIZE_CLASSES;

/** Ant `i`'s length, mm, for a species whose workers differ in size. */
export function lengthOf(ants: Ants, i: number): number {
  const s = ants.size[i]!;
  return s > 0 ? s / 10 : MEDIA_LENGTH;
}

/** Ant `i`'s length relative to a media: 1 for the species' standard worker. */
export function sizeScale(ants: Ants, i: number): number {
  const s = ants.size[i]!;
  return s > 0 ? s / 10 / MEDIA_LENGTH : 1;
}

/** The class a worker of `length` mm falls in. */
export function sizeClass(length: number): SizeClass {
  return length < SIZE_CLASSES.minor[1] ? 'minor' : length < SIZE_CLASSES.media[1] ? 'media' : 'major';
}

/**
 * The share of new workers that are medias and majors in a colony of
 * `workers` (rough): none below 50 and 150 workers, rising to a third and
 * a seventh in a colony of a few hundred.
 */
export function classShares(workers: number): { media: number; major: number } {
  const ramp = (from: number, to: number) => Math.max(0, Math.min(1, (workers - from) / (to - from)));
  return { media: 0.35 * ramp(50, 150), major: 0.15 * ramp(150, 400) };
}

/** A new worker's length in tenths of a mm, in a colony of `workers`: its class by `classShares`, its length even within the class. */
export function drawSize(rng: Rng, workers: number): number {
  const { media, major } = classShares(workers);
  const u = rng.float();
  const [lo, hi] = u < major ? SIZE_CLASSES.major : u < major + media ? SIZE_CLASSES.media : SIZE_CLASSES.minor;
  // Kept below the class's upper bound, which belongs to the next class.
  return Math.min(10 * hi - 1, Math.round(10 * (lo + (hi - lo) * rng.float())));
}

/**
 * The heaviest seed worker `i` carries home, mg: `seedCarryMax` for a
 * media, times its length relative to a media's to the power
 * `seedSizeExponent` (3: mass and strength go with the cube of length).
 */
export function seedCapacity(ants: Ants, params: AntParams, i: number): number {
  return params.seedCarryMax * Math.pow(sizeScale(ants, i), params.seedSizeExponent);
}

/** How fast worker `i` cracks a seed relative to a media: with its jaw muscles' cross-section, the square of its length. */
export function crackSpeed(ants: Ants, i: number): number {
  const s = sizeScale(ants, i);
  return s * s;
}
