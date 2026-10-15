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
import { type Arena, depositTrail, floorStep, isBlocked, sampleTrail } from './arena';
import type { Brood } from './brood';
import type { Farm } from './farm';
import { dieOfAge, endure, holdCorpse, mayDropCorpse, tryPickUpCorpse } from './corpses';
import { computeContacts, stepFarmAnt } from './farmAnts';
import { speedAt } from './heat';
import { type FoodDrop, foodQuality, foodReach } from './food';
import { type Piece, deliverToLabNest, holdPiece, nearestPiece, pieceReach, startAtPrey, workAtPrey } from './prey';
import { isMajor, laysTrail, majorResponse, seedCapacity } from './sizes';
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
  /** Mouth to mouth with a nestmate, passing food (trophallaxis). */
  sharing: 9,
  /** Carrying a brood item to where other brood lies (M3b). */
  carryingBrood: 10,
  /** Carrying a corpse out of the nest, through the tube and away into the arena (M4c). */
  carryingCorpse: 11,
  /** Dead: a corpse, lying where it fell or where it was put down (M4c). */
  dead: 12,
  /** At a feeder insect: biting a part off it, biting it open, or drinking from it (Arena 3). */
  atPrey: 13,
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
  /** Taken out of the tank by the keeper (an experiment removing workers): no longer simulated. */
  gone: 3,
} as const;

export type Place = (typeof Place)[keyof typeof Place];

/** Which kind of ant. Stored in saves, so append-only. */
export const Caste = {
  worker: 0,
  queen: 1,
} as const;

export type Caste = (typeof Caste)[keyof typeof Caste];

/** What an ant died of (none while alive). Stored in saves, so append-only. */
export const Cause = {
  none: 0,
  age: 1,
  hunger: 2,
  drying: 3,
  heat: 4,
  /** Killed by the keeper or an experiment. */
  killed: 5,
} as const;

export type Cause = (typeof Cause)[keyof typeof Cause];

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
  /** 1 if the remembered food was protein (an insect), 0 if sugar water. */
  memoryProtein: Uint8Array;
  /**
   * What a forager is out for, set when it leaves the farm (M3b): 1 for
   * protein, 0 for sugar water. It passes the other kind of food by.
   */
  seekProtein: Uint8Array;
  /** Id of the drop the ant is drinking from, or -1. */
  foodId: Int32Array;
  /**
   * Sugar water in the crop, µL, and how strongly the last meal moves the ant
   * to lay trail and recruit: the food's quality times the fraction of a full
   * crop it drank there.
   */
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
  /** How alarmed the ant is, 0 to 1 (a species that takes alarm, DESIGN.md 4.4; always 0 for Lasius niger). */
  alarm: Float64Array;
  /**
   * How strongly the ant feels the brood's hunger for protein, 0 to 1: from
   * smelling hungry brood, or passed on by nestmates it touches (M3b).
   */
  broodNeed: Float64Array;
  /** Steps left during which this forager, just back with food, excites the ants it meets. */
  recruiting: Int32Array;
  /**
   * Pheidole (DESIGN.md 4.4): -1 while a minor walks home from an insect too
   * big to move, to invite majors; once home, the steps left during which it
   * invites the majors it meets. 0 otherwise, and always for other species.
   */
  invite: Int32Array;
  /** Pheidole majors: how strongly minors back from big prey have invited this major, on the scale of `excitement`. */
  called: Float64Array;
  /** 1 once the ant has come in through the tube, so its farm path integrator points to the tube. */
  knowsTube: Uint8Array;
  /**
   * Where the ant last came out of the soil into the open, in path-integration
   * coordinates, if `hasHole`: its way back into the nest (M3b).
   */
  holeX: Float64Array;
  holeY: Float64Array;
  hasHole: Uint8Array;
  /** The brood item the ant is carrying, or -1. */
  broodHeld: Int32Array;
  /**
   * Where the ant last dug, in path-integration coordinates, if `hasDigSite`:
   * after dumping its grain a digger walks back to the same face (site fidelity).
   */
  digX: Float64Array;
  digY: Float64Array;
  hasDigSite: Uint8Array;
  /** Steps a carrying ant has walked out in the open; it dumps its grain only well away from the hole. */
  carryOut: Int32Array;
  /** The state a carrying ant goes back to once it has dropped its grain (0: wandering). */
  resume: Uint8Array;
  /** The nestmate a sharing ant is exchanging food with, or -1. */
  partner: Int32Array;
  /** How hungry the ant must be to go out foraging (see `AntParams.forageThresholdMin`). */
  forageThreshold: Float64Array;
  /** A `Caste`. */
  caste: Uint8Array;
  /** Body length in tenths of a mm, for a species whose workers differ in size (Messor, `sizes.ts`); 0 for the species' standard worker. */
  size: Uint8Array;
  /** The protein-rich part of the crop's contents, µL (the rest is sugar water). */
  cropProtein: Float64Array;
  /** Queens: protein held in the body for making eggs, µL. */
  reserve: Float64Array;
  /** Workers: age in tank days since the ant left its cocoon (M4). */
  age: Float64Array;
  /**
   * Workers: fat body, 0 (none left) to 1 (a newly emerged worker's). Lean
   * workers forage, fat ones stay in (see `AntParams.fatRef`, M4).
   */
  fat: Float64Array;
  /** Seconds a worker has wandered in a bought nest among nestmates packed too tight to settle by, since it last rested (Nests 3). */
  restless: Float64Array;
  /**
   * Moving house (Nests 3): 1 when the worker has found room to rest further
   * off after a crowd made it restless, and remembers where (`siteX`,
   * `siteY`, by its path integrator); 2 while it carries brood there.
   */
  site: Uint8Array;
  siteX: Float64Array;
  siteY: Float64Array;
  /** Trips out of the farm to forage since the ant was born or poured in. */
  trips: Int32Array;
  /** Workers: age at which the ant dies, tank days (0: never; M4c). */
  lifespan: Float64Array;
  /** The dead: tank days since death. */
  deadFor: Float64Array;
  /** The corpse the ant is carrying, or -1. */
  corpseHeld: Int32Array;
  /** The dead: the ant carrying this corpse, or -1. */
  carriedBy: Int32Array;
  /** The piece of insect the ant is working at (state `atPrey`), or -1 (Arena 3). */
  preyId: Int32Array;
  /** The piece of insect the ant is carrying, home or (a husk) out to the midden, or -1. */
  pieceHeld: Int32Array;
  /** Counts corpses picked up, put down or newly dead, so lookups know when corpses have moved. */
  corpseVersion: number;
  /** Adults (M5c): tank days starving (crop empty, fat spent), dried out, and too hot; 0 while all is well. */
  hunger: Float64Array;
  thirst: Float64Array;
  heat: Float64Array;
  /** The dead: what killed them (`Cause`). */
  cause: Uint8Array;
  /** Seconds the ant has been shut in by sand with no room to walk (M5c); 0 when it is not. */
  shutIn: Float64Array;
  /**
   * Its life so far, for the ant inspector (M6b); no rule reads these. 1 if
   * it came out of its cocoon in this tank (0 if it was poured in), grains
   * of soil it dug or cleared, food it gave nestmates (µL), protein it fed
   * larvae (µL), brood items it picked up and corpses it carried.
   */
  born: Uint8Array;
  dug: Int32Array;
  gave: Float64Array;
  nursed: Float64Array;
  broodMoved: Int32Array;
  corpsesCarried: Int32Array;
  /**
   * How it has spent its life, in steps (M6b; no rule reads these): out
   * foraging (in the arena or the tube, or on its way through the farm to or
   * from it), resting, walking about the nest, digging (carrying soil),
   * carrying brood, sharing food, and carrying the dead.
   */
  timeOut: Int32Array;
  timeResting: Int32Array;
  timeAbout: Int32Array;
  timeDigging: Int32Array;
  timeBrood: Int32Array;
  timeSharing: Int32Array;
  timeDead: Int32Array;
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
    memoryProtein: new Uint8Array(count),
    seekProtein: new Uint8Array(count),
    foodId: new Int32Array(count).fill(-1),
    crop: new Float64Array(count),
    cropQuality: new Float64Array(count),
    walked: new Float64Array(count),
    grain: new Uint8Array(count),
    grainMoisture: new Uint8Array(count),
    encounters: new Float64Array(count),
    excitement: new Float64Array(count),
    alarm: new Float64Array(count),
    broodNeed: new Float64Array(count),
    recruiting: new Int32Array(count),
    invite: new Int32Array(count),
    called: new Float64Array(count),
    knowsTube: new Uint8Array(count),
    holeX: new Float64Array(count),
    holeY: new Float64Array(count),
    hasHole: new Uint8Array(count),
    broodHeld: new Int32Array(count).fill(-1),
    digX: new Float64Array(count),
    digY: new Float64Array(count),
    hasDigSite: new Uint8Array(count),
    carryOut: new Int32Array(count),
    resume: new Uint8Array(count),
    partner: new Int32Array(count).fill(-1),
    forageThreshold: new Float64Array(count),
    caste: new Uint8Array(count),
    size: new Uint8Array(count),
    cropProtein: new Float64Array(count),
    reserve: new Float64Array(count),
    age: new Float64Array(count),
    fat: new Float64Array(count),
    restless: new Float64Array(count),
    site: new Uint8Array(count),
    siteX: new Float64Array(count),
    siteY: new Float64Array(count),
    trips: new Int32Array(count),
    lifespan: new Float64Array(count),
    deadFor: new Float64Array(count),
    corpseHeld: new Int32Array(count).fill(-1),
    carriedBy: new Int32Array(count).fill(-1),
    preyId: new Int32Array(count).fill(-1),
    pieceHeld: new Int32Array(count).fill(-1),
    corpseVersion: 0,
    hunger: new Float64Array(count),
    thirst: new Float64Array(count),
    heat: new Float64Array(count),
    cause: new Uint8Array(count),
    shutIn: new Float64Array(count),
    born: new Uint8Array(count),
    dug: new Int32Array(count),
    gave: new Float64Array(count),
    nursed: new Float64Array(count),
    broodMoved: new Int32Array(count),
    corpsesCarried: new Int32Array(count),
    timeOut: new Int32Array(count),
    timeResting: new Int32Array(count),
    timeAbout: new Int32Array(count),
    timeDigging: new Int32Array(count),
    timeBrood: new Int32Array(count),
    timeSharing: new Int32Array(count),
    timeDead: new Int32Array(count),
  };
}

/** Array fields whose empty value is -1 rather than 0. */
const MINUS_ONE: ReadonlySet<string> = new Set(['broodHeld', 'carriedBy', 'corpseHeld', 'foodId', 'partner', 'pieceHeld', 'preyId']);

/** Adds one ant at the end (a new worker eclosing) and returns its id. Every field starts empty. */
export function addAnt(ants: Ants): number {
  const id = ants.count;
  const record = ants as unknown as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    const old = record[key];
    if (!(old instanceof Float64Array || old instanceof Int32Array || old instanceof Uint8Array)) continue;
    const Ctor = old.constructor as new (n: number) => Float64Array | Int32Array | Uint8Array;
    const grown = new Ctor(id + 1);
    grown.set(old);
    if (MINUS_ONE.has(key)) grown[id] = -1;
    record[key] = grown;
  }
  ants.count = id + 1;
  return id;
}

/** What the nest holds as a whole. */
export interface Nest {
  /** Lab nest only: sugar water brought home, µL. In the farm the colony's food is in its workers' crops. */
  stores: number;
  /**
   * Lab nest only: excitement from recently returned foragers (see
   * `AntParams.recruitRate`). In the farm each ant has its own.
   */
  excitement: number;
  /** Lab nest only, Pheidole: the majors' invitation from minors back from big prey (as `excitement`). */
  call: number;
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
  /** The tank's seed, for streams drawn per ant (lifespans). */
  seed: number;
  ants: Ants;
  arena: Arena;
  farm: Farm;
  food: FoodDrop[];
  /** The pieces of feeder insects in the tank (Arena 3). */
  prey: Piece[];
  brood: Brood;
  nest: Nest;
  nestMode: NestMode;
  params: AntParams;
  rng: Rng;
  /**
   * For a species that stores seeds, the pieces lying free in the arena and in the farm as the step began
   * (`stepAnts`): a granary holds hundreds of seeds, too many to look through for every ant.
   */
  arenaPieces?: Piece[];
  farmPieces?: Piece[];
}

/** Advances every ant by one step, in id order. */
export function stepAnts(ctx: AntContext): void {
  const { ants, nest, params } = ctx;
  if (ctx.nestMode === 'lab') {
    nest.excitement *= Math.pow(0.5, DT / params.excitementHalfLife);
    if (params.dimorphic) nest.call *= Math.pow(0.5, DT / params.excitementHalfLife);
  }
  else computeContacts(ctx);
  // Every worker burns the sugar in its crop on the life clock (D6); the lab nest has no metabolism.
  const burn = ctx.nestMode === 'farm' ? (params.burnRate / params.daySeconds) * DT : 0;
  const days = DT / params.daySeconds;
  const alarmKeep = params.alarm ? Math.pow(0.5, DT / params.alarmHalfLife) : 1;
  // A Pheidole major, once roused, stays roused longer (DESIGN.md 4.4, P7).
  const majorAlarmKeep = params.alarm && params.dimorphic ? Math.pow(0.5, DT / params.majorAlarmHalfLife) : 1;
  if (params.seeds) {
    ctx.arenaPieces = ctx.prey.filter((p) => p.place === Place.arena && p.carriedBy < 0);
    ctx.farmPieces = ctx.prey.filter((p) => p.place === Place.farm && p.carriedBy < 0);
  }
  for (let i = 0; i < ants.count; i++) {
    const place = ants.place[i]!;
    if (place === Place.gone) continue;
    if (ants.state[i] === AntState.dead) {
      ants.deadFor[i]! += days;
      continue;
    }
    if (ctx.nestMode === 'farm' && ants.caste[i] === Caste.worker) {
      age(ctx, i);
      if (dieOfAge(ctx, i)) continue;
    }
    if (params.mortal && ctx.nestMode === 'farm' && endure(ctx, i)) continue;
    if (burn > 0 && ants.crop[i]! > 0) {
      // Sugar is burnt first; protein only once the sugar is gone.
      ants.crop[i] = Math.max(0, ants.crop[i]! - burn);
      if (ants.cropProtein[i]! > ants.crop[i]!) ants.cropProtein[i] = ants.crop[i]!;
    }
    if (ants.alarm[i]! > 0) {
      const keep = params.dimorphic && isMajor(ants, params, i) ? majorAlarmKeep : alarmKeep;
      ants.alarm[i] = ants.alarm[i]! * keep < 0.01 ? 0 : ants.alarm[i]! * keep;
    }
    const state = ants.state[i]!;
    tally(ants, i, place, state);
    if (place === Place.tube) walkTube(ctx, i);
    else if (place === Place.farm) stepFarmAnt(ctx, i);
    else if (state === AntState.inNest) restInNest(ctx, i);
    else if (state === AntState.feeding) feed(ctx, i);
    else if (state === AntState.atPrey) workAtPrey(ctx, i);
    else walk(ctx, i);
    if (ants.corpseHeld[i]! >= 0) holdCorpse(ctx, i);
    if (ants.pieceHeld[i]! >= 0) holdPiece(ctx, i);
  }
}

/** What a living ant is spending its time on, as the inspector and the colony graphs count it (M6). */
export const Activity = {
  /** In the arena or the tube, or on its way through the farm to the tube or back. */
  out: 0,
  resting: 1,
  /** Walking about the nest. */
  about: 2,
  /** Carrying soil. */
  digging: 3,
  brood: 4,
  sharing: 5,
  /** Carrying a corpse out. */
  dead: 6,
} as const;

export const ACTIVITY_COUNT = 7;

export function activityOf(place: number, state: number): number {
  if (state === AntState.carryingCorpse) return Activity.dead;
  if (state === AntState.resting || state === AntState.inNest) return Activity.resting;
  if (place !== Place.farm || isOutbound(state) || state === AntState.returning || state === AntState.homing) return Activity.out;
  if (state === AntState.carrying) return Activity.digging;
  if (state === AntState.carryingBrood) return Activity.brood;
  if (state === AntState.sharing) return Activity.sharing;
  return Activity.about;
}

/** Counts this step toward what the ant is spending its life on (for the inspector). */
function tally(ants: Ants, i: number, place: number, state: number): void {
  switch (activityOf(place, state)) {
    case Activity.out:
      ants.timeOut[i]! += 1;
      break;
    case Activity.resting:
      ants.timeResting[i]! += 1;
      break;
    case Activity.about:
      ants.timeAbout[i]! += 1;
      break;
    case Activity.digging:
      ants.timeDigging[i]! += 1;
      break;
    case Activity.brood:
      ants.timeBrood[i]! += 1;
      break;
    case Activity.sharing:
      ants.timeSharing[i]! += 1;
      break;
    default:
      ants.timeDead[i]! += 1;
  }
}

/**
 * A worker ages on the life clock, and its fat body follows what it eats and
 * what it does (Blanchard et al. 2000): it builds fat while its crop holds
 * sugar, toward a full fat body, and spends it slowly at all times and fast
 * while it is out foraging. So workers that forage grow lean, and lean
 * workers forage more (`setOffToForage`); a forager that stays home well fed
 * grows fat again, as foragers turned back into nurses do (Bernadou et al.
 * 2020). The fat is part of the metabolism `burnRate` already charges the crop.
 */
function age(ctx: AntContext, i: number): void {
  const { ants, params } = ctx;
  const days = DT / params.daySeconds;
  ants.age[i]! += days;
  if (!params.fatDrift) return;
  const fat = ants.fat[i]!;
  const full = Math.min(1, ants.crop[i]! / params.cropLoad);
  const out = ants.place[i] === Place.farm ? 0 : params.fatBurnOut;
  const gain = ants.place[i] === Place.farm ? params.fatGain * full * (1 - fat) : 0;
  ants.fat[i] = Math.min(1, Math.max(0, fat + (gain - params.fatBurn - out) * days));
}

/** True for the states that mean "heading out to forage". */
export function isOutbound(state: number): boolean {
  return state === AntState.exploring || state === AntState.toFood;
}

/** Starts walking through the tube; `outbound` ants come out in the arena, the others in the farm. */
export function enterTube(ctx: AntContext, i: number): void {
  const { ants } = ctx;
  if (ants.place[i] === Place.farm) {
    if (isOutbound(ants.state[i]!)) ants.trips[i]! += 1;
    // Path integration restarts at the tube mouth when the ant comes back: keep its hole relative to the mouth.
    ants.holeX[i]! -= ants.piX[i]!;
    ants.holeY[i]! -= ants.piY[i]!;
  }
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
  // Out of the tube: path integration starts again from its mouth, the one landmark both ends share
  // (so a new nest site it remembered in the old frame is forgotten).
  ants.piX[i] = 0;
  ants.piY[i] = 0;
  ants.site[i] = 0;
  if (isOutbound(ants.state[i]!) || ants.state[i] === AntState.carryingCorpse) {
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
  // A Pheidole major goes out only when invited, and readily only when strongly (`majorResponse`).
  const major = params.majorCall > 0 && isMajor(ants, params, i);
  const rate = major ? params.recruitRate * majorResponse(nest.call, params) : own + params.recruitRate * nest.excitement;
  if (!rng.chance(rate * DT)) return;
  ants.state[i] = ants.hasMemory[i] ? AntState.toFood : AntState.exploring;
  if (major) ants.seekProtein[i] = 1;
  if (params.dimorphic) ants.invite[i] = 0;
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
  if (drop && drop.volume > 0 && !drop.mouldy) {
    // An ant tops up what is left in its crop. It lays trail by how much it drank, so foragers from a
    // well-fed colony, who could not unload at home, lay less (Mailleux et al. 2000, 2006).
    const take = Math.min(Math.max(0, params.cropLoad - ants.crop[i]!), drop.volume);
    drop.volume -= take;
    ants.crop[i]! += take;
    ants.cropProtein[i]! += take * drop.protein;
    ants.cropQuality[i] = foodQuality(drop.concentration, params) * (take / params.cropLoad);
    ants.memX[i] = ants.piX[i]!;
    ants.memY[i] = ants.piY[i]!;
    ants.hasMemory[i] = 1;
    ants.memoryProtein[i] = drop.protein > 0 ? 1 : 0;
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
  // A scout out for protein with no insect in mind searches on its own: the trail leads to sugar as often as not.
  // A harvester's scouts follow trails all the same: they lead to seeds (and a Pheidole's, to prey as well).
  const scouting = state === AntState.exploring && ants.seekProtein[i] === 1 && !params.seeds;
  const undertaker = state === AntState.carryingCorpse;
  if (!scouting && !undertaker && trailSum > params.trailThreshold) turn += params.trailTurn * DT * ((trailR - trailL) / trailSum);

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
  } else if ((state === AntState.exploring || undertaker) && piDist > 1) {
    // Searching ants drift away from the nest; corpse carriers walk away from it (Diez et al. 2012).
    goal = Math.atan2(ants.piY[i]!, ants.piX[i]!);
    goalStrength = undertaker ? params.goalTurn : params.outwardTurn;
  }
  if (goal !== undefined) {
    const off = goal - heading;
    turn += goalStrength * DT * Math.sin(off);
    // U-turns: an ant heading away from where it means to go sometimes turns right round.
    if (state !== AntState.exploring && !undertaker) {
      const away = -Math.cos(off);
      if (away > 0 && rng.chance(params.uTurnRate * away * DT)) turn += Math.PI;
    }
  }

  // 4. Food within smelling range pulls a searching ant straight to it.
  if (ants.state[i] === AntState.exploring || ants.state[i] === AntState.toFood) {
    const near = nearestFood(ctx, i, x, y, params.foodSenseRange);
    if (near) turn = angleDiff(Math.atan2(near.y - y, near.x - x), heading);
  }

  heading = wrapAngle(heading + turn);

  // 5. Move, sliding along walls when blocked, and update the path integrator.
  // The arena is at room temperature; ants walk faster when it is warm (M5a). Up and
  // down a stone or the bark the same walking crosses less floor (A5).
  // An alarmed ant runs (DESIGN.md 4.4).
  const running = ants.alarm[i]! > params.alarmShow ? 1 + params.alarmSpeed * ants.alarm[i]! : 1;
  const stepLength = floorStep(arena, x, y, heading, speedAt(params, params.roomTemperature) * running * DT);
  if (!moveAnt(ctx, i, heading, stepLength, (px, py) => isBlocked(arena, px, py))) return;
  const nx = ants.x[i]!;
  const ny = ants.y[i]!;

  // 7. Lay trail on the way home from food, more for better food.
  const now = ants.state[i]!;
  if (now === AntState.returning && params.trailLaying) {
    depositTrail(arena, nx, ny, params.trailDeposit * stepLength * ants.cropQuality[i]! * laysTrail(ants, params, i));
  }

  // 8. Arrivals and decisions.
  const home = Math.hypot(nx - arena.entranceX, ny - arena.entranceY) < HOME_RADIUS;
  if (now === AntState.carryingCorpse) {
    mayDropCorpse(ctx, i);
  } else if (now === AntState.returning || (now === AntState.homing && home)) {
    if (home) {
      if (ctx.nestMode === 'lab') enterNest(ctx, i);
      else enterTube(ctx, i);
    }
  } else {
    // A searching ant, or one giving up and going home empty, takes food of its kind that it walks into.
    const drop = nearestDrop(ctx, i, nx, ny, 1);
    const piece = wantsPiece(ctx, i) ? nearestPiece(ctx, nx, ny, 1, wantsProtein(ctx, i), seedCapacity(ctx.ants, ctx.params, i)) : undefined;
    if (piece && (!drop || Math.hypot(piece.x - nx, piece.y - ny) - pieceReach(piece) < Math.hypot(drop.x - nx, drop.y - ny) - foodReach(drop))) {
      startAtPrey(ctx, i, piece);
    } else if (drop) {
      ants.state[i] = AntState.feeding;
      ants.foodId[i] = drop.id;
      ants.timer[i] = Math.round(params.feedTime * STEPS_PER_SECOND);
    } else if ((now === AntState.exploring || now === AntState.homing) && tryPickUpCorpse(ctx, i)) {
      // A searching or homing ant that comes on a corpse may take it away.
    } else if (now === AntState.exploring && rng.chance(DT / params.exploreTime)) {
      ants.state[i] = AntState.homing;
    }
  }
}

function enterNest(ctx: AntContext, i: number): void {
  const { ants, nest, params } = ctx;
  // A major excites no one (it lays no trail, Sempo & Detrain 2010).
  const recruits = params.recruitPerReturn * ants.cropQuality[i]! * laysTrail(ants, params, i);
  if (ants.invite[i]! < 0) {
    // A minor back from prey too big to take home invites the majors too.
    nest.call += recruits;
    ants.invite[i] = 0;
  }
  if (ants.pieceHeld[i]! >= 0) {
    // A piece of insect brought in excites nestmates as the forager's trail laying says (none for a whole fly).
    nest.excitement += recruits;
    deliverToLabNest(ctx, i);
  }
  if (ants.crop[i]! > 0) {
    nest.stores += ants.crop[i]!;
    nest.excitement += recruits;
    ants.crop[i] = 0;
    ants.cropProtein[i] = 0;
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

/**
 * True if the ant takes protein (prey): it set out for it, or, out for sugar,
 * it feels the brood's hunger.
 */
function wantsProtein(ctx: AntContext, i: number): boolean {
  return ctx.ants.seekProtein[i] === 1 || ctx.ants.broodNeed[i]! >= ctx.params.preyNeed;
}

/** True if the ant takes pieces lying in the arena: insects or seeds, if it wants protein; seeds, always, if it hoards them. */
function wantsPiece(ctx: AntContext, i: number): boolean {
  // A species that does not hoard seeds (Pheidole) takes them only when it wants protein.
  return (ctx.params.seeds && ctx.params.seedHoard > 0) || wantsProtein(ctx, i);
}

/** The nearest food of the kind the ant is after, a drop or a piece of insect, within `range` mm: where it is. */
function nearestFood(ctx: AntContext, i: number, x: number, y: number, range: number): { x: number; y: number } | undefined {
  const drop = nearestDrop(ctx, i, x, y, range);
  const piece = ctx.prey.length > 0 && wantsPiece(ctx, i) ? nearestPiece(ctx, x, y, range, wantsProtein(ctx, i), seedCapacity(ctx.ants, ctx.params, i)) : undefined;
  if (!piece) return drop;
  if (!drop) return piece;
  return Math.hypot(piece.x - x, piece.y - y) - pieceReach(piece) < Math.hypot(drop.x - x, drop.y - y) - foodReach(drop) ? piece : drop;
}

/** The nearest drop of the kind the ant is after (`protein` 1 for insects, 0 for sugar water) within `range`. */
function nearestDrop(ctx: AntContext, i: number, x: number, y: number, range: number): FoodDrop | undefined {
  const { ants, params } = ctx;
  // An ant takes the kind of food it set out for. One out for sugar that comes on prey takes that
  // instead if it feels the brood's hunger; one out for protein passes sugar by.
  const seek = ants.seekProtein[i]!;
  const preyToo = seek === 0 && ants.broodNeed[i]! >= params.preyNeed;
  let best: FoodDrop | undefined;
  let bestGap = range;
  for (const drop of ctx.food) {
    const protein = drop.protein > 0 ? 1 : 0;
    if (drop.volume <= 0 || drop.mouldy || (protein !== seek && !(protein === 1 && preyToo))) continue;
    const gap = Math.hypot(drop.x - x, drop.y - y) - foodReach(drop);
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
