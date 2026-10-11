/**
 * Food in the arena (DESIGN.md sections 7.3 and 8): drops of sugar water and,
 * from M3b, protein-rich food (insect juice: the keeper's crushed fly).
 */
import type { AntParams } from './params';

export interface FoodDrop {
  id: number;
  x: number;
  y: number;
  /** Sugar water left, µL (1 µL = 1 mm³). */
  volume: number;
  /** Sucrose concentration, mol/L; for protein food, how attractive it is on the same scale. */
  concentration: number;
  /** Fraction of the drop that is protein-rich food (0 for sugar water, 1 for insect). */
  protein: number;
}

/** Radius of a drop sitting on the floor as a hemisphere, mm. */
export function dropRadius(volume: number): number {
  return Math.cbrt((3 * volume) / (2 * Math.PI));
}

/**
 * How good a drop is to an ant, 0 to 1, from its sugar concentration.
 * Lasius niger lays more trail for richer sugar (Beckers et al. 1993).
 */
export function foodQuality(concentration: number, params: AntParams): number {
  return concentration / (concentration + params.qualityHalf);
}
