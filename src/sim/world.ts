/**
 * The world: everything the simulation knows, as plain data (DESIGN.md section 10).
 *
 * M2: the colony lives in the sand farm, digs its nest, and forages in the
 * arena through the tube. Lab experiments use a simple lab nest instead.
 */
import { type Ants, AntState, Caste, type Nest, type NestMode, Place, addAnt, createAnts, stepAnts } from './ants';
import { type Brood, createBrood, scentBrood, stepBrood } from './brood';
import { type Arena, createArena, evaporateTrail } from './arena';
import { type Farm, createFarm, updateField, updateFresh } from './farm';
import type { FoodDrop } from './food';
import { type AntParams, DEFAULT_ANT_PARAMS } from './params';
import { Purpose, Rng } from './rng';
import { stepSoil } from './soil';
import { STEPS_PER_SECOND } from './time';

export type { Farm } from './farm';

/** Sugar water in all the workers' crops, µL: in the farm this is the colony's store. */
export function colonyCrop(world: World): number {
  let total = 0;
  for (let i = 0; i < world.ants.count; i++) total += world.ants.crop[i]!;
  return total;
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
  nestMode: NestMode;
  /** Food drops in the arena, in the order they were placed. */
  food: FoodDrop[];
  /** Eggs, larvae and pupae in the farm. */
  brood: Brood;
  nextFoodId: number;
  params: AntParams;
}

export interface WorldOptions {
  /** Number of workers (default 60). */
  ants?: number;
  /** A queen comes with the workers (farm only; default false, as in most lab experiments on workers). */
  queen?: boolean;
  /** Where the colony lives: the sand farm (default) or a lab nest behind the arena entrance. */
  nest?: NestMode;
  /** Changes to the default ant parameters, e.g. `{ trailLaying: false }` for a control. */
  params?: Partial<AntParams>;
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  const nestMode = options.nest ?? 'farm';
  const params = { ...DEFAULT_ANT_PARAMS, ...options.params };
  const farm = createFarm(new Rng(seed, Purpose.soil));
  const ants = createAnts(options.ants ?? 60);
  giveTraits(ants, params, new Rng(seed, Purpose.traits));
  if (nestMode === 'farm') {
    const pour = new Rng(seed, Purpose.ants);
    pourAnts(ants, farm, params, pour);
    if (options.queen) addQueen(ants, farm, params, pour);
  }
  return {
    seed,
    step: 0,
    rng: new Rng(seed, Purpose.sim).state,
    farm,
    arena: createArena(),
    ants,
    nest: { stores: 0, excitement: 0 },
    nestMode,
    food: [],
    brood: createBrood(),
    nextFoodId: 1,
    params,
  };
}

/** Ants poured into the farm land within this many mm either side of the middle. */
const POUR_SPREAD = 15;

/** Each worker's own response threshold for foraging, log-uniform between the two bounds. */
function giveTraits(ants: Ants, params: AntParams, rng: Rng): void {
  const ratio = params.forageThresholdMax / params.forageThresholdMin;
  for (let i = 0; i < ants.count; i++) ants.forageThreshold[i] = params.forageThresholdMin * Math.pow(ratio, rng.float());
}

/** The keeper tips the workers onto the soil surface, all at one spot in the middle. They come part-fed. */
function pourAnts(ants: Ants, farm: Farm, params: AntParams, rng: Rng): void {
  for (let i = 0; i < ants.count; i++) {
    ants.crop[i] = params.startCrop * params.cropLoad;
    const x = rng.range(farm.width / 2 - POUR_SPREAD, farm.width / 2 + POUR_SPREAD);
    ants.place[i] = Place.farm;
    ants.state[i] = AntState.wandering;
    ants.x[i] = x;
    ants.y[i] = farm.surface[Math.floor(x)]! - 1.5;
    ants.heading[i] = rng.range(-Math.PI, Math.PI);
  }
}

/** The queen goes in last, onto the same spot; she has her body's reserve to start laying. */
function addQueen(ants: Ants, farm: Farm, params: AntParams, rng: Rng): void {
  const q = addAnt(ants);
  const x = rng.range(farm.width / 2 - POUR_SPREAD, farm.width / 2 + POUR_SPREAD);
  ants.caste[q] = Caste.queen;
  ants.place[q] = Place.farm;
  ants.state[q] = AntState.wandering;
  ants.x[q] = x;
  ants.y[q] = farm.surface[Math.floor(x)]! - 1.5;
  ants.heading[q] = rng.range(-Math.PI, Math.PI);
  ants.crop[q] = params.startCrop * params.cropLoad;
  ants.reserve[q] = params.queenReserve;
}

/** Arena trail evaporates once per second of ant time; finer steps would change nothing visible. */
const EVAPORATE_EVERY = STEPS_PER_SECOND;
/** The farm's chemical fields update every few seconds; they change slowly. */
const FARM_FIELDS_EVERY = 2 * STEPS_PER_SECOND;
const FARM_TRAIL_EVERY = 5 * STEPS_PER_SECOND;

/** Advances the world by one step (1/20 s of ant time). */
export function step(world: World): void {
  const rng = Rng.over(world.rng);
  stepAnts({
    ants: world.ants,
    arena: world.arena,
    farm: world.farm,
    food: world.food,
    brood: world.brood,
    nest: world.nest,
    nestMode: world.nestMode,
    params: world.params,
    rng,
  });
  if (world.food.some((d) => d.volume <= 0)) world.food = world.food.filter((d) => d.volume > 0);
  world.step += 1;
  if (world.step % EVAPORATE_EVERY === 0) {
    evaporateTrail(world.arena, EVAPORATE_EVERY / STEPS_PER_SECOND, world.params.trailHalfLife);
  }
  if (world.nestMode === 'farm') {
    const { farm, params } = world;
    stepSoil(farm, rng);
    if (world.step % FARM_FIELDS_EVERY === 0) {
      const seconds = FARM_FIELDS_EVERY / STEPS_PER_SECOND;
      updateField(farm, farm.odour, seconds, params.odourHalfLife, params.odourDiffusion, true);
      updateField(farm, farm.digMark, seconds, params.digMarkHalfLife, 0);
      updateFresh(farm);
      stepBrood(world.brood, params, seconds);
      scentBrood(world.brood, farm, params, seconds);
      updateField(farm, farm.broodScent, seconds, params.broodScentHalfLife, params.broodScentDiffusion, true);
    }
    if (world.step % FARM_TRAIL_EVERY === 0) {
      evaporateTrail(farm, FARM_TRAIL_EVERY / STEPS_PER_SECOND, params.trailHalfLife);
    }
  }
}

/** Puts a drop of sugar water on the arena floor. Returns its id. */
export function placeSugar(world: World, x: number, y: number, volume: number, concentration: number): number {
  const id = world.nextFoodId++;
  world.food.push({ id, x, y, volume, concentration, protein: 0 });
  return id;
}

/**
 * Puts protein-rich food on the arena floor: a crushed insect, which ants
 * drink like a drop (Lasius niger take the juices of prey). Returns its id.
 */
export function placeProtein(world: World, x: number, y: number, volume: number): number {
  const id = world.nextFoodId++;
  world.food.push({ id, x, y, volume, concentration: 1, protein: 1 });
  return id;
}

/** Takes a drop away (the keeper cleaning up, or an experiment removing food). */
export function removeFood(world: World, id: number): void {
  world.food = world.food.filter((d) => d.id !== id);
}
