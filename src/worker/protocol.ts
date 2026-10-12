/** Messages between the page and the simulation worker (DESIGN.md section 10). */

export type ToWorker =
  | { type: 'start'; seed: number }
  /** Simulation speed: 0 pauses, 1 is real ant time. */
  | { type: 'speed'; value: number }
  /** The keeper puts a sugar drop in the arena, at arena coordinates in mm. */
  | { type: 'sugar'; x: number; y: number; volume: number; concentration: number }
  /** The keeper puts a crushed insect (protein) in the arena. */
  | { type: 'protein'; x: number; y: number; volume: number }
  /** The keeper removes all food from the arena. */
  | { type: 'clearFood' }
  /** The keeper puts the heat mat under the farm with its left edge at `x` mm, or takes it away (null). */
  | { type: 'heatMat'; x: number | null };

/** Numbers per ant in `AntsSnapshot.ants`. */
export const ANT_STRIDE = 7;

export interface AntsSnapshot {
  type: 'ants';
  step: number;
  /**
   * Per ant: x, y (mm, in the arena or the farm), heading, state, distance
   * walked (mm), place (`Place`), and the `Material` of a carried grain (0 = none).
   * Crop is in `full`.
   */
  ants: Float32Array;
  /** 1 where the ant's crop is more than half full (its gaster is stretched). */
  full: Uint8Array;
  /** Each ant's `Caste`. */
  caste: Uint8Array;
  /** 1 for a callow: a worker in its first days out of the cocoon, still pale. */
  callow: Uint8Array;
  /** Brood in the farm, `BROOD_STRIDE` numbers each: x, y (mm), `BroodStage`, size (mm). */
  brood: Float32Array;
}

/** Numbers per brood item in `AntsSnapshot.brood`. */
export const BROOD_STRIDE = 4;

export interface ArenaSnapshot {
  type: 'arena';
  width: number;
  height: number;
  /** Trail pheromone per cell. */
  trail: Float32Array;
  /** 1 where the floor is blocked (only lab setups have inner walls). */
  wall: Uint8Array;
  food: { id: number; x: number; y: number; volume: number; concentration: number; protein: number }[];
  /** All workers; those out foraging (in the arena or the tube); sugar water in the colony's crops (µL). */
  ants: number;
  out: number;
  stores: number;
}

export interface FarmSnapshot {
  type: 'farm';
  width: number;
  height: number;
  material: Uint8Array;
  moisture: Uint8Array;
  /** 1 for loose grains (spoil and fallen soil). */
  loose: Uint8Array;
}

export interface HeatSnapshot {
  type: 'heat';
  /** The farm's temperature field: `width` × `height` cells of `cell` mm, °C. */
  width: number;
  height: number;
  cell: number;
  temperature: Float32Array;
  /** Where the heat mat is under the farm, mm, or null. */
  mat: { x: number; width: number } | null;
  room: number;
}

export type FromWorker =
  /** The farm's soil layers; sent at start and whenever the soil changes. */
  | FarmSnapshot
  | AntsSnapshot
  | ArenaSnapshot
  | HeatSnapshot;
