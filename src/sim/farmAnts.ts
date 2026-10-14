/**
 * Life in the farm (DESIGN.md sections 4, 6 and 7): resting, wandering,
 * digging, carrying soil out, and walking between the nest and the tube.
 *
 * What an ant in the farm can sense: soil its antennae touch, whether open
 * air lies above it, colony odour and trail at its antennae, the draught of
 * the tube near its mouth, nestmates it touches, and its own path integrator.
 *
 * Nothing tells the colony where to put the nest or how big to make it. Ants
 * settle where it is enclosed and smells of nestmates, so odour builds up
 * there and the nest forms. They dig more when crowded, so the nest grows
 * until it has room for everyone (Buhl et al. 2004; Rasse & Deneubourg 2001).
 */
import { sampleTrail, depositTrail } from './arena';
import {
  type AntContext,
  AntState,
  Caste,
  DT,
  Place,
  addAnt,
  enterTube,
  isOutbound,
  moveAnt,
  wrapAngle,
} from './ants';
import { BroodStage, addBrood, broodLike, broodNear, larvaHungry, larvaStarved } from './brood';
import { drawLifespan, dropCorpse, tryPickUpCorpse } from './corpses';
import { mayPutDownPiece, sipPiece, tryPickUpRefuse } from './prey';
import { addToField, cellSolid, isBlockedFarm, isSoil, openAbove, sampleField, type Farm } from './farm';
import { speedAt, temperatureAt } from './heat';
import { mouldAt } from './mould';
import { lightAt } from './nest';
import { humidityAt } from './water';
import type { AntParams } from './params';
import { placeGrain, removeGrain } from './soil';
import { STEPS_PER_SECOND } from './time';

/** Size of a bucket in the contact grid, mm; must be at least the contact radius. */
const BUCKET = 4;

/** Enclosure (see `enclosure`) from which an ant counts itself inside the soil rather than out on the surface. */
const INSIDE = 0.5;

/** Within this distance of the tube's mouth, mm, ants keep the way clear: they drop no spoil and dig out any that blocks it. */
const TUBE_CLEAR = 15;

/** Scratch, rebuilt every step: how many resting nestmates each ant is touching (up to 255). */
let restingNear = new Uint8Array(0);
/** Resting nestmates within `restSpace` of each ant: closer than a body's width (Nests 3). */
let restingClose = new Uint8Array(0);
/** Scratch, rebuilt every step: the queens in the farm. */
const queens: number[] = [];
/** Scratch for bucketing ants by position: bucket starts, fill pointers, each ant's bucket, ants by bucket. */
let start = new Int32Array(0);
let fill = new Int32Array(0);
let bucketOf = new Int32Array(0);
let members = new Int32Array(0);
/** Which way each ant smells alarm from: the sum of its alarmed neighbours' offsets, weighted by their alarm (DESIGN.md 4.4). */
let alarmX = new Float64Array(0);
let alarmY = new Float64Array(0);

/**
 * Antennal contacts between ants in the farm. Each ant updates how crowded
 * it has been lately and gets excited by foragers just back with food.
 */
export function computeContacts(ctx: AntContext): void {
  const { ants, farm, params } = ctx;
  if (restingNear.length !== ants.count) restingNear = new Uint8Array(ants.count);
  if (restingClose.length !== ants.count) restingClose = new Uint8Array(ants.count);
  restingNear.fill(0);
  restingClose.fill(0);
  if (alarmX.length !== ants.count) {
    alarmX = new Float64Array(ants.count);
    alarmY = new Float64Array(ants.count);
  }
  alarmX.fill(0);
  alarmY.fill(0);
  const space2 = params.restSpace * params.restSpace;
  queens.length = 0;
  for (let i = 0; i < ants.count; i++) if (ants.place[i] === Place.farm && ants.caste[i] === Caste.queen) queens.push(i);

  // Bucket the ants in the farm by position (a counting sort, so order is by id within a bucket).
  const bw = Math.ceil(farm.width / BUCKET);
  const bh = Math.ceil(farm.height / BUCKET);
  if (start.length !== bw * bh + 1) {
    start = new Int32Array(bw * bh + 1);
    fill = new Int32Array(bw * bh);
  }
  if (bucketOf.length !== ants.count) {
    bucketOf = new Int32Array(ants.count);
    members = new Int32Array(ants.count);
  }
  start.fill(0);
  bucketOf.fill(-1);
  for (let i = 0; i < ants.count; i++) {
    if (ants.place[i] !== Place.farm || ants.state[i] === AntState.dead) continue;
    const b = Math.min(bh - 1, Math.max(0, Math.floor(ants.y[i]! / BUCKET))) * bw +
      Math.min(bw - 1, Math.max(0, Math.floor(ants.x[i]! / BUCKET)));
    bucketOf[i] = b;
    start[b + 1]!++;
  }
  for (let b = 0; b < bw * bh; b++) start[b + 1]! += start[b]!;
  fill.set(start.subarray(0, bw * bh));
  for (let i = 0; i < ants.count; i++) if (bucketOf[i]! >= 0) members[fill[bucketOf[i]!]!++] = i;

  const memory = Math.exp(-DT / params.encounterMemory);
  const excitementKeep = Math.pow(0.5, DT / params.excitementHalfLife);
  const needKeep = Math.pow(0.5, DT / params.needHalfLife);
  const r2 = params.contactRadius * params.contactRadius;
  for (let i = 0; i < ants.count; i++) {
    if (ants.recruiting[i]! > 0) ants.recruiting[i]!--;
    ants.excitement[i]! *= excitementKeep;
    const b = bucketOf[i]!;
    if (b < 0) continue;
    const bx = b % bw;
    const by = (b - bx) / bw;
    let touching = 0;
    let recruiters = 0;
    let need = 0;
    let alarmed = 0;
    for (let y = Math.max(0, by - 1); y <= Math.min(bh - 1, by + 1); y++) {
      for (let x = Math.max(0, bx - 1); x <= Math.min(bw - 1, bx + 1); x++) {
        const cell = y * bw + x;
        for (let k = start[cell]!; k < start[cell + 1]!; k++) {
          const j = members[k]!;
          if (j === i) continue;
          const dx = ants.x[j]! - ants.x[i]!;
          const dy = ants.y[j]! - ants.y[i]!;
          if (dx * dx + dy * dy > r2) continue;
          touching++;
          if (ants.recruiting[j]! > 0) recruiters++;
          if (ants.broodNeed[j]! > need) need = ants.broodNeed[j]!;
          // An alarmed nestmate's alarm pheromone, smelt by a worker touching it (Crematogaster: Leuthold & Schlunegger 1973).
          if (ants.alarm[j]! > params.alarmShow) {
            if (ants.alarm[j]! > alarmed) alarmed = ants.alarm[j]!;
            alarmX[i]! += dx * ants.alarm[j]!;
            alarmY[i]! += dy * ants.alarm[j]!;
          }
          if (ants.state[j] === AntState.resting && restingNear[i]! < 255) {
            restingNear[i]!++;
            if (dx * dx + dy * dy <= space2) restingClose[i]!++;
          }
        }
      }
    }
    ants.encounters[i] = ants.encounters[i]! * memory + touching * (1 - memory);
    ants.excitement[i]! += params.recruitPerContact * recruiters * DT;
    // The brood's hunger, smelt here or passed on by touch, fading when nobody renews it.
    ants.broodNeed[i] = Math.max(ants.broodNeed[i]! * needKeep, smellBroodNeed(ctx, i), params.needRelay * need);
    // Alarm spreads from worker to worker, weaker at each one, so it reaches only a few bodies' lengths (DESIGN.md 4.4).
    if (alarmed > 0 && ants.caste[i] === Caste.worker) ants.alarm[i] = Math.max(ants.alarm[i]!, params.alarmRelay * alarmed);
    if (params.sharing && canShare(ants.state[i]!)) beg(ctx, i, bx, by, bw, bh);
  }
  tendBrood(ctx);
  feedQueen(ctx);
  pickUpBrood(ctx);
}

/**
 * Workers touching a queen short of protein feed her from their crop, as
 * they feed a begging larva: she is fed by her workers, and lays as well as
 * she is fed.
 */
function feedQueen(ctx: AntContext): void {
  const { ants, params, rng } = ctx;
  const r2 = params.contactRadius * params.contactRadius;
  for (const q of queens) {
    for (let i = 0; i < ants.count; i++) {
      if (ants.reserve[q]! + ants.cropProtein[q]! >= params.queenReserveMax / 2) break;
      if (ants.place[i] !== Place.farm || ants.caste[i] !== Caste.worker || !canShare(ants.state[i]!)) continue;
      if (ants.cropProtein[i]! <= 0 || ants.crop[q]! >= params.cropLoad) continue;
      const dx = ants.x[q]! - ants.x[i]!;
      const dy = ants.y[q]! - ants.y[i]!;
      if (dx * dx + dy * dy > r2 || !rng.chance(params.nurseRate * DT)) continue;
      const meal = Math.min(params.nurseLoad, ants.cropProtein[i]!, params.cropLoad - ants.crop[q]!);
      ants.cropProtein[i]! -= meal;
      ants.crop[i] = Math.max(0, ants.crop[i]! - meal);
      ants.cropProtein[q]! += meal;
      ants.crop[q]! += meal;
    }
  }
}

/**
 * Brood piling and sorting (Deneubourg et al. 1991): a resting or wandering
 * worker that touches a brood item picks it up, more readily the less brood
 * of the same stage lies round it. Carriers put it down where brood of its
 * stage lies thick (`carryBrood`), so scattered eggs, larvae and pupae end up
 * in piles of their own stage, side by side (M4b).
 */
function pickUpBrood(ctx: AntContext): void {
  const { ants, brood, farm, params, rng } = ctx;
  if (brood.count === 0) return;
  const r2 = params.contactRadius * params.contactRadius;
  const count = ants.count;
  for (let i = 0; i < count; i++) {
    if (ants.place[i] !== Place.farm || ants.caste[i] !== Caste.worker || !canShare(ants.state[i]!)) continue;
    for (let k = 0; k < brood.count; k++) {
      if (brood.stage[k] === BroodStage.none || brood.carried[k]) continue;
      const dx = brood.x[k]! - ants.x[i]!;
      const dy = brood.y[k]! - ants.y[i]!;
      if (dx * dx + dy * dy > r2) continue;
      const n = broodAround(ctx, brood.x[k]!, brood.y[k]!, i, k, brood.stage[k] as BroodStage);
      const alone = params.broodPickHalf / (params.broodPickHalf + n);
      // Brood lying too cold, too warm or too dry, where the ant feels which way is better, is picked up sooner.
      const thermal = 1 + params.thermoPick * broodPull(ctx, farm, i);
      // Brood in the light is picked up as readily as an item lying alone, however thick the pile (Nests 2).
      // A worker that knows a roomier site and is back in the crowd takes brood there, whatever the pile (Nests 3).
      const mover = farm.table !== null && params.moving && ants.site[i] === 1 && ants.state[i] === AntState.wandering && ants.restless[i]! > 0 &&
        Math.hypot(ants.siteX[i]! - ants.piX[i]!, ants.siteY[i]! - ants.piY[i]!) > params.siteFar;
      const urge = mover ? 1 : Math.max(alone * alone * thermal, params.lightPick * lightPull(ctx, farm, i));
      if (rng.chance(params.broodPickRate * urge * DT)) {
        if (mover) {
          // It remembers where it took the brood from, to come back for more.
          ants.site[i] = 2;
          ants.digX[i] = ants.piX[i]!;
          ants.digY[i] = ants.piY[i]!;
        }
        ants.broodHeld[i] = k;
        ants.broodMoved[i]! += 1;
        brood.carried[k] = 1;
        ants.state[i] = AntState.carryingBrood;
        ants.timer[i] = 0;
        ants.hasDigSite[i] = 0;
      }
      break;
    }
  }
}

/**
 * How much brood an ant senses round (x, y): the brood items within
 * `broodSenseRadius` (but `skip`), plus the queen if she is that close,
 * counted as `queenBroodWeight` items. The queen's eggs are piled round her
 * and her workers gather there, so she weighs like a pile of eggs. Sorting
 * an item of `stage`, brood of other stages (and the queen, for larvae and
 * pupae) counts only `broodOtherWeight` as much.
 */
function broodAround(ctx: AntContext, x: number, y: number, self: number, skip = -1, stage?: BroodStage): number {
  const { ants, brood, params } = ctx;
  const r = params.broodSenseRadius;
  let n = 0;
  if (brood.count > 0) {
    n =
      stage === undefined
        ? broodNear(brood, x, y, r, skip)
        : broodLike(brood, x, y, params.broodSortRadius, stage, params.broodOtherWeight, skip);
  }
  const queenWeight =
    params.queenBroodWeight * (stage === undefined || stage === BroodStage.egg ? 1 : params.broodOtherWeight);
  for (const q of queens) {
    if (q === self) continue;
    const dx = ants.x[q]! - x;
    const dy = ants.y[q]! - y;
    if (dx * dx + dy * dy <= r * r) n += queenWeight;
  }
  return n;
}

/** A brood carrier after each step: the item goes where it goes, and it puts it down where brood of its stage lies thick. */
function carryBrood(ctx: AntContext, i: number, outside: boolean): void {
  const { ants, brood, params, rng } = ctx;
  const k = ants.broodHeld[i]!;
  brood.x[k] = ants.x[i]!;
  brood.y[k] = ants.y[i]!;
  const carried = ++ants.timer[i]! / STEPS_PER_SECOND;
  if (ants.site[i] === 2) {
    // Moving house: put down at the remembered site, then back for more (by the same path integrator).
    const there = Math.hypot(ants.siteX[i]! - ants.piX[i]!, ants.siteY[i]! - ants.piY[i]!) < 3;
    if (there || carried > params.siteCarryMax) {
      brood.carried[k] = 0;
      ants.broodHeld[i] = -1;
      ants.state[i] = AntState.wandering;
      ants.timer[i] = 0;
      ants.site[i] = 1;
      ants.hasDigSite[i] = 1;
    }
    return;
  }
  const n = broodAround(ctx, ants.x[i]!, ants.y[i]!, i, -1, brood.stage[k] as BroodStage);
  const thick = n / (params.broodDropHalf + n);
  // In full light it carries on for longer, looking for the dark (Nests 3).
  const tired = carried > (outside ? 2 : 1) * (lightPull(ctx, ctx.farm, i) >= 1 ? 5 : 1) * params.broodCarryMax;
  // A carrier that still feels a better temperature or damper air ahead holds on to its load.
  const hold = 1 + params.thermoHold * broodPull(ctx, ctx.farm, i);
  if (tired || (!outside && rng.chance((params.broodDropRate * thick * thick * DT) / hold))) {
    brood.carried[k] = 0;
    ants.broodHeld[i] = -1;
    ants.state[i] = AntState.wandering;
    ants.timer[i] = 0;
  }
}

/**
 * Workers and brood they touch: a worker with protein in its crop feeds a
 * begging larva, and a worker touching a pupa that is ready helps the new
 * worker out of its cocoon. The brood is few compared with the ants, so each
 * worker checks the items that need something; new workers are added after
 * the loop, so the ants' arrays don't change under it.
 */
function tendBrood(ctx: AntContext): void {
  const { ants, brood, params, rng } = ctx;
  needy.length = 0;
  for (let k = 0; k < brood.count; k++) {
    if (brood.carried[k]) continue;
    const ready = brood.stage[k] === BroodStage.pupa && brood.progress[k]! >= 1;
    if (ready || larvaHungry(brood, k, params)) needy.push(k);
  }
  if (needy.length === 0) return;
  const r2 = params.contactRadius * params.contactRadius;
  const count = ants.count;
  for (let i = 0; i < count; i++) {
    if (ants.place[i] !== Place.farm || ants.caste[i] !== Caste.worker || !canShare(ants.state[i]!)) continue;
    for (const k of needy) {
      if (brood.stage[k] === BroodStage.none) continue;
      const dx = brood.x[k]! - ants.x[i]!;
      const dy = brood.y[k]! - ants.y[i]!;
      if (dx * dx + dy * dy > r2) continue;
      if (brood.stage[k] === BroodStage.pupa) {
        eclose(ctx, k);
        break;
      }
      if (larvaStarved(brood, k, params)) {
        // Brood that cannot be raised is eaten, and its protein goes back into the colony.
        const back = Math.min(brood.progress[k]! * params.larvaFood, Math.max(0, params.cropLoad - ants.crop[i]!));
        ants.crop[i]! += back;
        ants.cropProtein[i]! += back;
        brood.stage[k] = BroodStage.none;
        break;
      }
      if (ants.cropProtein[i]! <= 0 || !larvaHungry(brood, k, params) || !rng.chance(params.nurseRate * DT)) continue;
      const meal = Math.min(params.nurseLoad, ants.cropProtein[i]!, params.larvaFood - brood.food[k]!);
      ants.cropProtein[i]! -= meal;
      ants.crop[i] = Math.max(0, ants.crop[i]! - meal);
      ants.nursed[i]! += meal;
      brood.food[k]! += meal;
      break;
    }
  }
}

/** +1 if brood at `celsius` is too cold for nurses, -1 if too warm, 0 if within their tolerance. */
function thermalWant(params: AntParams, celsius: number): number {
  const off = params.broodPreferred - celsius;
  return Math.abs(off) <= params.broodTolerance ? 0 : Math.sign(off);
}

/**
 * How strongly ant `i` feels that brood here should be moved, 0 to 1: the
 * temperature where it stands is outside what nurses keep brood at, and it
 * feels a difference across its antennae, or between them and its body, of
 * at least `thermoSense` (in proportion below that). Where the farm is all
 * one temperature it feels nothing, whatever that temperature is.
 */
function thermalPull(ctx: AntContext, farm: Farm, i: number): number {
  const { ants, params } = ctx;
  if (!params.thermotaxis) return 0;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  const here = temperatureAt(farm, x, y);
  if (thermalWant(params, here) === 0) return 0;
  const h = ants.heading[i]!;
  const reach = params.antennaReach;
  const left = temperatureAt(farm, x + reach * Math.cos(h - params.antennaAngle), y + reach * Math.sin(h - params.antennaAngle));
  const right = temperatureAt(farm, x + reach * Math.cos(h + params.antennaAngle), y + reach * Math.sin(h + params.antennaAngle));
  const felt = Math.max(Math.abs(right - left), Math.abs((left + right) / 2 - here));
  return Math.min(1, felt / params.thermoSense);
}

/**
 * How strongly ant `i` feels that brood here should be moved, 0 to 1: the
 * air where it stands is drier than nurses keep brood in, and it feels a
 * difference in humidity across its antennae, or between them and its body,
 * of at least `hygroSense` (in proportion below that). M5b.
 */
function humidPull(ctx: AntContext, farm: Farm, i: number): number {
  const { ants, params } = ctx;
  if (!params.hygrotaxis) return 0;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  const here = humidityAt(farm, x, y);
  if (here >= params.broodHumidity) return 0;
  const h = ants.heading[i]!;
  const reach = params.antennaReach;
  const left = humidityAt(farm, x + reach * Math.cos(h - params.antennaAngle), y + reach * Math.sin(h - params.antennaAngle));
  const right = humidityAt(farm, x + reach * Math.cos(h + params.antennaAngle), y + reach * Math.sin(h + params.antennaAngle));
  const felt = Math.max(Math.abs(right - left), Math.abs((left + right) / 2 - here));
  return Math.min(1, felt / params.hygroSense);
}

/**
 * How strongly ant `i` feels it stands in the light, 0 to 1: nothing under a
 * bought nest's cover, fully where the keeper has lifted it (Nests 2, N7).
 * Nest workers shun light and carry brood out of it (Lasius niger keepers'
 * experience; Temnothorax colonies choose dark nests, Franks et al. 2003).
 */
function lightPull(ctx: AntContext, farm: Farm, i: number): number {
  const { params } = ctx;
  if (!params.photophobia || !farm.table) return 0;
  return Math.min(1, Math.max(0, (lightAt(farm, ctx.ants.x[i]!, ctx.ants.y[i]!) - params.lightSense) / params.lightSense));
}

/** The light an ant sees `lightSight` ahead, to its left and right (Nests 2). */
function lightSeen(ctx: AntContext, i: number): [number, number] {
  const { ants, farm, params } = ctx;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  const heading = ants.heading[i]!;
  const sight = params.lightSight;
  return [
    lightAt(farm, x + sight * Math.cos(heading - params.antennaAngle), y + sight * Math.sin(heading - params.antennaAngle)),
    lightAt(farm, x + sight * Math.cos(heading + params.antennaAngle), y + sight * Math.sin(heading + params.antennaAngle)),
  ];
}

/** The brightest light an ant sees ahead. */
function lightAhead(ctx: AntContext, i: number): number {
  const [left, right] = lightSeen(ctx, i);
  return Math.max(left, right);
}

/** The strongest of the reasons to move brood: temperature (M5a), humidity and mould where the ant stands (M5b), and light (Nests 2). */
function broodPull(ctx: AntContext, farm: Farm, i: number): number {
  if (mouldAt(farm, ctx.ants.x[i]!, ctx.ants.y[i]!) >= ctx.params.mouldSense) return 1;
  if (lightPull(ctx, farm, i) === 1) return 1;
  const thermal = thermalPull(ctx, farm, i);
  return thermal === 1 ? 1 : Math.max(thermal, humidPull(ctx, farm, i), lightPull(ctx, farm, i));
}

/** Scratch: brood items that need a worker this step. */
const needy: number[] = [];

/**
 * A pupa ready to emerge, helped out by a worker: a new worker appears where
 * it lay. Callows start hungry and resting, aged 0; their foraging threshold
 * is drawn like any worker's.
 */
function eclose(ctx: AntContext, k: number): void {
  const { ants, brood, params, rng } = ctx;
  const i = addAnt(ants);
  ants.caste[i] = Caste.worker;
  ants.place[i] = Place.farm;
  ants.state[i] = AntState.resting;
  ants.timer[i] = Math.round(params.restLength * STEPS_PER_SECOND);
  ants.x[i] = brood.x[k]!;
  ants.y[i] = brood.y[k]!;
  ants.heading[i] = rng.range(-Math.PI, Math.PI);
  const ratio = params.forageThresholdMax / params.forageThresholdMin;
  ants.forageThreshold[i] = params.forageThresholdMin * Math.pow(ratio, rng.float());
  // A new worker comes out of its cocoon with a full fat body, built from what it was fed as a larva.
  ants.fat[i] = 1;
  ants.lifespan[i] = drawLifespan(ctx.seed, i, 0, params);
  ants.born[i] = 1;
  brood.stage[k] = BroodStage.none;
}

/** Resting and wandering ants can stop to exchange food; ants busy carrying, travelling or sharing can't. */
function canShare(state: number): boolean {
  return state === AntState.resting || state === AntState.wandering;
}

/** How empty the ant's crop is: 0 full, 1 empty. */
export function hunger(ctx: AntContext, i: number): number {
  return Math.max(0, 1 - ctx.ants.crop[i]! / ctx.params.cropLoad);
}

/**
 * A hungry ant begs from the nestmates it touches that are better fed,
 * more readily the bigger the difference, and the first that responds
 * (in id order) feeds it (trophallaxis).
 */
function beg(ctx: AntContext, i: number, bx: number, by: number, bw: number, bh: number): void {
  const { ants, params, rng } = ctx;
  const hi = hunger(ctx, i);
  if (hi < params.begMargin) return;
  const r2 = params.contactRadius * params.contactRadius;
  for (let y = Math.max(0, by - 1); y <= Math.min(bh - 1, by + 1); y++) {
    for (let x = Math.max(0, bx - 1); x <= Math.min(bw - 1, bx + 1); x++) {
      const cell = y * bw + x;
      for (let k = start[cell]!; k < start[cell + 1]!; k++) {
        const j = members[k]!;
        // The queen begs but is never begged from.
        if (j === i || !canShare(ants.state[j]!) || ants.caste[j] === Caste.queen) continue;
        const gap = hi - hunger(ctx, j);
        if (gap < params.begMargin) continue;
        const dx = ants.x[j]! - ants.x[i]!;
        const dy = ants.y[j]! - ants.y[i]!;
        if (dx * dx + dy * dy > r2) continue;
        if (!rng.chance(params.begRate * gap * DT)) continue;
        // Mouth to mouth: both stop and face each other; the exchange ends at a constant rate (Buffin et al. 2011).
        const steps = Math.max(1, Math.round(-Math.log(1 - rng.float()) * params.shareTime * STEPS_PER_SECOND));
        for (const [a, b] of [[i, j], [j, i]] as const) {
          ants.state[a] = AntState.sharing;
          ants.partner[a] = b;
          ants.timer[a] = steps;
          ants.hasDigSite[a] = 0;
          ants.heading[a] = Math.atan2(ants.y[b]! - ants.y[a]!, ants.x[b]! - ants.x[a]!);
        }
        return;
      }
    }
  }
}

/**
 * One step of trophallaxis. The fuller ant regurgitates into the emptier
 * one at a rate set by how much room the receiver has left, never past the
 * point where both hold the same. The exchange ends when its time is up,
 * the receiver is full, or the two are pulled apart.
 */
function share(ctx: AntContext, i: number): void {
  const { ants, params } = ctx;
  const j = ants.partner[i]!;
  let done = j < 0 || ants.partner[j] !== i || --ants.timer[i]! <= 0;
  if (!done) {
    const dx = ants.x[j]! - ants.x[i]!;
    const dy = ants.y[j]! - ants.y[i]!;
    if (dx * dx + dy * dy > 4 * params.contactRadius * params.contactRadius) done = true;
  }
  if (!done && ants.crop[i]! < ants.crop[j]!) {
    const room = params.cropLoad - ants.crop[i]!;
    const flow = Math.min(params.shareFlow * room * DT, (ants.crop[j]! - ants.crop[i]!) / 2);
    // What flows is the donor's crop as it is: sugar and protein in the same proportion.
    const protein = (flow * ants.cropProtein[j]!) / ants.crop[j]!;
    ants.crop[i]! += flow;
    ants.crop[j]! -= flow;
    ants.gave[j]! += flow;
    ants.cropProtein[i]! += protein;
    ants.cropProtein[j] = Math.min(ants.crop[j]!, Math.max(0, ants.cropProtein[j]! - protein));
    if (room - flow < 0.02 * params.cropLoad || ants.crop[j]! - ants.crop[i]! < 0.02 * params.cropLoad) done = true;
  }
  if (!done) return;
  if (j >= 0 && ants.partner[j] === i) {
    ants.state[j] = AntState.wandering;
    ants.partner[j] = -1;
    ants.timer[j] = 0;
  }
  ants.state[i] = AntState.wandering;
  ants.partner[i] = -1;
  ants.timer[i] = 0;
}

export function stepFarmAnt(ctx: AntContext, i: number): void {
  if (cellSolid(ctx.farm, Math.floor(ctx.ants.x[i]!), Math.floor(ctx.ants.y[i]!)) && unbury(ctx, i)) return;
  if (digOut(ctx, i)) return;
  const state = ctx.ants.state[i]!;
  // A worker resting or about the nest that touches a corpse smelling of death may carry it out.
  if ((state === AntState.resting || state === AntState.wandering) && tryPickUpCorpse(ctx, i)) return;
  // A worker touching a piece of insect brought in drinks from it now and then, and carries out a husk
  // or a mouldy piece as it would a corpse (Arena 3, B8).
  const { ants } = ctx;
  if (ctx.prey.length > 0 && (state === AntState.resting || state === AntState.wandering) && ants.caste[i] === Caste.worker && ants.pieceHeld[i]! < 0) {
    if (tryPickUpRefuse(ctx, i)) return;
    sipPiece(ctx, i);
  }
  if (state === AntState.resting) rest(ctx, i);
  else if (state === AntState.sharing) share(ctx, i);
  else walkFarm(ctx, i);
}

function rest(ctx: AntContext, i: number): void {
  const { ants, farm, params } = ctx;
  const queen = ants.caste[i] === Caste.queen;
  // The queen's scent marks where she lies far more strongly than a worker's: the nest gathers round her.
  addToField(farm, farm.odour, ants.x[i]!, ants.y[i]!, params.odourDeposit * (queen ? params.queenOdourGain : 1) * DT);
  if (queen) layEggs(ctx, i);
  if (setOffToForage(ctx, i)) return;
  // An alarmed worker gets up at once (DESIGN.md 4.4).
  if (!queen && ants.alarm[i]! > params.alarmShow) {
    ants.state[i] = AntState.wandering;
    return;
  }
  // In a bought nest a worker packed in too tight gets up sooner, the sooner the tighter (Amé et al. 2006; Nests 3).
  const packed = params.aggregation && ctx.farm.table && !queen ? Math.max(0, restingNear[i]! - params.restCrowd) + Math.max(0, restingClose[i]! - 1) : 0;
  // So does any ant lying in the light, the queen too: keepers see them scatter when a cover comes off.
  ants.timer[i]! -= Math.round((1 + packed * packed) * (1 + params.lightWake * lightPull(ctx, ctx.farm, i)));
  if (ants.timer[i]! <= 0) ants.state[i] = AntState.wandering;
}

/**
 * A resting queen turns the protein in her crop into body reserve (up to `queenReserveMax`) and lays
 * an egg where she lies whenever the reserve covers one, up to `layRate`
 * eggs a day: a queen lays as well as she is fed.
 */
function layEggs(ctx: AntContext, i: number): void {
  const { ants, brood, params, rng } = ctx;
  const take = Math.min(ants.cropProtein[i]!, params.queenReserveMax - ants.reserve[i]!);
  if (take > 0) {
    ants.reserve[i]! += take;
    ants.crop[i] = Math.max(0, ants.crop[i]! - take);
    ants.cropProtein[i]! -= take;
  }
  // A queen short of protein begs the way hungry larvae do: her scent draws food to her (rough).
  if (ants.reserve[i]! < params.queenReserveMax / 2) {
    addToField(ctx.farm, ctx.farm.broodScent, ants.x[i]!, ants.y[i]!, params.broodScentDeposit * DT);
  }
  if (ants.reserve[i]! < params.eggCost || !rng.chance((params.layRate / params.daySeconds) * DT)) return;
  ants.reserve[i]! -= params.eggCost;
  addBrood(brood, BroodStage.egg, ants.x[i]!, ants.y[i]!);
}

/**
 * Decides whether a resting or wandering ant sets off for the tube; returns
 * true if it does. Only workers with a low threshold go out much, and they
 * go out more the emptier their own crop: a forager that could unload its
 * crop at home goes back to the food; one that could not, because its
 * nestmates are full, mostly stays in and only scouts now and then. The
 * smell of hungry larvae drives it the same way. It goes out for whichever
 * need is the stronger, sugar for its own hunger or protein for the brood's,
 * back to food of that kind it remembers or else exploring, and passes the
 * other kind of food by.
 */
function setOffToForage(ctx: AntContext, i: number): boolean {
  const { ants, params, rng } = ctx;
  if (ants.caste[i] === Caste.queen) return false; // a queen never leaves the nest
  if (ants.age[i]! < params.callowDays) return false; // nor does a callow, newly out of its cocoon
  // A worker carrying protein for the brood takes it there before it goes out again; without this a
  // lean forager, keen to go out, carries the insect back and forth and the larvae starve.
  if (ants.cropProtein[i]! >= params.nurseLoad || ants.pieceHeld[i]! >= 0) return false;
  const hungry = hunger(ctx, i);
  // An ant already carrying protein has some for the brood: it feels the need to fetch more less.
  const need = ants.broodNeed[i]! * Math.max(0, 1 - ants.cropProtein[i]! / params.cropLoad);
  const forProtein = need > hungry;
  const remembers = ants.hasMemory[i] === 1 && ants.memoryProtein[i] === (forProtein ? 1 : 0);
  const own = remembers ? params.returnToFoodRate : params.forageRate;
  // How readily this worker forages at all (its threshold against the strongest stimulus, Bonabeau et
  // al. 1996), times how hungry it or the brood is: trips rise in step with hunger (Greenwald et al. 2018).
  // The threshold falls as the worker's fat runs down: lean workers forage (Robinson et al. 2009).
  const threshold = (ants.forageThreshold[i]! * ants.fat[i]!) / params.fatRef;
  const propensity = 1 / (1 + Math.pow(threshold, params.forageSteepness));
  const response = propensity * (params.scoutShare + (1 - params.scoutShare) * Math.max(hungry, need));
  const rate = (own + params.recruitRate * ants.excitement[i]!) * response;
  if (!rng.chance(rate * DT)) return false;
  ants.state[i] = remembers ? AntState.toFood : AntState.exploring;
  ants.seekProtein[i] = forProtein ? 1 : 0;
  ants.timer[i] = 0;
  ants.hasDigSite[i] = 0;
  return true;
}

/**
 * How strongly an ant smells hungry brood where it is, 0 to 1. Nurses smell
 * it; foragers mostly learn of it from nestmates they touch (`computeContacts`),
 * as ant colonies pass larval demand on to their foragers (Dussutour & Simpson
 * 2009). Lasius niger colonies with larvae to feed forage more for protein
 * (Portha et al. 2002).
 */
function smellBroodNeed(ctx: AntContext, i: number): number {
  const s = sampleField(ctx.farm, ctx.farm.broodScent, ctx.ants.x[i]!, ctx.ants.y[i]!);
  return s / (s + ctx.params.broodNeedScent);
}

function walkFarm(ctx: AntContext, i: number): void {
  const { ants, farm, params, rng } = ctx;
  const state = ants.state[i]!;
  // A corpse carrier makes for the tube the way a forager does.
  const undertaker = state === AntState.carryingCorpse;
  const outbound = isOutbound(state) || undertaker;
  const inbound = state === AntState.returning || state === AntState.homing;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  const heading = ants.heading[i]!;

  let turn = rng.normal(0, params.wiggle * Math.sqrt(DT));

  const reach = params.antennaReach;
  const lx = x + reach * Math.cos(heading - params.antennaAngle);
  const ly = y + reach * Math.sin(heading - params.antennaAngle);
  const rx = x + reach * Math.cos(heading + params.antennaAngle);
  const ry = y + reach * Math.sin(heading + params.antennaAngle);

  // Trail between the tube and the nest, followed both ways.
  if (outbound || inbound) {
    const tl = sampleTrail(farm, lx, ly);
    const tr = sampleTrail(farm, rx, ry);
    if (tl + tr > params.trailThreshold) turn += params.trailTurn * DT * ((tr - tl) / (tl + tr));
  }

  const outside = inTheOpen(ctx, x, y);
  // A worker with protein to give, coming home or about the nest, follows the scent of hungry larvae to
  // the brood, and while it smells them that call outweighs the colony odour, its hole and the pull
  // downwards: in the open too, so that it finds brood in another part of the nest (M4a). The queen
  // follows the brood scent only inside the soil; in the open she goes back in by the colony odour.
  let toBrood = false;
  const queen = ants.caste[i] === Caste.queen;
  const carrier = !queen && (ants.cropProtein[i]! >= params.nurseLoad || ants.pieceHeld[i]! >= 0);
  if ((inbound || state === AntState.wandering) && (carrier || (queen && !outside))) {
    const bl = sampleField(farm, farm.broodScent, lx, ly);
    const br = sampleField(farm, farm.broodScent, rx, ry);
    if (bl + br > 1e-3) {
      turn += params.nurseTurn * DT * ((br - bl) / (bl + br));
      toBrood = true;
    }
  }
  // Colony odour: going home follows it strongly, and so does a wandering ant out in the open (it goes
  // back in); wandering ants inside keep near it.
  const moving = state === AntState.carryingBrood && ants.site[i] === 2;
  // A brood carrier that sees light ahead goes by the light, not the colony odour: it does not carry brood
  // back into a lit chamber, however strongly the colony that lived there still smells (Nests 3).
  const shunning = state === AntState.carryingBrood && params.photophobia && farm.table !== null && lightAhead(ctx, i) > params.lightSense;
  if (!toBrood && !moving && !shunning && (inbound || state === AntState.wandering || state === AntState.carryingBrood)) {
    const ol = sampleField(farm, farm.odour, lx, ly);
    const or = sampleField(farm, farm.odour, rx, ry);
    // The queen keeps to where the colony is thickest, as a queen stays among her workers.
    const strong = inbound || outside || queen || state === AntState.carryingBrood;
    // In a bought nest, where every chamber is shelter, wandering workers keep to it as strongly (Nests 3a),
    // unless they have found no room among their nestmates for a while: then they go looking further off (Nests 3).
    const stay = params.aggregation && farm.table ? (ants.restless[i]! > params.restlessAfter ? 0 : 1) : 1 / 4;
    const gain = strong ? params.odourTurn : params.odourTurn * stay;
    if (ol + or > 1e-3) turn += gain * DT * ((or - ol) / (ol + or));
  }
  // Underground, ants heading out (or carrying soil out) follow the fresh air towards the open.
  if ((outbound || state === AntState.carrying) && !outside) {
    const fl = sampleField(farm, farm.fresh, lx, ly);
    const fr = sampleField(farm, farm.fresh, rx, ry);
    if (fl + fr > 0) turn += params.odourTurn * DT * ((fr - fl) / (fl + fr));
  }
  // Fresh dig marks draw wandering ants to where others are digging.
  if (state === AntState.wandering) {
    const ml = sampleField(farm, farm.digMark, lx, ly);
    const mr = sampleField(farm, farm.digMark, rx, ry);
    if (ml + mr > 1e-3) turn += params.odourTurn * DT * ((mr - ml) / (ml + mr));
  }

  let goal: number | undefined;
  let strength = 0;
  if (moving) {
    // Carrying brood to the roomier site it found, by its path integrator (Nests 3).
    goal = Math.atan2(ants.siteY[i]! - ants.piY[i]!, ants.siteX[i]! - ants.piX[i]!);
    strength = params.goalTurn;
  } else if (state === AntState.wandering && ants.hasDigSite[i]) {
    // Back to the face it was digging (or, moving house, to the crowd it took brood from), by its path integrator.
    goal = Math.atan2(ants.digY[i]! - ants.piY[i]!, ants.digX[i]! - ants.piX[i]!);
    strength = params.goalTurn;
  } else if (state === AntState.wandering && outside && ants.hasHole[i] && !toBrood) {
    // Out in the open with nothing to do: back to the hole it came out of, by its path integrator.
    goal = Math.atan2(ants.holeY[i]! - ants.piY[i]!, ants.holeX[i]! - ants.piX[i]!);
    strength = params.goalTurn;
  } else if (state === AntState.wandering && ants.caste[i] === Caste.worker && !toBrood && !farm.table) {
    goal = Math.PI / 2; // nest-building ants are drawn downwards, into the soil (a bought nest lies flat: no down)
    strength = params.geotaxis;
  } else if (state === AntState.carrying) {
    if (!outside) {
      goal = -Math.PI / 2; // up, towards the open
      strength = params.geotaxis;
    } else if (aboveTube(farm, x, y)) {
      goal = x < farm.tubeX ? Math.PI : 0; // no spoil goes over the tube: away from it
      strength = params.goalTurn;
    } else {
      // Out in the open: along the surface, away from the hole, by its path integrator.
      goal = ants.piX[i]! >= ants.digX[i]! ? 0 : Math.PI;
      strength = params.goalTurn;
    }
  } else if (inbound && !farm.table) {
    goal = Math.PI / 2; // down, into the soil
    strength = params.geotaxis / 2;
  } else if (outbound) {
    const dTube = Math.hypot(x - farm.tubeX, y - farm.tubeY);
    if (dTube < params.nestScentRange) {
      // The tube's draught smells of the outside: follow it to the mouth.
      const sl = tubeScent(ctx, lx, ly);
      const sr = tubeScent(ctx, rx, ry);
      turn += params.trailTurn * DT * ((sr - sl) / (sl + sr));
    }
    if (ants.knowsTube[i] && Math.hypot(ants.piX[i]!, ants.piY[i]!) > 1) {
      goal = Math.atan2(-ants.piY[i]!, -ants.piX[i]!);
      strength = params.goalTurn;
    } else if (!farm.table) {
      // Up, towards the open; in a bought nest, which lies flat, the fresh air from the tube alone shows the way.
      goal = -Math.PI / 2;
      strength = params.geotaxis;
    }
  }
  if (goal !== undefined) {
    turn += strength * DT * Math.sin(goal - heading);
    // U-turns, as in the arena: a trail has no direction, so an ant on it heading the wrong way turns round.
    if (state !== AntState.wandering) {
      const away = -Math.cos(goal - heading);
      if (away > 0 && rng.chance(params.uTurnRate * away * DT)) turn += Math.PI;
    }
  }

  // An alarmed worker about the nest runs towards where the alarm smells strongest (DESIGN.md 4.4).
  const alarmed = ants.alarm[i]! > params.alarmShow;
  if (alarmed && state === AntState.wandering && (alarmX[i] !== 0 || alarmY[i] !== 0)) {
    turn += params.alarmTurn * DT * Math.sin(Math.atan2(alarmY[i]!, alarmX[i]!) - heading);
  }

  // Brood carriers feel which way it gets warmer (or cooler) across their antennae and carry the brood
  // towards the temperature nurses keep it at (M5a).
  // In full light it only looks for the dark: warmth and damp can wait (Nests 3).
  const fleeing = state === AntState.carryingBrood && lightPull(ctx, farm, i) >= 1;
  if (state === AntState.carryingBrood && params.thermotaxis && !fleeing) {
    const want = thermalWant(params, temperatureAt(farm, x, y));
    if (want !== 0) {
      const across = (temperatureAt(farm, rx, ry) - temperatureAt(farm, lx, ly)) * want;
      turn += params.thermoTurn * DT * Math.max(-1, Math.min(1, across / params.thermoSense));
    }
  }

  // ...and towards damper air, where the air is drier than nurses keep brood in (M5b).
  if (state === AntState.carryingBrood && params.hygrotaxis && !fleeing && humidityAt(farm, x, y) < params.broodHumidity) {
    const across = humidityAt(farm, rx, ry) - humidityAt(farm, lx, ly);
    turn += params.thermoTurn * DT * Math.max(-1, Math.min(1, across / params.hygroSense));
  }

  // ...and away from the light, which they see on one side brighter than the other (Nests 2).
  if (state === AntState.carryingBrood && params.photophobia && farm.table) {
    const [lightLeft, lightRight] = lightSeen(ctx, i);
    turn += params.thermoTurn * DT * Math.max(-1, Math.min(1, (lightLeft - lightRight) / params.lightSense));
  }

  // Ants walk faster where it is warm (Hurlbert et al. 2008).
  const walking = speedAt(params, temperatureAt(farm, x, y));
  const running = alarmed ? 1 + params.alarmSpeed * ants.alarm[i]! : 1;
  const speed = ants.caste[i] === Caste.queen ? walking * params.queenSpeed : walking * running;
  moveAnt(ctx, i, wrapAngle(heading + turn), speed * DT, (px, py) => isBlockedFarm(farm, px, py));
  const nx = ants.x[i]!;
  const ny = ants.y[i]!;

  // Coming out of the soil into the open: remember the hole, until the ant is back inside.
  const outsideNow = inTheOpen(ctx, nx, ny);
  if (!outside && outsideNow) {
    ants.holeX[i] = ants.piX[i]!;
    ants.holeY[i] = ants.piY[i]!;
    ants.hasHole[i] = 1;
  } else if (!outsideNow && ants.hasHole[i] && Math.hypot(ants.holeX[i]! - ants.piX[i]!, ants.holeY[i]! - ants.piY[i]!) < 3) {
    ants.hasHole[i] = 0;
  }

  if (state === AntState.carryingBrood) {
    carryBrood(ctx, i, outsideNow);
  } else if (state === AntState.wandering) {
    if (ants.hasDigSite[i]) {
      const near = Math.hypot(ants.digX[i]! - ants.piX[i]!, ants.digY[i]! - ants.piY[i]!) < 2;
      if (near || ++ants.timer[i]! > params.digReturnTime * STEPS_PER_SECOND) ants.hasDigSite[i] = 0;
    }
    // A worker bringing in a piece of insect puts it down by the brood (B8).
    if (ants.pieceHeld[i]! >= 0) mayPutDownPiece(ctx, i, broodAround(ctx, nx, ny, i) > 0);
    if (setOffToForage(ctx, i)) return;
    if (ants.caste[i] === Caste.worker && tryDig(ctx, i)) return;
    const enclosed = enclosure(ctx, nx, ny);
    const odour = sampleField(farm, farm.odour, nx, ny);
    const nestLike = odour / (odour + params.homeOdour);
    // The queen settles among the larvae (and pupae), where the nurses are; her eggs are carried there.
    const n = queen
      ? broodNear(ctx.brood, nx, ny, params.broodSenseRadius, -1, BroodStage.larva)
      : broodAround(ctx, nx, ny, i);
    // A worker with protein for the brood does not settle until it is by the brood. The queen, who lives
    // among her brood, settles away from it only reluctantly (she must lie somewhere to lay the first eggs).
    const alone = queen ? params.queenSettleAlone : ants.cropProtein[i]! >= params.nurseLoad || ants.pieceHeld[i]! >= 0 ? 0 : 1;
    const onBrood = alone + (params.broodRestGain * n) / (n + params.broodDropHalf);
    // Nor do workers settle in the light (Nests 2).
    const dark = 1 - params.lightRest * lightPull(ctx, farm, i);
    // Workers stop more readily, and stay longer, beside nestmates already resting (Depickère et al. 2004).
    // But no more than one loose layer: past `restCrowd` resting nestmates touching, a worker does not settle (Nests 3).
    const near = params.aggregation && farm.table ? restingNear[i]! : 0;
    const company = Math.min(near, params.restCompanyMax);
    // The queen lies where she will: her workers make room for her.
    // Nor does it lie down on top of a nestmate: each needs about a body's width of floor (`restSpace`).
    const packed = queen || !params.aggregation || !farm.table ? 0 : Math.max(0, near - params.restCrowd) + Math.max(0, restingClose[i]! - 1);
    // Among nestmates packed too tight it grows restless; where there is room it calms down again, more slowly.
    const wasRestless = ants.restless[i]! > params.restlessAfter;
    if (!queen) ants.restless[i] = Math.max(0, ants.restless[i]! + (packed > 0 ? DT : -params.restlessCalm * DT));
    // Setting off to look for room, it keeps where the crowd was by its path integrator (Nests 3).
    if (!wasRestless && ants.restless[i]! > params.restlessAfter) {
      ants.digX[i] = ants.piX[i]!;
      ants.digY[i] = ants.piY[i]!;
    }
    const single = params.aggregation && farm.table && !queen ? params.restAlone : 1;
    // An alarmed worker does not lie down until its alarm has faded.
    const calm = alarmed ? 0 : 1;
    if (rng.chance(params.restRate * calm * enclosed * (1 + params.restOdourGain * nestLike) * onBrood * dark * (packed > 0 ? 0 : single + params.restJoin * company) * DT)) {
      ants.state[i] = AntState.resting;
      ants.hasDigSite[i] = 0;
      // Room found after a crowd sent it looking: it remembers the spot (Nests 3).
      // When it wakes, it goes back to the crowd (and takes brood from it to here).
      // Only room well away from the crowd counts as a new site; room found at the crowd's edge is just room.
      if (farm.table && params.moving && ants.restless[i]! > params.restlessAfter &&
        Math.hypot(ants.digX[i]! - ants.piX[i]!, ants.digY[i]! - ants.piY[i]!) > params.siteFar) {
        ants.site[i] = 1;
        ants.siteX[i] = ants.piX[i]!;
        ants.siteY[i] = ants.piY[i]!;
        ants.hasDigSite[i] = 1;
      } else {
        // Settling down where it is, unhurried, it is no longer moving anywhere.
        ants.site[i] = 0;
      }
      ants.restless[i] = 0;
      // A queen rests ten times as long: she spends her life lying in the nest, laying.
      const length = params.restLength * (ants.caste[i] === Caste.queen ? 10 : 1) * (1 + params.restStay * company);
      ants.timer[i] = Math.max(1, Math.round(-Math.log(1 - rng.float()) * length * STEPS_PER_SECOND));
    }
  } else if (state === AntState.carrying) {
    const carried = ++ants.timer[i]! / STEPS_PER_SECOND;
    if (carried >= params.maxCarryTime && !aboveTube(farm, nx, ny)) {
      dropGrain(ctx, i);
    } else if (!inTheOpen(ctx, nx, ny)) {
      ants.carryOut[i] = 0;
    } else if (
      ++ants.carryOut[i]! * params.speed * DT >= params.spoilDistance &&
      !aboveTube(farm, nx, ny)
    ) {
      // Spoil goes on heaps, away from where digging is going on.
      const pile = looseNeighbours(ctx, nx, ny);
      const digging = sampleField(farm, farm.digMark, nx, ny);
      if (rng.chance((params.dropRate * (1 + params.pileGain * pile) * DT) / (1 + params.digMarkGain * digging))) {
        dropGrain(ctx, i);
      }
    }
  } else if (outbound) {
    const dTube = Math.hypot(nx - farm.tubeX, ny - farm.tubeY);
    if (dTube < 3) enterTube(ctx, i);
    else if (!undertaker) {
      clearWay(ctx, i, dTube < TUBE_CLEAR);
      // Lost: an ant that has looked for the way out this long gives up, goes back in among its
      // nestmates and no longer trusts its path integrator to the tube (M5c). Without this, an ant whose
      // integrator had drifted could stay pressed into a corner of the headspace until it starved.
      if (isOutbound(ants.state[i]!) && ++ants.timer[i]! > params.tubeSearchMax * STEPS_PER_SECOND) {
        ants.state[i] = AntState.wandering;
        ants.knowsTube[i] = 0;
        ants.timer[i] = 0;
      }
    } else if (++ants.timer[i]! > params.corpseCarryMax * STEPS_PER_SECOND) dropCorpse(ctx, i); // lost: it gives up
  } else if (inbound) {
    if (state === AntState.returning && params.trailLaying) {
      depositTrail(farm, nx, ny, params.trailDeposit * params.speed * DT * ants.cropQuality[i]!);
    }
    const inSeconds = ++ants.timer[i]! / STEPS_PER_SECOND;
    // Home is where the colony smells strong or nestmates rest; with no nest yet, anywhere well inside the farm.
    if (sampleField(farm, farm.odour, nx, ny) >= params.homeOdour || restingNear[i] || inSeconds > 90) arriveHome(ctx, i);
  }
}

/**
 * A wandering ant may pick up a grain from the soil its antennae touch:
 * the face straight ahead, or, where the passage is narrower than its body,
 * the wall beside it (so tunnels end up a body's width wide). It digs more
 * when crowded, where it is hemmed in (a dent gets deeper, a flat face is
 * mostly left alone) and where others dug recently. Returns true if it dug.
 */
function tryDig(ctx: AntContext, i: number): boolean {
  const { ants, farm, params, rng } = ctx;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  const h = ants.heading[i]!;
  let face = squeezedWall(ctx, i);
  if (face < 0) face = touchedAhead(ctx, i);
  if (face < 0) return false;
  const hemmed = enclosure(ctx, x, y);
  // Out in the open, loose grains are spoil already dug: leave the heaps be, except where they bury the
  // hole the ant came out by, which it digs open again. Inside the soil, loose grains are debris that
  // fell in: clear them like the face.
  const atHole =
    hemmed < INSIDE && ants.hasHole[i] === 1 && Math.hypot(ants.holeX[i]! - ants.piX[i]!, ants.holeY[i]! - ants.piY[i]!) < 5;
  if (farm.loose[face] && hemmed < INSIDE && !atHole) return false;
  // Past here, loose grains block a way: debris in a tunnel, or spoil over the ant's own hole.
  const clearing = farm.loose[face] === 1;
  // An ant with protein for the brood takes it there before taking up digging, but clears its way.
  const errand = ants.cropProtein[i]! >= params.nurseLoad || ants.pieceHeld[i]! >= 0;
  if (errand && !clearing) return false;
  const cx = face % farm.width;
  const cy = (face - cx) / farm.width;
  const e = ants.encounters[i]!;
  // Digging is done in company (Chen 1937), but an ant shut out of its nest, or one on its way to the
  // brood, clears what blocks it alone, as ants heading out clear the way to the tube.
  const alone = atHole || (errand && clearing);
  const crowd = alone ? 1 : params.crowdControl ? (e * e) / (e * e + params.crowdHalf * params.crowdHalf) : 0.5;
  const mark = sampleField(farm, farm.digMark, cx + 0.5, cy + 0.5);
  // Debris is cleared wherever it lies in a tunnel; new digging is mostly at dead ends.
  const where = farm.loose[face] ? 1 : Math.pow(hemmed, params.hemmedPower);
  const p = params.digRate * crowd * where * (1 + params.digMarkGain * mark) * DT;
  if (!rng.chance(p)) return false;
  const grain = removeGrain(farm, cx, cy);
  ants.dug[i]! += 1;
  addToField(farm, farm.digMark, cx + 0.5, cy + 0.5, 1);
  ants.digX[i] = ants.piX[i]!;
  ants.digY[i] = ants.piY[i]!;
  ants.hasDigSite[i] = 1;
  ants.grain[i] = grain.material;
  ants.grainMoisture[i] = grain.moisture;
  ants.state[i] = AntState.carrying;
  ants.timer[i] = 0;
  ants.carryOut[i] = 0;
  ants.heading[i] = wrapAngle(h + Math.PI);
  return true;
}

/**
 * An ant on its way out picks up loose soil that blocks its way (spoil that
 * slid into a tunnel) and carries it off; near the tube it clears any soil
 * from the mouth.
 */
function clearWay(ctx: AntContext, i: number, nearTube: boolean): void {
  const { ants, farm, params, rng } = ctx;
  const face = touchedAhead(ctx, i);
  if (face < 0 || !(nearTube || farm.loose[face]) || !rng.chance(params.digRate * DT)) return;
  const cx = face % farm.width;
  const cy = (face - cx) / farm.width;
  const grain = removeGrain(farm, cx, cy);
  ants.dug[i]! += 1;
  ants.digX[i] = ants.piX[i]!;
  ants.digY[i] = ants.piY[i]!;
  ants.hasDigSite[i] = 0;
  ants.grain[i] = grain.material;
  ants.grainMoisture[i] = grain.moisture;
  ants.resume[i] = ants.state[i]!; // once the grain is dumped, it carries on out
  ants.state[i] = AntState.carrying;
  ants.timer[i] = 0;
  ants.carryOut[i] = 0;
  ants.heading[i] = wrapAngle(ants.heading[i]! + Math.PI);
}

/** The first soil cell the antennae touch straight ahead, or -1. */
function touchedAhead(ctx: AntContext, i: number): number {
  const { ants, farm, params } = ctx;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  const h = ants.heading[i]!;
  for (let d = 0.5; d <= params.antennaReach; d += 0.5) {
    const px = Math.floor(x + d * Math.cos(h));
    const py = Math.floor(y + d * Math.sin(h));
    if (cellSolid(farm, px, py)) return isSoil(farm, px, py) ? py * farm.width + px : -1;
  }
  return -1;
}

/**
 * If soil presses on both flanks of the ant (closer than half a body width
 * either side), the cell of one flank, chosen at random; otherwise -1.
 */
function squeezedWall(ctx: AntContext, i: number): number {
  const { ants, farm, params, rng } = ctx;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  const h = ants.heading[i]!;
  const half = params.bodyWidth / 2 + 0.5;
  const nx = -Math.sin(h);
  const ny = Math.cos(h);
  const lx = Math.floor(x - half * nx);
  const ly = Math.floor(y - half * ny);
  const rx = Math.floor(x + half * nx);
  const ry = Math.floor(y + half * ny);
  if (!cellSolid(farm, lx, ly) || !cellSolid(farm, rx, ry)) return -1;
  const left = isSoil(farm, lx, ly);
  const right = isSoil(farm, rx, ry);
  if (!left && !right) return -1;
  const pickLeft = left && (!right || rng.chance(0.5));
  return pickLeft ? ly * farm.width + lx : ry * farm.width + rx;
}

/** Puts the carried grain down where the ant stands (or in the nearest free cell); it settles by itself. */
function dropGrain(ctx: AntContext, i: number): void {
  const { ants, farm } = ctx;
  const cx = Math.floor(ants.x[i]!);
  const cy = Math.floor(ants.y[i]!);
  for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]] as const) {
    if (!cellSolid(farm, cx + dx, cy + dy)) {
      placeGrain(farm, cx + dx, cy + dy, ants.grain[i]!, ants.grainMoisture[i]!);
      ants.grain[i] = 0;
      ants.grainMoisture[i] = 0;
      ants.state[i] = ants.resume[i] || AntState.wandering;
      ants.resume[i] = 0;
      ants.timer[i] = 0;
      return;
    }
  }
  ants.timer[i] = 0; // no room here: carry on and try again later
}

/** Order in which a buried ant looks for air around it: upwards first, then the sides, then down. */
const ESCAPE: readonly (readonly [number, number])[] = (() => {
  const offsets: [number, number][] = [];
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) offsets.push([dx, dy]);
    }
  }
  return offsets;
})();

/**
 * Loose grains fell onto the ant. It pushes its way out to air within a few
 * mm or, if there is none and its mandibles are free, picks up the grain
 * on top of it. Returns true if that took its step.
 */
function unbury(ctx: AntContext, i: number): boolean {
  const { ants, farm } = ctx;
  const cx = Math.floor(ants.x[i]!);
  const cy = Math.floor(ants.y[i]!);
  for (const [dx, dy] of ESCAPE) {
    if (!cellSolid(farm, cx + dx, cy + dy)) {
      ants.x[i] = cx + dx + 0.5;
      ants.y[i] = cy + dy + 0.5;
      return true;
    }
  }
  const busy = ants.state[i] === AntState.carrying || ants.state[i] === AntState.carryingBrood || ants.state[i] === AntState.carryingCorpse;
  if (busy || ants.caste[i] === Caste.queen || !isSoil(farm, cx, cy)) return true;
  const grain = removeGrain(farm, cx, cy);
  ants.grain[i] = grain.material;
  ants.grainMoisture[i] = grain.moisture;
  ants.digX[i] = ants.piX[i]!;
  ants.digY[i] = ants.piY[i]!;
  ants.hasDigSite[i] = 0;
  ants.state[i] = AntState.carrying;
  ants.timer[i] = 0;
  ants.carryOut[i] = 0;
  return true;
}

/** Where a shut-in ant digs, best first: straight up, then up to either side. */
const UPWARDS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, -1],
  [1, -1],
];

/** Air cells an ant's pocket must hold, all joined to its own, for it to have a way on rather than be shut in. */
const POCKET = 20;
/** Scratch for `shutIn`: cells reached, as y * width + x. */
const pocket: number[] = [];

/** True if the air round (cx, cy) is a closed pocket of fewer than `POCKET` cells: the tip of a tunnel leads on, a cave-in does not. */
function shutIn(farm: Farm, cx: number, cy: number): boolean {
  const w = farm.width;
  pocket.length = 0;
  pocket.push(cy * w + cx);
  for (let k = 0; k < pocket.length; k++) {
    const c = pocket[k]!;
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (cellSolid(farm, nx, ny)) continue;
      const n = ny * w + nx;
      if (pocket.includes(n)) continue;
      pocket.push(n);
      if (pocket.length >= POCKET) return false;
    }
  }
  return true;
}

/**
 * An ant shut in by sand (a cave-in, or loose sand fallen round it) with no
 * room to walk feels sand pressing on every side; if that lasts (digOutAfter)
 * it digs its way up: it
 * takes the grain above it, pushes it down behind itself and climbs into the
 * space, until it is out where there is room (M5c). An ant already carrying
 * a grain leaves that one behind and takes the next. Returns true if that
 * took its step.
 */
function digOut(ctx: AntContext, i: number): boolean {
  const { ants, farm, params, rng } = ctx;
  const state = ants.state[i]!;
  if (state === AntState.sharing || state === AntState.carryingBrood || state === AntState.carryingCorpse) return false;
  const cx = Math.floor(ants.x[i]!);
  const cy = Math.floor(ants.y[i]!);
  // (A quick look first: with this much air in the 5 × 5 mm round it, the ant's pocket is not small.)
  let air = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!cellSolid(farm, cx + dx, cy + dy)) air++;
  if (air >= POCKET || !shutIn(farm, cx, cy)) {
    ants.shutIn[i] = 0;
    return false;
  }
  // A moment in a tight spot is normal; only an ant that stays shut in digs out.
  if ((ants.shutIn[i]! += DT) < params.digOutAfter) return false;
  if (!rng.chance(params.digRate * DT)) return true;
  let to: readonly [number, number] | undefined;
  for (const d of UPWARDS) if (!cellSolid(farm, cx + d[0], cy + d[1])) to ??= d;
  for (const d of UPWARDS) if (isSoil(farm, cx + d[0], cy + d[1])) to ??= d;
  if (!to) return true; // against the frame: nothing to dig
  const tx = cx + to[0];
  const ty = cy + to[1];
  if (isSoil(farm, tx, ty)) {
    const grain = removeGrain(farm, tx, ty);
    if (state === AntState.carrying) {
      placeGrain(farm, cx, cy, ants.grain[i]!, ants.grainMoisture[i]!);
      ants.grain[i] = grain.material;
      ants.grainMoisture[i] = grain.moisture;
    } else placeGrain(farm, cx, cy, grain.material, grain.moisture);
  }
  ants.x[i] = tx + 0.5;
  ants.y[i] = ty + 0.5;
  ants.heading[i] = -Math.PI / 2;
  if (state === AntState.resting) ants.state[i] = AntState.wandering;
  return true;
}

/** A forager back with food keeps it in its crop, to share with the nestmates that beg, and excites those it meets. */
function arriveHome(ctx: AntContext, i: number): void {
  const { ants, params } = ctx;
  if (ants.state[i] === AntState.returning) {
    ants.recruiting[i] = Math.round(params.recruitTime * STEPS_PER_SECOND * Math.min(1, ants.cropQuality[i]! * 2));
  }
  ants.state[i] = AntState.wandering;
  ants.timer[i] = 0;
}

/**
 * Fraction of 8 directions, 3 mm out, where the ant would touch firm soil:
 * how sheltered the spot is. The frame and lid don't count (ants seek the
 * dark, damp shelter of soil), and nor do loose spoil heaps. In a bought
 * nest the ant is always under the floor's roof, the lid a chamber's depth
 * above it, so it counts half sheltered anywhere, and more against a wall.
 */
function enclosure(ctx: AntContext, x: number, y: number): number {
  const { farm } = ctx;
  let soil = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const cx = Math.floor(x + 3 * Math.cos(a));
    const cy = Math.floor(y + 3 * Math.sin(a));
    if (farm.table ? cellSolid(farm, cx, cy) : isSoil(farm, cx, cy) && !farm.loose[cy * farm.width + cx]) soil++;
  }
  return farm.table ? (1 + soil / 8) / 2 : soil / 8;
}

/** True where the ant is out on the surface under the open headspace rather than inside the soil; never in a bought nest. */
function inTheOpen(ctx: AntContext, x: number, y: number): boolean {
  return !ctx.farm.table && openAbove(ctx.farm, x, y) && enclosure(ctx, x, y) < INSIDE;
}

/** Loose grains in the 8 cells around (x, y). */
function looseNeighbours(ctx: AntContext, x: number, y: number): number {
  const { farm } = ctx;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if ((dx || dy) && px >= 0 && py >= 0 && px < farm.width && py < farm.height && farm.loose[py * farm.width + px]) n++;
    }
  }
  return n;
}

/** The tube's draught at a point: strongest at its mouth. */
/**
 * True over the tube's mouth or anywhere above it, where a dropped grain could
 * fall or slide onto the mouth and bury the colony's only way out.
 */
function aboveTube(farm: Farm, x: number, y: number): boolean {
  return Math.abs(x - farm.tubeX) < TUBE_CLEAR && y < farm.tubeY + TUBE_CLEAR;
}

function tubeScent(ctx: AntContext, x: number, y: number): number {
  const d = Math.hypot(x - ctx.farm.tubeX, y - ctx.farm.tubeY);
  return Math.exp(-d / (ctx.params.nestScentRange / 3));
}
