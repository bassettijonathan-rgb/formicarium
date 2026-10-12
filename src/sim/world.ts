/**
 * The world: everything the simulation knows, as plain data (DESIGN.md section 10).
 *
 * M2: the colony lives in the sand farm, digs its nest, and forages in the
 * arena through the tube. Lab experiments use a simple lab nest instead.
 */
import { type AntContext, type Ants, AntState, Caste, type Nest, type NestMode, Place, addAnt, createAnts, stepAnts } from './ants';
import { die, drawLifespan, dropCorpse } from './corpses';
import { type Brood, createBrood, scentBrood, stepBrood } from './brood';
import { type Arena, createArena, evaporateTrail } from './arena';
import { type Farm, createFarm, updateField, updateFresh } from './farm';
import type { FoodDrop } from './food';
import { type AntParams, DEFAULT_ANT_PARAMS } from './params';
import { Purpose, Rng } from './rng';
import { stepSoil } from './soil';
import { type HeatMat, MAT_WIDTH, updateTemperature } from './heat';
import { pourWater, updateHumidity, updateWater } from './water';
import { STEPS_PER_SECOND } from './time';

export type { Farm } from './farm';

/** Sugar water in all the workers' crops, µL: in the farm this is the colony's store. */
export function colonyCrop(world: World): number {
  let total = 0;
  for (let i = 0; i < world.ants.count; i++) if (world.ants.place[i] !== Place.gone) total += world.ants.crop[i]!; // the dead hold none
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
  /** Where the keeper has put the heat mat under the farm, or null (M5a). */
  heatMat: HeatMat | null;
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
  farm.temperature.fill(params.roomTemperature);
  if (params.waterFlow) updateHumidity(farm, params);
  const ants = createAnts(options.ants ?? 60);
  giveTraits(ants, params, seed);
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
    heatMat: null,
  };
}

/** Ants poured into the farm land within this many mm either side of the middle. */
const POUR_SPREAD = 15;

/**
 * Each worker's own response threshold for foraging, log-uniform between the
 * two bounds, and its age. The keeper's workers start with the fat of a
 * settled nest worker; who becomes lean is up to what each one does.
 */
function giveTraits(ants: Ants, params: AntParams, seed: number): void {
  const rng = new Rng(seed, Purpose.traits);
  const ages = new Rng(seed, Purpose.ages);
  const ratio = params.forageThresholdMax / params.forageThresholdMin;
  for (let i = 0; i < ants.count; i++) {
    ants.forageThreshold[i] = params.forageThresholdMin * Math.pow(ratio, rng.float());
    ants.age[i] = ages.range(params.startAgeMin, params.startAgeMax);
    ants.fat[i] = params.fatRef;
    ants.lifespan[i] = drawLifespan(seed, i, ants.age[i]!, params);
  }
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
/** Soil water moves slowly (life clock); every 10 s of ant time is a 360th of a tank day. A multiple of `FARM_FIELDS_EVERY`. */
const WATER_EVERY = 10 * STEPS_PER_SECOND;

/** Advances the world by one step (1/20 s of ant time). */
export function step(world: World): void {
  const rng = Rng.over(world.rng);
  stepAnts({
    seed: world.seed,
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
      updateTemperature(farm, world.heatMat, params, seconds);
      if (world.step % WATER_EVERY === 0) updateWater(farm, params, WATER_EVERY / STEPS_PER_SECOND);
      stepBrood(world.brood, farm, params, seconds);
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

/**
 * The keeper takes a worker out of the tank (an experiment removing workers).
 * It lets go of whatever it held, and a nestmate it was feeding goes on its way.
 */
export function removeAnt(world: World, i: number): void {
  const { ants, brood } = world;
  const j = ants.partner[i]!;
  if (j >= 0 && ants.partner[j] === i) {
    ants.state[j] = AntState.wandering;
    ants.partner[j] = -1;
    ants.timer[j] = 0;
  }
  ants.partner[i] = -1;
  const k = ants.broodHeld[i]!;
  if (k >= 0) {
    brood.carried[k] = 0;
    brood.x[k] = ants.x[i]!;
    brood.y[k] = ants.y[i]!;
    ants.broodHeld[i] = -1;
  }
  if (ants.corpseHeld[i]! >= 0) dropCorpse(ctx(world), i);
  const carrier = ants.carriedBy[i]!;
  // A corpse taken out of its carrier's mandibles: the carrier goes on as if it had put it down.
  if (carrier >= 0) dropCorpse(ctx(world), carrier);
  ants.grain[i] = 0;
  ants.foodId[i] = -1;
  ants.place[i] = Place.gone;
  ants.corpseVersion++;
}

/** A worker dies where it is (an experiment with the dead). */
export function killAnt(world: World, i: number): void {
  die(ctx(world), i);
}

/** The ants' view of the world, for calling ant rules from outside a step. */
function ctx(world: World): AntContext {
  return {
    seed: world.seed,
    ants: world.ants,
    arena: world.arena,
    farm: world.farm,
    food: world.food,
    brood: world.brood,
    nest: world.nest,
    nestMode: world.nestMode,
    params: world.params,
    rng: Rng.over(world.rng),
  };
}

/**
 * Puts a worker's corpse down in the arena or the farm, dead `deadFor` tank
 * days (for experiments with the dead, as Theraulaz et al. 2002 put out
 * corpses). Returns its id.
 */
export function addCorpse(world: World, place: Place, x: number, y: number, deadFor: number, heading = 0): number {
  const { ants } = world;
  const k = addAnt(ants);
  ants.caste[k] = Caste.worker;
  ants.place[k] = place;
  ants.state[k] = AntState.dead;
  ants.x[k] = x;
  ants.y[k] = y;
  ants.heading[k] = heading;
  ants.deadFor[k] = deadFor;
  ants.corpseVersion++;
  return k;
}

/** The keeper puts the heat mat under the farm with its left edge at `x` mm, or takes it away (null). */
export function setHeatMat(world: World, x: number | null): void {
  world.heatMat = x === null ? null : { x: Math.max(0, Math.min(world.farm.width - MAT_WIDTH, x)), width: MAT_WIDTH };
}

/** The keeper waters the farm from above at `x` mm (M5b). Returns the water the soil took up, µL. */
export function water(world: World, x: number): number {
  return pourWater(world.farm, world.params, x);
}

/** Takes a drop away (the keeper cleaning up, or an experiment removing food). */
export function removeFood(world: World, id: number): void {
  world.food = world.food.filter((d) => d.id !== id);
}
