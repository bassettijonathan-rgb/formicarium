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
  /** Insects: how long it has lain, in tank days at 25 °C (M5b), and whether it has gone mouldy; ants leave mouldy food. */
  age: number;
  mouldy: boolean;
  /**
   * The sugar water in a liquid feeder (B5): how far from its middle ants can
   * drink, mm (the wet cotton plug's face), instead of the drop's own size.
   */
  reach?: number;
}

/** Radius of a drop sitting on the floor as a hemisphere, mm. */
export function dropRadius(volume: number): number {
  return Math.cbrt((3 * volume) / (2 * Math.PI));
}

/** How far from its middle an ant can drink from the food, mm: a drop's radius, or a feeder's cotton. */
export function foodReach(drop: Pick<FoodDrop, 'volume' | 'reach'>): number {
  return drop.reach ?? dropRadius(drop.volume);
}

/**
 * How good a drop is to an ant, 0 to 1, from its sugar concentration.
 * Lasius niger lays more trail for richer sugar (Beckers et al. 1993).
 */
export function foodQuality(concentration: number, params: AntParams): number {
  return concentration / (concentration + params.qualityHalf);
}
