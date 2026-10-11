/** Messages between the page and the simulation worker (DESIGN.md section 10). */

export type ToWorker =
  | { type: 'start'; seed: number }
  /** Simulation speed: 0 pauses, 1 is real ant time. */
  | { type: 'speed'; value: number };

export type FromWorker =
  /** The farm's soil layers; sent at start and whenever the soil changes. */
  | { type: 'farm'; width: number; height: number; material: Uint8Array; moisture: Uint8Array }
  | { type: 'tick'; step: number };
