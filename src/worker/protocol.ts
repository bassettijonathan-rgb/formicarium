/** Messages between the page and the simulation worker (DESIGN.md section 10). */

export type ToWorker =
  | { type: 'start'; seed: number }
  /** Simulation speed: 0 pauses, 1 is real ant time. */
  | { type: 'speed'; value: number }
  /** The keeper puts a sugar drop in the arena, at arena coordinates in mm. */
  | { type: 'sugar'; x: number; y: number; volume: number; concentration: number }
  /** The keeper removes all food from the arena. */
  | { type: 'clearFood' };

/** Numbers per ant in `AntsSnapshot.ants`. */
export const ANT_STRIDE = 5;

export interface AntsSnapshot {
  type: 'ants';
  step: number;
  /** Per ant: x, y (arena mm), heading, state, distance walked (mm). Crop is in `full`. */
  ants: Float32Array;
  /** 1 where the ant's crop holds sugar. */
  full: Uint8Array;
}

export interface ArenaSnapshot {
  type: 'arena';
  width: number;
  height: number;
  /** Trail pheromone per cell. */
  trail: Float32Array;
  /** 1 where the floor is blocked (only lab setups have inner walls). */
  wall: Uint8Array;
  food: { id: number; x: number; y: number; volume: number; concentration: number }[];
  /** All workers, those in the nest, and sugar stored (µL). */
  ants: number;
  inNest: number;
  stores: number;
}

export type FromWorker =
  /** The farm's soil layers; sent at start and whenever the soil changes. */
  | { type: 'farm'; width: number; height: number; material: Uint8Array; moisture: Uint8Array }
  | AntsSnapshot
  | ArenaSnapshot;
