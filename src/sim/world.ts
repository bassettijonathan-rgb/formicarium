/**
 * The world: everything the simulation knows, as plain data (DESIGN.md section 10).
 *
 * M1: the farm's soil (not yet dug), and workers foraging in the arena from a
 * nest that is, for now, a single chamber behind the tube.
 */
import { type Ants, type Nest, createAnts, stepAnts } from './ants';
import { type Arena, createArena, evaporateTrail } from './arena';
import type { FoodDrop } from './food';
import { Material } from './materials';
import { valueNoise2D } from './noise';
import { type AntParams, DEFAULT_ANT_PARAMS } from './params';
import { Purpose, Rng } from './rng';
import { FARM_HEIGHT, FARM_WIDTH, HEADSPACE } from './tank';
import { STEPS_PER_SECOND } from './time';

/** The farm's soil grid (side view), one cell per mm, row-major from the top-left. */
export interface Farm {
  width: number;
  height: number;
  /** A `Material` per cell. */
  material: Uint8Array;
  /** Water content per cell, 0 (dust dry) to 255 (saturated). */
  moisture: Uint8Array;
  /** Depth of the soil surface below the lid, per column, in mm. */
  surface: Uint16Array;
}

export interface World {
  seed: number;
  /** Steps since the tank was set up; 20 steps per second of ant time. */
  step: number;
  /** State of the simulation's random stream (`Purpose.sim`). */
  rng: Uint32Array;
  farm: Farm;
  arena: Arena;
  ants: Ants;
  nest: Nest;
  /** Sugar drops in the arena, in the order they were placed. */
  food: FoodDrop[];
  nextFoodId: number;
  params: AntParams;
}

export interface WorldOptions {
  /** Number of workers (default 60). */
  ants?: number;
  /** Changes to the default ant parameters, e.g. `{ trailLaying: false }` for a control. */
  params?: Partial<AntParams>;
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  return {
    seed,
    step: 0,
    rng: new Rng(seed, Purpose.sim).state,
    farm: createFarm(new Rng(seed, Purpose.soil)),
    arena: createArena(),
    ants: createAnts(options.ants ?? 60),
    nest: { stores: 0, excitement: 0 },
    food: [],
    nextFoodId: 1,
    params: { ...DEFAULT_ANT_PARAMS, ...options.params },
  };
}

/** Trail evaporates once per second of ant time; finer steps would change nothing visible. */
const EVAPORATE_EVERY = STEPS_PER_SECOND;

/** Advances the world by one step (1/20 s of ant time). */
export function step(world: World): void {
  stepAnts({
    ants: world.ants,
    arena: world.arena,
    food: world.food,
    nest: world.nest,
    params: world.params,
    rng: Rng.over(world.rng),
  });
  if (world.food.some((d) => d.volume <= 0)) world.food = world.food.filter((d) => d.volume > 0);
  world.step += 1;
  if (world.step % EVAPORATE_EVERY === 0) {
    evaporateTrail(world.arena, EVAPORATE_EVERY / STEPS_PER_SECOND, world.params.trailHalfLife);
  }
}

/** Puts a drop of sugar water on the arena floor. Returns its id. */
export function placeSugar(world: World, x: number, y: number, volume: number, concentration: number): number {
  const id = world.nextFoodId++;
  world.food.push({ id, x, y, volume, concentration });
  return id;
}

/** Takes a drop away (the keeper cleaning up, or an experiment removing food). */
export function removeFood(world: World, id: number): void {
  world.food = world.food.filter((d) => d.id !== id);
}

/**
 * Fills the farm the way a keeper would: a damp sand-loam mix with patches
 * of sandier and clay-rich soil, a slightly uneven surface, and water that
 * has drained toward the bottom.
 */
function createFarm(rng: Rng): Farm {
  const width = FARM_WIDTH;
  const height = FARM_HEIGHT;
  const material = new Uint8Array(width * height);
  const moisture = new Uint8Array(width * height);
  const surface = new Uint16Array(width);

  // Surface: a few mm of unevenness from pouring and settling.
  const surfaceNoise = valueNoise2D(rng, width, 1, 40);
  for (let x = 0; x < width; x++) surface[x] = Math.round(HEADSPACE + (surfaceNoise(x, 0) - 0.5) * 6);

  const patches = valueNoise2D(rng, width, height, 45);
  const grain = valueNoise2D(rng, width, height, 5);
  const wetness = valueNoise2D(rng, width, height, 30);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (y < surface[x]!) continue; // air under the lid
      const v = 0.6 * patches(x, y) + 0.4 * grain(x, y) + 0.12 * (rng.float() - 0.5);
      const m: Material = v < 0.33 ? Material.sand : v > 0.67 ? Material.clay : Material.loam;
      material[i] = m;

      // Water drains down, and clay holds more of it than sand.
      const depth = (y - surface[x]!) / (height - surface[x]!);
      const retention = m === Material.clay ? 0.12 : m === Material.sand ? -0.12 : 0;
      const w = 0.3 + 0.35 * depth + retention + 0.15 * (wetness(x, y) - 0.5);
      moisture[i] = Math.round(255 * Math.min(1, Math.max(0, w)));
    }
  }
  return { width, height, material, moisture, surface };
}
