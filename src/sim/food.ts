/**
 * Food in the arena (DESIGN.md sections 7.3 and 8). M1 has sugar drops only.
 */
import type { AntParams } from './params';

export interface FoodDrop {
  id: number;
  x: number;
  y: number;
  /** Sugar water left, µL (1 µL = 1 mm³). */
  volume: number;
  /** Sucrose concentration, mol/L. */
  concentration: number;
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
