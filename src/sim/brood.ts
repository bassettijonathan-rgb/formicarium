/**
 * Brood in the farm (DESIGN.md section 7.1): eggs, larvae and pupae, as
 * parallel arrays. Each item lies where it was laid; nurses feed larvae
 * where they lie (carrying and sorting brood comes in M4).
 *
 * Development runs on the life clock (D6) at a rate that rises in a straight
 * line with temperature above `developmentZero` (degree-days). A larva grows
 * only while it has food in it: it eats its way through the stage, and an
 * unfed larva waits and begs.
 */
import { type Farm, addToField } from './farm';
import { temperatureAt } from './heat';
import { mouldAt } from './mould';
import { humidityAt } from './water';
import type { AntParams } from './params';

/** Stage of a brood item. Stored in saves, so append-only. */
export const BroodStage = {
  /** An empty slot: the item hatched into a worker or was removed. */
  none: 0,
  egg: 1,
  larva: 2,
  pupa: 3,
} as const;

export type BroodStage = (typeof BroodStage)[keyof typeof BroodStage];

export interface Brood {
  count: number;
  stage: Uint8Array;
  /** Position in the farm, mm. */
  x: Float64Array;
  y: Float64Array;
  /** How far through its stage the item is, 0 to 1. */
  progress: Float64Array;
  /** Larvae: protein-rich food eaten but not yet used for growth, µL. */
  food: Float64Array;
  /** Larvae: how long the larva has had no food, seconds of ant time. */
  unfed: Float64Array;
  /** 1 while a worker carries the item. */
  carried: Uint8Array;
  /** How long the item has lain in dry air, net of time in damp air, seconds of ant time (M5b). */
  dry: Float64Array;
  /** Brood that has died of drying out, since the tank was set up. */
  dried: number;
  /** How long the item has lain in mould, net of time out of it, seconds of ant time (M5b). */
  mouldy: Float64Array;
  /** Brood killed by mould, since the tank was set up. */
  moulded: number;
}

export function createBrood(capacity = 0): Brood {
  return {
    count: 0,
    stage: new Uint8Array(capacity),
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    progress: new Float64Array(capacity),
    food: new Float64Array(capacity),
    unfed: new Float64Array(capacity),
    carried: new Uint8Array(capacity),
    dry: new Float64Array(capacity),
    dried: 0,
    mouldy: new Float64Array(capacity),
    moulded: 0,
  };
}

/** Adds a brood item, reusing an empty slot (lowest index first) or growing the arrays. Returns its index. */
export function addBrood(brood: Brood, stage: BroodStage, x: number, y: number): number {
  let k = brood.stage.indexOf(BroodStage.none);
  if (k < 0 || k >= brood.count) {
    k = brood.count;
    if (k >= brood.stage.length) growBrood(brood, Math.max(16, 2 * brood.stage.length));
    brood.count++;
  }
  brood.stage[k] = stage;
  brood.x[k] = x;
  brood.y[k] = y;
  brood.progress[k] = 0;
  brood.food[k] = 0;
  brood.unfed[k] = 0;
  brood.carried[k] = 0;
  brood.dry[k] = 0;
  brood.mouldy[k] = 0;
  return k;
}

function growBrood(brood: Brood, capacity: number): void {
  const grow = <T extends Uint8Array | Float64Array>(a: T, make: (n: number) => T): T => {
    const b = make(capacity);
    b.set(a);
    return b;
  };
  brood.stage = grow(brood.stage, (n) => new Uint8Array(n));
  brood.x = grow(brood.x, (n) => new Float64Array(n));
  brood.y = grow(brood.y, (n) => new Float64Array(n));
  brood.progress = grow(brood.progress, (n) => new Float64Array(n));
  brood.food = grow(brood.food, (n) => new Float64Array(n));
  brood.unfed = grow(brood.unfed, (n) => new Float64Array(n));
  brood.carried = grow(brood.carried, (n) => new Uint8Array(n));
  brood.dry = grow(brood.dry, (n) => new Float64Array(n));
  brood.mouldy = grow(brood.mouldy, (n) => new Float64Array(n));
}

/** Brood items of stage `from` or later within `radius` mm of (x, y), not counting item `skip` or items being carried. */
export function broodNear(
  brood: Brood,
  x: number,
  y: number,
  radius: number,
  skip = -1,
  from: BroodStage = BroodStage.egg,
): number {
  const r2 = radius * radius;
  let n = 0;
  for (let k = 0; k < brood.count; k++) {
    if (k === skip || brood.stage[k]! < from || brood.carried[k]) continue;
    const dx = brood.x[k]! - x;
    const dy = brood.y[k]! - y;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}

/**
 * Brood within `radius` mm of (x, y) as a worker sorting brood senses it
 * round an item of `stage`: items of the same stage count fully, the others
 * at `otherWeight` (not counting item `skip` or items being carried).
 */
export function broodLike(
  brood: Brood,
  x: number,
  y: number,
  radius: number,
  stage: BroodStage,
  otherWeight: number,
  skip = -1,
): number {
  const r2 = radius * radius;
  let n = 0;
  for (let k = 0; k < brood.count; k++) {
    const s = brood.stage[k]!;
    if (k === skip || s === BroodStage.none || brood.carried[k]) continue;
    const dx = brood.x[k]! - x;
    const dy = brood.y[k]! - y;
    if (dx * dx + dy * dy <= r2) n += s === stage ? 1 : otherWeight;
  }
  return n;
}

/** Fraction of a stage that a tank day at `celsius` completes: a day at 25 °C does 1/`stageDays` (degree-days). */
export function stageRate(stageDays: number, params: AntParams, celsius: number): number {
  const effective = Math.max(0, celsius - params.developmentZero);
  return effective / ((25 - params.developmentZero) * stageDays);
}

/** True for a larva that has gone without food so long that it is dying: nurses eat it. */
export function larvaStarved(brood: Brood, k: number, params: AntParams): boolean {
  return brood.stage[k] === BroodStage.larva && brood.unfed[k]! > params.larvaStarveDays * params.daySeconds;
}

/** True for a larva that would take food: it holds less than its share of a meal. */
export function larvaHungry(brood: Brood, k: number, params: AntParams): boolean {
  return brood.stage[k] === BroodStage.larva && brood.food[k]! < params.larvaBegBelow * params.larvaFood;
}

/**
 * Advances every item's development by `seconds` of ant time. Eggs hatch
 * into larvae; larvae eat their food as they grow and stop when it runs out;
 * pupae reach the point of eclosion and wait for a worker to help them out
 * of the cocoon (see `farmAnts.ts`). Brood left in dry air dies.
 */
export function stepBrood(brood: Brood, farm: Farm, params: AntParams, seconds: number): void {
  const days = seconds / params.daySeconds;
  for (let k = 0; k < brood.count; k++) {
    const stage = brood.stage[k];
    if (stage === BroodStage.none) continue;
    // Each item develops at the temperature where it lies (M5a).
    const celsius = temperatureAt(farm, brood.x[k]!, brood.y[k]!);
    const egg = stageRate(params.eggDays, params, celsius) * days;
    const larva = stageRate(params.larvaDays, params, celsius) * days;
    const pupa = stageRate(params.pupaDays, params, celsius) * days;
    // Brood in dry air loses water and dies in about `broodDryDays` (once put down); damp air lets it recover (M5b).
    const damp = humidityAt(farm, brood.x[k]!, brood.y[k]!) >= params.broodDryHumidity;
    brood.dry[k] = damp ? Math.max(0, brood.dry[k]! - seconds) : brood.dry[k]! + seconds;
    if (brood.dry[k]! > params.broodDryDays * params.daySeconds && !brood.carried[k]) {
      brood.stage[k] = BroodStage.none;
      brood.dried++;
      continue;
    }
    // Brood lying in mould dies in about `mouldKillDays` (M5b).
    if (farm.mouldy > 0 || brood.mouldy[k]! > 0) {
      const inMould = mouldAt(farm, brood.x[k]!, brood.y[k]!) >= params.mouldHarm;
      brood.mouldy[k] = inMould ? brood.mouldy[k]! + seconds : Math.max(0, brood.mouldy[k]! - seconds);
      if (brood.mouldy[k]! > params.mouldKillDays * params.daySeconds && !brood.carried[k]) {
        brood.stage[k] = BroodStage.none;
        brood.moulded++;
        continue;
      }
    }
    if (stage === BroodStage.egg) {
      brood.progress[k]! += egg;
      if (brood.progress[k]! >= 1) {
        brood.stage[k] = BroodStage.larva;
        brood.progress[k] = 0;
      }
    } else if (stage === BroodStage.larva) {
      // Growth needs food: a larva eats `larvaFood` over its stage, so it can only get as far as its food takes it.
      const step = Math.min(larva, brood.food[k]! / params.larvaFood);
      brood.progress[k]! += step;
      brood.food[k] = Math.max(0, brood.food[k]! - step * params.larvaFood);
      brood.unfed[k] = step < larva ? brood.unfed[k]! + seconds : 0;
      if (brood.progress[k]! >= 1) {
        brood.stage[k] = BroodStage.pupa;
        brood.progress[k] = 0;
        brood.food[k] = 0;
      }
    } else if (stage === BroodStage.pupa) {
      brood.progress[k] = Math.min(1, brood.progress[k]! + pupa);
    }
  }
}

/**
 * The brood's smells, added to the farm's fields every few seconds. All brood
 * smells of the colony, like resting nestmates, so workers settle round it
 * (M3c's cue for the nest, brought forward). Hungry larvae also give off a
 * scent that spreads through the nest; workers carrying protein follow it to
 * them (`farmAnts.ts`). It stands in for the cues by which nurses find the
 * brood: brood pheromones and larval begging (rough; its range is set so
 * food reaches brood anywhere in the farm).
 */
export function scentBrood(brood: Brood, farm: Farm, params: AntParams, seconds: number): void {
  for (let k = 0; k < brood.count; k++) {
    if (brood.stage[k] === BroodStage.none) continue;
    addToField(farm, farm.odour, brood.x[k]!, brood.y[k]!, params.broodOdour * seconds);
    if (larvaHungry(brood, k, params)) addToField(farm, farm.broodScent, brood.x[k]!, brood.y[k]!, params.broodScentDeposit * seconds);
  }
}

/** Counts of eggs, larvae and pupae. */
export function broodCounts(brood: Brood): { eggs: number; larvae: number; pupae: number } {
  let eggs = 0;
  let larvae = 0;
  let pupae = 0;
  for (let k = 0; k < brood.count; k++) {
    if (brood.stage[k] === BroodStage.egg) eggs++;
    else if (brood.stage[k] === BroodStage.larva) larvae++;
    else if (brood.stage[k] === BroodStage.pupa) pupae++;
  }
  return { eggs, larvae, pupae };
}
