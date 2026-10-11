/**
 * The validation experiments (DESIGN.md section 9), as functions shared by
 * the tests in tests/science/ and the `npm run experiment` command.
 * Each run returns the numbers the original papers report.
 */
import { doubleBridge, foodChoice, Tally } from './lab';
import type { AntParams } from './params';
import { STEPS_PER_SECOND } from './time';
import { createWorld, removeFood, step, type World } from './world';

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
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, params: opts.params ?? {} });
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
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, params: opts.params ?? {} });
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
  const world = createWorld(opts.seed, { ants: opts.ants ?? 60, params: opts.params ?? {} });
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
