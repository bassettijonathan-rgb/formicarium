/**
 * The validation experiments (DESIGN.md section 9), as functions shared by
 * the tests in tests/science/ and the `npm run experiment` command.
 * Each run returns the numbers the original papers report.
 */
import { AntState, Caste, Place } from './ants';
import { BroodStage, addBrood, broodCounts } from './brood';
import { excavatedArea } from './farm';
import { Material } from './materials';
import { Purpose, Rng } from './rng';
import { doubleBridge, foodChoice, Tally } from './lab';
import type { AntParams } from './params';
import { STEPS_PER_SECOND } from './time';
import { colonyCrop, createWorld, placeProtein, placeSugar, removeAnt, removeFood, step, type World } from './world';

export interface RunOptions {
  seed: number;
  ants?: number;
  params?: Partial<AntParams>;
}

function run(world: World, tally: Tally, seconds: number): void {
  const steps = Math.round(seconds * STEPS_PER_SECOND);
  for (let s = 0; s < steps; s++) {
    step(world);
    tally.observe(world);
  }
}

export interface BridgeResult {
  /** Fraction of branch crossings on the upper (short) branch during the measuring window. */
  upperShare: number;
  crossings: number;
}

/**
 * Double bridge: run `minutes`, then report traffic over the last `windowMinutes`.
 * `longRatio` 2 is Goss et al.'s short/long bridge; 1 is the symmetric bridge.
 */
export function runDoubleBridge(
  opts: RunOptions & { longRatio: number; minutes?: number; windowMinutes?: number },
): BridgeResult {
  const minutes = opts.minutes ?? 30;
  const windowMinutes = opts.windowMinutes ?? 10;
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, nest: 'lab', params: opts.params ?? {} });
  const { zones } = doubleBridge(world, opts.longRatio);
  const tally = new Tally(world, zones);
  run(world, tally, (minutes - windowMinutes) * 60);
  const before = tally.snapshot();
  run(world, tally, windowMinutes * 60);
  const upper = tally.entries[0]! - before.entries[0]!;
  const lower = tally.entries[1]! - before.entries[1]!;
  const crossings = upper + lower;
  return { upperShare: crossings === 0 ? 0.5 : upper / crossings, crossings };
}

export interface ChoiceResult {
  /** Fraction of feeding visits at drop A during the measuring window. */
  shareA: number;
  visits: number;
}

/** Two sugar drops at equal distance; report where ants fed over the last `windowMinutes`. */
export function runFoodChoice(
  opts: RunOptions & { concentrationA: number; concentrationB: number; minutes?: number; windowMinutes?: number },
): ChoiceResult {
  const minutes = opts.minutes ?? 30;
  const windowMinutes = opts.windowMinutes ?? 10;
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, nest: 'lab', params: opts.params ?? {} });
  const { ids } = foodChoice(world, opts.concentrationA, opts.concentrationB);
  const tally = new Tally(world);
  run(world, tally, (minutes - windowMinutes) * 60);
  const before = tally.snapshot();
  run(world, tally, windowMinutes * 60);
  const a = (tally.visits.get(ids[0]) ?? 0) - (before.visits.get(ids[0]) ?? 0);
  const b = (tally.visits.get(ids[1]) ?? 0) - (before.visits.get(ids[1]) ?? 0);
  return { shareA: a + b === 0 ? 0.5 : a / (a + b), visits: a + b };
}

export interface DecayResult {
  /** Ants leaving the nest per minute while food is present (last 5 min before removal). */
  departuresWithFood: number;
  /** Ants leaving the nest per minute in the last 5 min of `minutesAfter`. */
  departuresAfter: number;
  /** Total trail pheromone on the floor at removal and at the end. */
  trailAtRemoval: number;
  trailAfter: number;
}

/** Trail decay: forage over the bridge, take the food away, watch recruitment and trail fade. */
export function runTrailDecay(opts: RunOptions & { minutesWithFood?: number; minutesAfter?: number }): DecayResult {
  const withFood = opts.minutesWithFood ?? 20;
  const after = opts.minutesAfter ?? 20;
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, nest: 'lab', params: opts.params ?? {} });
  const { zones, foodId } = doubleBridge(world, 1);
  const tally = new Tally(world, zones);
  run(world, tally, (withFood - 5) * 60);
  const s0 = tally.snapshot();
  run(world, tally, 5 * 60);
  const s1 = tally.snapshot();
  const trailAtRemoval = sum(world.arena.trail);
  removeFood(world, foodId);
  run(world, tally, (after - 5) * 60);
  const s2 = tally.snapshot();
  run(world, tally, 5 * 60);
  const s3 = tally.snapshot();
  return {
    departuresWithFood: (s1.departures - s0.departures) / 5,
    departuresAfter: (s3.departures - s2.departures) / 5,
    trailAtRemoval,
    trailAfter: sum(world.arena.trail),
  };
}

function sum(values: Float64Array): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export interface NestResult {
  /** Area dug out below the original surface at the end of each hour, mm². */
  areaByHour: number[];
}

/**
 * Nest size regulation (Rasse & Deneubourg 2001): a group of workers poured
 * onto fresh soil digs, fast at first, then slows as the nest gets roomier;
 * the size it settles at grows in proportion to the number of workers.
 */
export function runNestVolume(opts: RunOptions & { hours: number }): NestResult {
  const world = createWorld(opts.seed, { ants: opts.ants ?? 40, params: opts.params ?? {} });
  const areaByHour: number[] = [];
  for (let h = 0; h < opts.hours; h++) {
    for (let s = 0; s < 3600 * STEPS_PER_SECOND; s++) step(world);
    areaByHour.push(excavatedArea(world.farm));
  }
  return { areaByHour };
}

export interface FoodSpreadResult {
  /** Fraction of workers that have had food in their crop since the sugar went in, at the end of each minute. */
  fedByMinute: number[];
  /** Fraction of workers that went out to the arena since the sugar went in. */
  foragers: number;
  /** Tube departures per minute, and sugar in all crops (µL), at the end of each minute. */
  departuresByMinute: number[];
  cropByMinute: number[];
}

/**
 * Food spread (Planckaert et al. 2019, Lasius niger): a colony that has dug
 * its nest is starved, then a drop of 1 M sucrose goes in the arena. Count
 * how fast the workers get food in their crops, whether they fetched it
 * themselves or were fed by a nestmate.
 */
export function runFoodSpread(
  opts: RunOptions & { digMinutes?: number; minutes?: number; satiated?: boolean },
): FoodSpreadResult {
  const world = createWorld(opts.seed, { ants: opts.ants ?? 50, params: opts.params ?? {} });
  const { ants, params } = world;
  const settle = Math.round((opts.digMinutes ?? 60) * 60 * STEPS_PER_SECOND);
  for (let s = 0; s < settle; s++) step(world);
  // Starved (or, as a control, fed to the brim) before the food goes in; nobody remembers food.
  for (let i = 0; i < ants.count; i++) {
    ants.crop[i] = opts.satiated ? params.cropLoad : 0;
    ants.hasMemory[i] = 0;
  }
  placeSugar(world, 60, world.arena.entranceY, 200, 1);
  const fed = new Uint8Array(ants.count);
  const out = new Uint8Array(ants.count);
  const wasIn = new Uint8Array(ants.count);
  const fedByMinute: number[] = [];
  const departuresByMinute: number[] = [];
  const cropByMinute: number[] = [];
  const threshold = 0.1 * params.cropLoad;
  for (let m = 0; m < (opts.minutes ?? 60); m++) {
    let departures = 0;
    for (let s = 0; s < 60 * STEPS_PER_SECOND; s++) {
      for (let i = 0; i < ants.count; i++) wasIn[i] = ants.place[i] === Place.farm ? 1 : 0;
      step(world);
      for (let i = 0; i < ants.count; i++) {
        if (!opts.satiated && ants.crop[i]! >= threshold) fed[i] = 1;
        if (ants.place[i] === Place.arena) out[i] = 1;
        if (wasIn[i] && ants.place[i] === Place.tube) departures++;
      }
    }
    fedByMinute.push(sum8(fed) / ants.count);
    departuresByMinute.push(departures);
    cropByMinute.push(colonyCrop(world));
  }
  return { fedByMinute, foragers: sum8(out) / ants.count, departuresByMinute, cropByMinute };
}

function sum8(values: Uint8Array): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export interface GrowthDay {
  day: number;
  eggs: number;
  larvae: number;
  pupae: number;
  workers: number;
  /** The queen's protein reserve, µL. */
  reserve: number;
  /** How full the workers' crops are on average, 0 to 1. */
  crops: number;
}

/**
 * Colony growth (DESIGN.md section 7.1): a queen and her workers in the
 * farm, with a keeper who tops up a sugar drop and, unless `protein` is
 * false (the control), a crushed insect every tank day. Reports the brood
 * and workers at the end of each day.
 */
export function runColonyGrowth(opts: RunOptions & { days: number; protein?: boolean }): GrowthDay[] {
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, queen: true, params: opts.params ?? {} });
  const { params } = world;
  const daySteps = Math.round(params.daySeconds * STEPS_PER_SECOND);
  const out: GrowthDay[] = [];
  const y = world.arena.entranceY;
  for (let day = 1; day <= opts.days; day++) {
    // The keeper's daily round: fresh sugar water and, in the protein runs, an insect.
    world.food = [];
    placeSugar(world, 60, y - 15, 40, 1);
    if (opts.protein !== false) placeProtein(world, 60, y + 15, 10);
    for (let s = 0; s < daySteps; s++) step(world);
    let workers = 0;
    let reserve = 0;
    let crop = 0;
    for (let i = 0; i < world.ants.count; i++) {
      if (world.ants.caste[i] === Caste.worker) {
        workers++;
        crop += world.ants.crop[i]!;
      } else reserve = world.ants.reserve[i]!;
    }
    out.push({ day, ...broodCounts(world.brood), workers, reserve, crops: crop / workers / params.cropLoad });
  }
  return out;
}

export interface DivisionResult {
  /** Foraging trips out of the farm by the whole colony, each tank day. */
  tripsByDay: number[];
  /** How full the workers' crops are on average at the end of each tank day, 0 to 1. */
  cropsByDay: number[];
  /** Per worker at the end of the settling days: trips so far and fat. */
  tripsBefore: number[];
  fatBefore: number[];
  /** Workers the keeper took out (the busiest foragers), by id. */
  removed: number[];
  /** Per worker at the end: trips made after the removal, and fat. */
  tripsAfter: number[];
  fatAfter: number[];
  /** Per worker: age in tank days at the end. */
  age: number[];
}

/**
 * Division of labour (DESIGN.md section 7.5): a queen, her workers and brood
 * in the farm, fed sugar and an insect every tank day. After `days` the
 * keeper takes out the `removeShare` of workers that foraged most, and the
 * colony runs `afterDays` more: who takes over the foraging, and how fast?
 * As in forager-removal experiments (Robinson et al. 2009).
 */
export function runDivision(
  opts: RunOptions & { days: number; afterDays: number; removeShare: number },
): DivisionResult {
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, queen: true, params: opts.params ?? {} });
  const { ants, params } = world;
  const daySteps = Math.round(params.daySeconds * STEPS_PER_SECOND);
  const y = world.arena.entranceY;
  const tripsByDay: number[] = [];
  const cropsByDay: number[] = [];
  const total = () => {
    let n = 0;
    for (let i = 0; i < ants.count; i++) n += ants.trips[i]!;
    return n;
  };
  const day = () => {
    world.food = [];
    placeSugar(world, 60, y - 15, 40, 1);
    placeProtein(world, 60, y + 15, 10);
    const before = total();
    for (let s = 0; s < daySteps; s++) step(world);
    tripsByDay.push(total() - before);
    let crop = 0;
    let workers = 0;
    for (let i = 0; i < ants.count; i++) {
      if (ants.caste[i] !== Caste.worker || ants.place[i] === Place.gone) continue;
      crop += ants.crop[i]!;
      workers++;
    }
    cropsByDay.push(crop / workers / params.cropLoad);
  };
  for (let d = 0; d < opts.days; d++) day();
  const workers = [...Array(ants.count).keys()].filter((i) => ants.caste[i] === Caste.worker);
  const tripsBefore = workers.map((i) => ants.trips[i]!);
  const fatBefore = workers.map((i) => ants.fat[i]!);
  const busiest = [...workers].sort((a, b) => ants.trips[b]! - ants.trips[a]! || a - b);
  const removed = busiest.slice(0, Math.round(opts.removeShare * workers.length));
  for (const i of removed) removeAnt(world, i);
  for (let d = 0; d < opts.afterDays; d++) day();
  return {
    tripsByDay,
    cropsByDay,
    tripsBefore,
    fatBefore,
    removed,
    tripsAfter: workers.map((i, n) => ants.trips[i]! - tripsBefore[n]!),
    fatAfter: workers.map((i) => ants.fat[i]!),
    age: workers.map((i) => ants.age[i]!),
  };
}

export interface SortingResult {
  /**
   * For each brood item, the share of its three nearest items that are of
   * its own stage, averaged over all items, at the start and the end.
   */
  sameBefore: number;
  sameAfter: number;
  /** What that share would be if the stages were mixed at random. */
  random: number;
  /**
   * Piles: items closer than 4 mm, directly or through others, are one pile.
   * For each item, the share of its pile that is of its own stage, averaged
   * over the items, at the start and the end; and the number of piles of 3 or more items.
   */
  purityBefore: number;
  purityAfter: number;
  piles: number;
}

/** Piles (single linkage at `link` mm) and their purity by stage; see `SortingResult`. */
export function pilePurity(xs: number[], ys: number[], stages: number[], link = 4): { purity: number; piles: number } {
  const n = xs.length;
  const pile = new Int32Array(n).fill(-1);
  let piles = 0;
  let big = 0;
  let total = 0;
  for (let a = 0; a < n; a++) {
    if (pile[a] !== -1) continue;
    const members = [a];
    pile[a] = piles;
    for (let m = 0; m < members.length; m++) {
      const p = members[m]!;
      for (let b = 0; b < n; b++) {
        if (pile[b] !== -1 || (xs[b]! - xs[p]!) ** 2 + (ys[b]! - ys[p]!) ** 2 > link * link) continue;
        pile[b] = piles;
        members.push(b);
      }
    }
    piles++;
    if (members.length >= 3) big++;
    for (const p of members) total += members.filter((q) => stages[q] === stages[p]).length / members.length;
  }
  return { purity: total / n, piles: big };
}

/** Share of each item's `k` nearest other items that are of its own stage, averaged over the items. */
export function stageSegregation(xs: number[], ys: number[], stages: number[], k = 3): number {
  let total = 0;
  for (let a = 0; a < xs.length; a++) {
    const near = xs
      .map((x, b) => ({ b, d: (x - xs[a]!) ** 2 + (ys[b]! - ys[a]!) ** 2 }))
      .filter((e) => e.b !== a)
      .sort((p, q) => p.d - q.d || p.b - q.b)
      .slice(0, k);
    total += near.filter((e) => stages[e.b] === stages[a]).length / k;
  }
  return total / xs.length;
}

/**
 * Brood sorting (Franks & Sendova-Franks 1992; Deneubourg et al. 1991): eggs,
 * larvae and pupae, `perStage` of each, scattered at random through a closed
 * chamber 100 mm long and 10 mm high with `ants` workers. Development and
 * digging are switched off and nobody goes out; the workers only move brood.
 * Do the stages end up apart?
 */
export function runBroodSorting(opts: RunOptions & { hours: number; perStage?: number }): SortingResult {
  const params: Partial<AntParams> = {
    digRate: 0,
    forageRate: 0,
    returnToFoodRate: 0,
    burnRate: 0,
    nestTemperature: 0,
    larvaStarveDays: 1e9,
    ...opts.params,
  };
  const world = createWorld(opts.seed, { ants: opts.ants ?? 30, params });
  const { ants, brood, farm } = world;
  const rng = new Rng(opts.seed, Purpose.test);
  const x0 = 100;
  const x1 = 200;
  const y0 = Math.max(...Array.from(farm.surface.slice(x0, x1))) + 40;
  const y1 = y0 + 10;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      farm.material[y * farm.width + x] = Material.air;
      farm.loose[y * farm.width + x] = 0;
    }
  }
  const inside = () => [rng.range(x0 + 1, x1 - 1), rng.range(y0 + 1, y1 - 1)] as const;
  for (let i = 0; i < ants.count; i++) {
    [ants.x[i], ants.y[i]] = inside();
    ants.state[i] = AntState.wandering;
  }
  for (const stage of [BroodStage.egg, BroodStage.larva, BroodStage.pupa]) {
    for (let n = 0; n < (opts.perStage ?? 15); n++) {
      const [x, y] = inside();
      addBrood(brood, stage, x, y);
    }
  }
  const measure = () => {
    const xs: number[] = [];
    const ys: number[] = [];
    const st: number[] = [];
    for (let k = 0; k < brood.count; k++) {
      if (brood.stage[k] === BroodStage.none) continue;
      xs.push(brood.x[k]!);
      ys.push(brood.y[k]!);
      st.push(brood.stage[k]!);
    }
    return { same: stageSegregation(xs, ys, st), ...pilePurity(xs, ys, st) };
  };
  const before = measure();
  const steps = Math.round(opts.hours * 3600 * STEPS_PER_SECOND);
  for (let s = 0; s < steps; s++) step(world);
  const after = measure();
  const n = 3 * (opts.perStage ?? 15);
  const each = opts.perStage ?? 15;
  return {
    sameBefore: before.same,
    sameAfter: after.same,
    random: (each - 1) / (n - 1),
    purityBefore: before.purity,
    purityAfter: after.purity,
    piles: after.piles,
  };
}
