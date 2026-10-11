/**
 * Worker ants (DESIGN.md section 4): their data, and what they do in the
 * arena and the tube. Life in the farm is in farmAnts.ts.
 *
 * Each ant decides from what it can sense where it stands: trail pheromone at
 * its two antennae, nest scent near the entrance, a sugar drop within a few
 * mm, walls it bumps into, nestmates it touches, and its own path integrator
 * (a noisy running sum of how far it walked in which direction since it last
 * passed the tube). Nothing here reads where other ants are beyond touching
 * range, or where food is beyond smelling range.
 */
import { type Arena, depositTrail, isBlocked, sampleTrail } from './arena';
import type { Farm } from './farm';
import { computeContacts, stepFarmAnt } from './farmAnts';
import { type FoodDrop, dropRadius, foodQuality } from './food';
import type { AntParams } from './params';
import type { Rng } from './rng';
import { STEPS_PER_SECOND } from './time';

/** What an ant is doing. Stored in saves, so append-only. */
export const AntState = {
  /** Resting inside the nest (M1 does not draw the nest's inside). */
  inNest: 0,
  /** Wandering the arena looking for food. */
  exploring: 1,
  /** Drinking at a sugar drop. */
  feeding: 2,
  /** Carrying food home, laying trail. */
  returning: 3,
  /** Going home without food, laying no trail. */
  homing: 4,
  /** Heading back to food it found before, by path integration. */
  toFood: 5,
  /** Resting in the farm, leaving colony odour where it lies. */
  resting: 6,
  /** Walking about in the farm: may dig, rest, or set off to forage. */
  wandering: 7,
  /** Carrying a dug-out grain up to the open. */
  carrying: 8,
} as const;

export type AntState = (typeof AntState)[keyof typeof AntState];

/**
 * Where an ant is. Stored in saves, so append-only. In the farm, the states
 * exploring and toFood mean "on the way out to the tube", returning and
 * homing mean "on the way in from it".
 */
export const Place = {
  arena: 0,
  farm: 1,
  tube: 2,
} as const;

export type Place = (typeof Place)[keyof typeof Place];

/** All workers, as parallel arrays indexed by ant id. */
export interface Ants {
  count: number;
  state: Uint8Array;
  /** A `Place`. */
  place: Uint8Array;
  /** Position in the arena or the farm (see `place`), mm. */
  x: Float64Array;
  y: Float64Array;
  /** Direction of travel, radians (0 = +x, π/2 = +y). */
  heading: Float64Array;
  /** Steps left of the current rest, meal or tube walk; in the farm, steps spent carrying or coming in. */
  timer: Int32Array;
  /**
   * Where the ant believes it is (path integration), mm: in the arena,
   * relative to the entrance; in the farm, relative to the tube's mouth.
   */
  piX: Float64Array;
  piY: Float64Array;
  /** Remembered food position in path-integration coordinates, if `hasMemory`. */
  memX: Float64Array;
  memY: Float64Array;
  hasMemory: Uint8Array;
  /** Id of the drop the ant is drinking from, or -1. */
  foodId: Int32Array;
  /** Sugar water in the crop, µL, and the quality of the food it came from. */
  crop: Float64Array;
  cropQuality: Float64Array;
  /** Total distance walked, mm; the renderer uses it to animate the legs. */
  walked: Float64Array;
  /** The `Material` of the grain in the ant's mandibles (0 = none) and its moisture. */
  grain: Uint8Array;
  grainMoisture: Uint8Array;
  /** How often the ant has met nestmates lately, contacts per second. */
  encounters: Float64Array;
  /** Urge to go foraging, raised by meeting foragers just back with food. */
  excitement: Float64Array;
  /** Steps left during which this forager, just back with food, excites the ants it meets. */
  recruiting: Int32Array;
  /** 1 once the ant has come in through the tube, so its farm path integrator points to the tube. */
  knowsTube: Uint8Array;
  /**
   * Where the ant last dug, in path-integration coordinates, if `hasDigSite`:
   * after dumping its grain a digger walks back to the same face (site fidelity).
   */
  digX: Float64Array;
  digY: Float64Array;
  hasDigSite: Uint8Array;
  /** Steps a carrying ant has walked out in the open; it dumps its grain only well away from the hole. */
  carryOut: Int32Array;
}

export function createAnts(count: number): Ants {
  return {
    count,
    state: new Uint8Array(count),
    place: new Uint8Array(count),
    x: new Float64Array(count),
    y: new Float64Array(count),
    heading: new Float64Array(count),
    timer: new Int32Array(count),
    piX: new Float64Array(count),
    piY: new Float64Array(count),
    memX: new Float64Array(count),
    memY: new Float64Array(count),
    hasMemory: new Uint8Array(count),
    foodId: new Int32Array(count).fill(-1),
    crop: new Float64Array(count),
    cropQuality: new Float64Array(count),
    walked: new Float64Array(count),
    grain: new Uint8Array(count),
    grainMoisture: new Uint8Array(count),
    encounters: new Float64Array(count),
    excitement: new Float64Array(count),
    recruiting: new Int32Array(count),
    knowsTube: new Uint8Array(count),
    digX: new Float64Array(count),
    digY: new Float64Array(count),
    hasDigSite: new Uint8Array(count),
    carryOut: new Int32Array(count),
  };
}

/** What the nest holds as a whole. */
export interface Nest {
  /** Sugar water brought home, µL. */
  stores: number;
  /**
   * Lab nest only: excitement from recently returned foragers (see
   * `AntParams.recruitRate`). In the farm each ant has its own.
   */
  excitement: number;
}

/**
 * "lab": the nest is a small box behind the arena's entrance, as in the lab
 * experiments of section 9; ants inside are not simulated one by one.
 * "farm": the colony lives in the sand farm and reaches the arena by the tube.
 */
export type NestMode = 'lab' | 'farm';

/** Distance from the entrance at which a returning ant counts as home, mm. */
const HOME_RADIUS = 2.5;
/** How close an ant must get to a remembered food spot before it gives up on it, mm. */
const MEMORY_RADIUS = 4;

export const DT = 1 / STEPS_PER_SECOND;

export interface AntContext {
  ants: Ants;
  arena: Arena;
  farm: Farm;
  food: FoodDrop[];
  nest: Nest;
  nestMode: NestMode;
  params: AntParams;
  rng: Rng;
}

/** Advances every ant by one step, in id order. */
export function stepAnts(ctx: AntContext): void {
  const { ants, nest, params } = ctx;
  if (ctx.nestMode === 'lab') nest.excitement *= Math.pow(0.5, DT / params.excitementHalfLife);
  else computeContacts(ctx);
  for (let i = 0; i < ants.count; i++) {
    const place = ants.place[i]!;
    const state = ants.state[i]!;
    if (place === Place.tube) walkTube(ctx, i);
    else if (place === Place.farm) stepFarmAnt(ctx, i);
    else if (state === AntState.inNest) restInNest(ctx, i);
    else if (state === AntState.feeding) feed(ctx, i);
    else walk(ctx, i);
  }
}

/** True for the states that mean "heading out to forage". */
export function isOutbound(state: number): boolean {
  return state === AntState.exploring || state === AntState.toFood;
}

/** Starts walking through the tube; `outbound` ants come out in the arena, the others in the farm. */
export function enterTube(ctx: AntContext, i: number): void {
  ctx.ants.place[i] = Place.tube;
  ctx.ants.timer[i] = Math.round(ctx.params.tubeTime * STEPS_PER_SECOND);
}

function walkTube(ctx: AntContext, i: number): void {
  const { ants, arena, farm, rng } = ctx;
  if (ants.timer[i]! > 0) {
    ants.timer[i]!--;
    ants.walked[i]! += ctx.params.speed * DT;
    return;
  }
  // Out of the tube: path integration starts again from its mouth, the one landmark both ends share.
  ants.piX[i] = 0;
  ants.piY[i] = 0;
  if (isOutbound(ants.state[i]!)) {
    ants.place[i] = Place.arena;
    ants.x[i] = arena.entranceX;
    ants.y[i] = arena.entranceY;
    ants.heading[i] = rng.range(-1, 1);
  } else {
    ants.place[i] = Place.farm;
    ants.x[i] = farm.tubeX;
    ants.y[i] = farm.tubeY;
    ants.heading[i] = Math.PI + rng.range(-1, 1);
    ants.knowsTube[i] = 1;
    ants.timer[i] = 0;
  }
}

function restInNest(ctx: AntContext, i: number): void {
  const { ants, params, nest, rng } = ctx;
  if (ants.timer[i]! > 0) {
    ants.timer[i]!--;
    return;
  }
  const own = ants.hasMemory[i] ? params.returnToFoodRate : params.leaveRate;
  const rate = own + params.recruitRate * nest.excitement;
  if (!rng.chance(rate * DT)) return;
  ants.state[i] = ants.hasMemory[i] ? AntState.toFood : AntState.exploring;
  ants.x[i] = ctx.arena.entranceX;
  ants.y[i] = ctx.arena.entranceY;
  ants.heading[i] = rng.range(-1, 1); // out of the tube, roughly into the arena
  ants.piX[i] = 0;
  ants.piY[i] = 0;
}

function feed(ctx: AntContext, i: number): void {
  const { ants, food, params } = ctx;
  if (ants.timer[i]! > 0) {
    ants.timer[i]!--;
    return;
  }
  const drop = food.find((d) => d.id === ants.foodId[i]);
  ants.foodId[i] = -1;
  if (drop && drop.volume > 0) {
    const take = Math.min(params.cropLoad, drop.volume);
    drop.volume -= take;
    ants.crop[i] = take;
    ants.cropQuality[i] = foodQuality(drop.concentration, params);
    ants.memX[i] = ants.piX[i]!;
    ants.memY[i] = ants.piY[i]!;
    ants.hasMemory[i] = 1;
    ants.state[i] = AntState.returning;
  } else {
    // The drop was used up while drinking: nothing to carry, nothing to remember.
    ants.hasMemory[i] = 0;
    ants.state[i] = AntState.exploring;
  }
  ants.heading[i]! += Math.PI;
}

function walk(ctx: AntContext, i: number): void {
  const { ants, arena, params, rng } = ctx;
  const state = ants.state[i]!;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  let heading = ants.heading[i]!;

  // 1. Random turning (a correlated random walk).
  let turn = rng.normal(0, params.wiggle * Math.sqrt(DT));

  // 2. Trail following: turn towards the antenna that smells more (Weber's law).
  const leftAngle = heading - params.antennaAngle;
  const rightAngle = heading + params.antennaAngle;
  const reach = params.antennaReach;
  const lx = x + reach * Math.cos(leftAngle);
  const ly = y + reach * Math.sin(leftAngle);
  const rx = x + reach * Math.cos(rightAngle);
  const ry = y + reach * Math.sin(rightAngle);
  const trailL = sampleTrail(arena, lx, ly);
  const trailR = sampleTrail(arena, rx, ry);
  const trailSum = trailL + trailR;
  if (trailSum > params.trailThreshold) turn += params.trailTurn * DT * ((trailR - trailL) / trailSum);

  // 3. Goals from path integration.
  const piDist = Math.hypot(ants.piX[i]!, ants.piY[i]!);
  let goal: number | undefined;
  let goalStrength = 0;
  if (state === AntState.returning || state === AntState.homing) {
    const dEntrance = Math.hypot(x - arena.entranceX, y - arena.entranceY);
    if (dEntrance < params.nestScentRange) {
      // Close to home: follow the nest's scent, sensed at the antennae.
      const scentL = nestScent(arena, lx, ly, params);
      const scentR = nestScent(arena, rx, ry, params);
      turn += params.trailTurn * DT * ((scentR - scentL) / (scentL + scentR));
    }
    if (piDist > 1) {
      goal = Math.atan2(-ants.piY[i]!, -ants.piX[i]!);
      goalStrength = params.goalTurn;
    }
  } else if (state === AntState.toFood) {
    const dx = ants.memX[i]! - ants.piX[i]!;
    const dy = ants.memY[i]! - ants.piY[i]!;
    if (Math.hypot(dx, dy) < MEMORY_RADIUS) {
      // Arrived where the food was and found none: forget it and search.
      ants.hasMemory[i] = 0;
      ants.state[i] = AntState.exploring;
    } else {
      goal = Math.atan2(dy, dx);
      goalStrength = params.goalTurn;
    }
  } else if (state === AntState.exploring && piDist > 1) {
    goal = Math.atan2(ants.piY[i]!, ants.piX[i]!);
    goalStrength = params.outwardTurn;
  }
  if (goal !== undefined) {
    const off = goal - heading;
    turn += goalStrength * DT * Math.sin(off);
    // U-turns: an ant heading away from where it means to go sometimes turns right round.
    if (state !== AntState.exploring) {
      const away = -Math.cos(off);
      if (away > 0 && rng.chance(params.uTurnRate * away * DT)) turn += Math.PI;
    }
  }

  // 4. Food within smelling range pulls a searching ant straight to it.
  if (ants.state[i] === AntState.exploring || ants.state[i] === AntState.toFood) {
    const near = nearestDrop(ctx, x, y, params.foodSenseRange);
    if (near) turn = angleDiff(Math.atan2(near.y - y, near.x - x), heading);
  }

  heading = wrapAngle(heading + turn);

  // 5. Move, sliding along walls when blocked, and update the path integrator.
  const stepLength = params.speed * DT;
  if (!moveAnt(ctx, i, heading, stepLength, (px, py) => isBlocked(arena, px, py))) return;
  const nx = ants.x[i]!;
  const ny = ants.y[i]!;

  // 7. Lay trail on the way home from food, more for better food.
  const now = ants.state[i]!;
  if (now === AntState.returning && params.trailLaying) {
    depositTrail(arena, nx, ny, params.trailDeposit * stepLength * ants.cropQuality[i]!);
  }

  // 8. Arrivals and decisions.
  if (now === AntState.returning || now === AntState.homing) {
    if (Math.hypot(nx - arena.entranceX, ny - arena.entranceY) < HOME_RADIUS) {
      if (ctx.nestMode === 'lab') enterNest(ctx, i);
      else enterTube(ctx, i);
    }
  } else {
    const drop = nearestDrop(ctx, nx, ny, 1);
    if (drop) {
      ants.state[i] = AntState.feeding;
      ants.foodId[i] = drop.id;
      ants.timer[i] = Math.round(params.feedTime * STEPS_PER_SECOND);
    } else if (now === AntState.exploring && rng.chance(DT / params.exploreTime)) {
      ants.state[i] = AntState.homing;
    }
  }
}

function enterNest(ctx: AntContext, i: number): void {
  const { ants, nest, params } = ctx;
  if (ants.crop[i]! > 0) {
    nest.stores += ants.crop[i]!;
    nest.excitement += params.recruitPerReturn * ants.cropQuality[i]!;
    ants.crop[i] = 0;
  }
  ants.state[i] = AntState.inNest;
  ants.timer[i] = Math.round(params.restTime * STEPS_PER_SECOND);
}

/**
 * Steps the ant forward along `heading`; if the way is blocked, tries
 * turning further and further to either side (it slides along the wall), and
 * if every way is blocked it turns round and stays put. Updates position,
 * heading, distance walked and the path integrator. Returns true if it moved.
 */
export function moveAnt(
  ctx: AntContext,
  i: number,
  heading: number,
  stepLength: number,
  blocked: (x: number, y: number) => boolean,
): boolean {
  const { ants, params, rng } = ctx;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  let nx = x + stepLength * Math.cos(heading);
  let ny = y + stepLength * Math.sin(heading);
  if (blocked(nx, ny)) {
    const side = rng.chance(0.5) ? 1 : -1;
    let moved = false;
    for (let k = 1; k <= 8 && !moved; k++) {
      for (const sign of [side, -side]) {
        const h = heading + sign * k * 0.35;
        const tx = x + stepLength * Math.cos(h);
        const ty = y + stepLength * Math.sin(h);
        if (!blocked(tx, ty)) {
          heading = wrapAngle(h);
          nx = tx;
          ny = ty;
          moved = true;
          break;
        }
      }
    }
    if (!moved) {
      ants.heading[i] = wrapAngle(heading + Math.PI);
      return false;
    }
  }
  ants.x[i] = nx;
  ants.y[i] = ny;
  ants.heading[i] = heading;
  ants.walked[i]! += stepLength;

  // Path integration: the ant adds up the steps it believes it took.
  const believed = heading + rng.normal(0, params.piNoise);
  ants.piX[i]! += stepLength * Math.cos(believed);
  ants.piY[i]! += stepLength * Math.sin(believed);
  return true;
}

/** The first drop (in id order) whose edge is within `range` mm of (x, y). */
function nearestDrop(ctx: AntContext, x: number, y: number, range: number): FoodDrop | undefined {
  let best: FoodDrop | undefined;
  let bestGap = range;
  for (const drop of ctx.food) {
    if (drop.volume <= 0) continue;
    const gap = Math.hypot(drop.x - x, drop.y - y) - dropRadius(drop.volume);
    if (gap <= bestGap) {
      best = drop;
      bestGap = gap;
    }
  }
  return best;
}

/** Nest scent at a point: strongest at the entrance, fading over a few cm. */
function nestScent(arena: Arena, x: number, y: number, params: AntParams): number {
  const d = Math.hypot(x - arena.entranceX, y - arena.entranceY);
  return Math.exp(-d / (params.nestScentRange / 3));
}

export function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

export function angleDiff(to: number, from: number): number {
  return wrapAngle(to - from);
}
