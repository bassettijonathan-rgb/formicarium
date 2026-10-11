/**
 * Worker ants in the arena (DESIGN.md section 4).
 *
 * Each ant decides from what it can sense where it stands: trail pheromone at
 * its two antennae, nest scent near the entrance, a sugar drop within a few
 * mm, walls it bumps into, and its own path integrator (a noisy running sum
 * of how far it walked in which direction since leaving the nest). Nothing
 * here reads where other ants are or where food is beyond that range.
 */
import { type Arena, depositTrail, isBlocked, sampleTrail } from './arena';
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
} as const;

export type AntState = (typeof AntState)[keyof typeof AntState];

/** All workers, as parallel arrays indexed by ant id. */
export interface Ants {
  count: number;
  state: Uint8Array;
  /** Position in the arena, mm. */
  x: Float64Array;
  y: Float64Array;
  /** Direction of travel, radians (0 = +x, π/2 = +y). */
  heading: Float64Array;
  /** Steps left of the current rest or meal. */
  timer: Int32Array;
  /** Where the ant believes it is relative to the nest entrance (path integration), mm. */
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
}

export function createAnts(count: number): Ants {
  return {
    count,
    state: new Uint8Array(count),
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
  };
}

/** What the nest knows as a whole. A stand-in until M3 models the nest's inside. */
export interface Nest {
  /** Sugar water brought home, µL. */
  stores: number;
  /** Excitement from recently returned foragers (see `AntParams.recruitRate`). */
  excitement: number;
}

/** Distance from the entrance at which a returning ant counts as home, mm. */
const HOME_RADIUS = 2.5;
/** How close an ant must get to a remembered food spot before it gives up on it, mm. */
const MEMORY_RADIUS = 4;

const DT = 1 / STEPS_PER_SECOND;

export interface AntContext {
  ants: Ants;
  arena: Arena;
  food: FoodDrop[];
  nest: Nest;
  params: AntParams;
  rng: Rng;
}

/** Advances every ant by one step, in id order. */
export function stepAnts(ctx: AntContext): void {
  const { ants, nest, params } = ctx;
  nest.excitement *= Math.pow(0.5, DT / params.excitementHalfLife);
  for (let i = 0; i < ants.count; i++) {
    const state = ants.state[i]!;
    if (state === AntState.inNest) restInNest(ctx, i);
    else if (state === AntState.feeding) feed(ctx, i);
    else walk(ctx, i);
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

  // 5. Move, sliding along walls when blocked.
  const stepLength = params.speed * DT;
  let nx = x + stepLength * Math.cos(heading);
  let ny = y + stepLength * Math.sin(heading);
  if (isBlocked(arena, nx, ny)) {
    const side = rng.chance(0.5) ? 1 : -1;
    let moved = false;
    for (let k = 1; k <= 8 && !moved; k++) {
      for (const sign of [side, -side]) {
        const h = heading + sign * k * 0.35;
        const tx = x + stepLength * Math.cos(h);
        const ty = y + stepLength * Math.sin(h);
        if (!isBlocked(arena, tx, ty)) {
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
      return;
    }
  }
  ants.x[i] = nx;
  ants.y[i] = ny;
  ants.heading[i] = heading;
  ants.walked[i]! += stepLength;

  // 6. Path integration: the ant adds up the steps it believes it took.
  const believed = heading + rng.normal(0, params.piNoise);
  ants.piX[i]! += stepLength * Math.cos(believed);
  ants.piY[i]! += stepLength * Math.sin(believed);

  // 7. Lay trail on the way home from food, more for better food.
  const now = ants.state[i]!;
  if (now === AntState.returning && params.trailLaying) {
    depositTrail(arena, nx, ny, params.trailDeposit * stepLength * ants.cropQuality[i]!);
  }

  // 8. Arrivals and decisions.
  if (now === AntState.returning || now === AntState.homing) {
    if (Math.hypot(nx - arena.entranceX, ny - arena.entranceY) < HOME_RADIUS) enterNest(ctx, i);
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

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

function angleDiff(to: number, from: number): number {
  return wrapAngle(to - from);
}
