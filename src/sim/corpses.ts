/**
 * Death and corpses (DESIGN.md section 7.4, M4c).
 *
 * A worker dies of old age and stays where it fell, as a corpse: the dead
 * ant keeps its place in the ants' arrays, in state `dead`. After about a
 * day the fatty acids of decay build up on it (Wilson et al. 1958), and a
 * worker that touches it picks it up and carries it out of the nest, through
 * the tube and away into the arena. There carriers put corpses down where
 * corpses already lie (Deneubourg et al. 1991; Theraulaz et al. 2002), so
 * the colony's dead end up in a few piles: the midden. Nobody knows where the
 * midden is; it is wherever the corpses happen to have piled up.
 */
import { type AntContext, type Ants, AntState, Caste, Cause, DT, Place } from './ants';
import { temperatureAt } from './heat';
import type { AntParams } from './params';
import { Purpose, Rng } from './rng';
import { humidityAt } from './water';
import { dropPiece } from './prey';

/** Where a carried corpse is held, ahead of the carrier's centre, mm. */
const CORPSE_AHEAD = 3;

/** Γ(x) for x > 0 (Lanczos approximation, g = 7), for the mean of a Weibull distribution. */
function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  x -= 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let k = 1; k < 9; k++) a += c[k]! / (x + k);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

/**
 * Worker `i`'s lifespan, tank days: a Weibull draw with mean `lifespanMean`,
 * given that the worker has already lived `age` days. The draw comes from
 * its own stream (tank seed, Purpose.lifespan, ant id), so it does not
 * disturb the simulation's random stream.
 */
export function drawLifespan(seed: number, i: number, age: number, params: AntParams): number {
  const k = params.lifespanShape;
  const scale = params.lifespanMean / gamma(1 + 1 / k);
  const u = new Rng(seed, Purpose.lifespan, i).float();
  return scale * Math.pow(Math.pow(age / scale, k) - Math.log(1 - u), 1 / k);
}

/** True for a worker that is alive and in the tank. */
export function isLiveWorker(ants: Ants, i: number): boolean {
  return ants.caste[i] === Caste.worker && ants.place[i] !== Place.gone && ants.state[i] !== AntState.dead;
}

/** States in which an ant holds nothing in its mandibles and is not mouth to mouth with a nestmate. */
function handsFree(state: number): boolean {
  return (
    state !== AntState.carrying &&
    state !== AntState.carryingBrood &&
    state !== AntState.carryingCorpse &&
    state !== AntState.sharing &&
    state !== AntState.feeding &&
    state !== AntState.atPrey
  );
}

/**
 * A worker past its lifespan dies at the next moment it is not holding
 * anything or walking the tube (a moment's delay, which keeps a load from
 * vanishing with it). Returns true if it died.
 */
export function dieOfAge(ctx: AntContext, i: number): boolean {
  const { ants } = ctx;
  const lifespan = ants.lifespan[i]!;
  if (lifespan <= 0 || ants.age[i]! < lifespan) return false;
  if (ants.place[i] === Place.tube || !handsFree(ants.state[i]!) || ants.pieceHeld[i]! >= 0) return false;
  die(ctx, i, Cause.age);
  return true;
}

/**
 * Hardship (M5c, with `mortal` on): an adult starves once its crop is empty
 * and its fat is spent, dries out in dry air, and cooks above `heatDeath`.
 * Each wears it down for so many tank days before it dies; food ends hunger
 * at once, damp air undoes drying slowly, and cooler air ends the heat. An
 * ant dies, as of age, at a moment its mouth is free and it is out of the
 * tube. Returns true if it died.
 */
export function endure(ctx: AntContext, i: number): boolean {
  const { ants, farm, params } = ctx;
  const days = DT / params.daySeconds;
  const inFarm = ants.place[i] === Place.farm;
  const x = ants.x[i]!;
  const y = ants.y[i]!;
  if (ants.caste[i] === Caste.worker && ants.crop[i]! <= 0 && ants.fat[i]! <= 0) ants.hunger[i]! += days;
  else ants.hunger[i] = 0;
  if (params.waterFlow) {
    const humidity = inFarm ? humidityAt(farm, x, y) : params.roomHumidity;
    if (humidity < params.adultDryHumidity) ants.thirst[i]! += days;
    else if (ants.thirst[i]! > 0) ants.thirst[i] = Math.max(0, ants.thirst[i]! - 4 * days);
  }
  const temperature = inFarm ? temperatureAt(farm, x, y) : params.roomTemperature;
  if (temperature > params.heatDeath) ants.heat[i]! += days;
  else ants.heat[i] = 0;
  const cause =
    ants.hunger[i]! >= params.starveDays
      ? Cause.hunger
      : ants.thirst[i]! >= params.adultDryDays
        ? Cause.drying
        : ants.heat[i]! >= params.heatDeathDays
          ? Cause.heat
          : Cause.none;
  if (cause === Cause.none || ants.place[i] === Place.tube || !handsFree(ants.state[i]!) || ants.pieceHeld[i]! >= 0) return false;
  die(ctx, i, cause);
  return true;
}

/** The ant dies where it is, of `cause`. What was in its crop is lost with it. */
export function die(ctx: AntContext, i: number, cause: Cause): void {
  const { ants } = ctx;
  ants.state[i] = AntState.dead;
  ants.cause[i] = cause;
  ants.deadFor[i] = 0;
  ants.crop[i] = 0;
  ants.cropProtein[i] = 0;
  ants.cropQuality[i] = 0;
  ants.timer[i] = 0;
  ants.foodId[i] = -1;
  ants.recruiting[i] = 0;
  ants.excitement[i] = 0;
  ants.broodNeed[i] = 0;
  ants.corpseVersion++;
}

/** A carried corpse is held out in front of its carrier and goes where it goes. */
export function holdCorpse(ctx: AntContext, i: number): void {
  const { ants } = ctx;
  const k = ants.corpseHeld[i]!;
  const h = ants.heading[i]!;
  ants.place[k] = ants.place[i]!;
  ants.x[k] = ants.x[i]! + CORPSE_AHEAD * Math.cos(h);
  ants.y[k] = ants.y[i]! + CORPSE_AHEAD * Math.sin(h);
  ants.heading[k] = h;
}

/**
 * Corpses lying (not carried) in the arena and the farm, bucketed by
 * position so an ant can count those round it quickly. Rebuilt only when a
 * corpse is picked up, put down or appears (`Ants.corpseVersion`).
 */
interface CorpseIndex {
  version: number;
  ants: Ants | undefined;
  /** Per place (arena 0, farm 1): bucket starts and corpse ids by bucket. */
  start: Int32Array[];
  ids: Int32Array[];
  width: number[];
  height: number[];
}

/** Bucket size, mm: at least the furthest an ant feels for corpses. */
const BUCKET = 5;

const index: CorpseIndex = { version: -1, ants: undefined, start: [], ids: [], width: [], height: [] };

function corpseIndex(ctx: AntContext): CorpseIndex {
  const { ants } = ctx;
  if (index.ants === ants && index.version === ants.corpseVersion) return index;
  index.ants = ants;
  index.version = ants.corpseVersion;
  const sizes = [
    [ctx.arena.width, ctx.arena.height],
    [ctx.farm.width, ctx.farm.height],
  ];
  for (let p = 0; p < 2; p++) {
    const bw = Math.ceil(sizes[p]![0]! / BUCKET);
    const bh = Math.ceil(sizes[p]![1]! / BUCKET);
    const start = new Int32Array(bw * bh + 1);
    let n = 0;
    for (let i = 0; i < ants.count; i++) {
      if (!lying(ants, i, p)) continue;
      start[bucket(ants.x[i]!, ants.y[i]!, bw, bh) + 1]!++;
      n++;
    }
    for (let b = 0; b < bw * bh; b++) start[b + 1]! += start[b]!;
    const fill = start.slice(0, bw * bh);
    const ids = new Int32Array(n);
    for (let i = 0; i < ants.count; i++) if (lying(ants, i, p)) ids[fill[bucket(ants.x[i]!, ants.y[i]!, bw, bh)]!++] = i;
    index.start[p] = start;
    index.ids[p] = ids;
    index.width[p] = bw;
    index.height[p] = bh;
  }
  return index;
}

/** A corpse lying in place `p`, not in anyone's mandibles. */
function lying(ants: Ants, i: number, p: number): boolean {
  return ants.state[i] === AntState.dead && ants.place[i] === p && ants.carriedBy[i] === -1;
}

function bucket(x: number, y: number, bw: number, bh: number): number {
  return Math.min(bh - 1, Math.max(0, Math.floor(y / BUCKET))) * bw + Math.min(bw - 1, Math.max(0, Math.floor(x / BUCKET)));
}

/**
 * Calls `visit` for each corpse lying in `place` within `r` mm of (x, y),
 * in bucket order, until it returns true.
 */
function eachCorpseNear(ctx: AntContext, place: number, x: number, y: number, r: number, visit: (k: number) => boolean | void): void {
  if (place !== Place.arena && place !== Place.farm) return;
  const ix = corpseIndex(ctx);
  const ids = ix.ids[place]!;
  if (ids.length === 0) return;
  const start = ix.start[place]!;
  const bw = ix.width[place]!;
  const bh = ix.height[place]!;
  const { ants } = ctx;
  const bx0 = Math.max(0, Math.floor((x - r) / BUCKET));
  const bx1 = Math.min(bw - 1, Math.floor((x + r) / BUCKET));
  const by0 = Math.max(0, Math.floor((y - r) / BUCKET));
  const by1 = Math.min(bh - 1, Math.floor((y + r) / BUCKET));
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const b = by * bw + bx;
      for (let n = start[b]!; n < start[b + 1]!; n++) {
        const k = ids[n]!;
        const dx = ants.x[k]! - x;
        const dy = ants.y[k]! - y;
        if (dx * dx + dy * dy <= r * r && visit(k)) return;
      }
    }
  }
}

/** Corpses lying within `corpseSenseRadius` of (x, y) in `place`, but `skip`. */
export function corpsesAround(ctx: AntContext, place: number, x: number, y: number, skip = -1): number {
  let n = 0;
  eachCorpseNear(ctx, place, x, y, ctx.params.corpseSenseRadius, (k) => {
    if (k !== skip) n++;
  });
  return n;
}

/**
 * A worker with free mandibles that touches a corpse smelling of death may
 * pick it up, the less readily the more corpses lie round it. Returns true
 * if it did; it is then carrying the corpse.
 */
export function tryPickUpCorpse(ctx: AntContext, i: number): boolean {
  const { ants, params, rng } = ctx;
  if (ants.caste[i] !== Caste.worker) return false;
  const place = ants.place[i]!;
  let found = -1;
  eachCorpseNear(ctx, place, ants.x[i]!, ants.y[i]!, params.contactRadius, (k) => {
    if (ants.deadFor[k]! < params.corpseCueDays) return false;
    found = k;
    return true;
  });
  if (found < 0) return false;
  const n = params.corpseClustering ? corpsesAround(ctx, place, ants.x[found]!, ants.y[found]!, found) : 0;
  const alone = params.corpsePickHalf / (params.corpsePickHalf + n);
  if (!rng.chance(params.corpsePickRate * alone * alone * DT)) return false;
  ants.corpseHeld[i] = found;
  ants.corpsesCarried[i]! += 1;
  ants.carriedBy[found] = i;
  ants.state[i] = AntState.carryingCorpse;
  ants.timer[i] = 0;
  ants.hasDigSite[i] = 0;
  ants.corpseVersion++;
  holdCorpse(ctx, i);
  return true;
}

/**
 * A carrier out of the nest may put its corpse down: now and then for no
 * reason (Theraulaz et al. 2002 measured 0.012 per second), and much more
 * readily where corpses already lie. Returns true if it did.
 */
export function mayDropCorpse(ctx: AntContext, i: number): boolean {
  const { ants, params, rng } = ctx;
  const n = params.corpseClustering ? corpsesAround(ctx, ants.place[i]!, ants.x[i]!, ants.y[i]!) : 0;
  const thick = n / (params.corpseDropHalf + n);
  if (!rng.chance((params.corpseDropSpont + params.corpseDropRate * thick * thick) * DT)) return false;
  dropCorpse(ctx, i);
  return true;
}

/** The carrier puts its corpse down where it stands (in the arena: then it heads home). */
export function dropCorpse(ctx: AntContext, i: number): void {
  const { ants } = ctx;
  const k = ants.corpseHeld[i]!;
  if (k >= 0) {
    ants.x[k] = ants.x[i]!;
    ants.y[k] = ants.y[i]!;
    ants.place[k] = ants.place[i]!;
    ants.carriedBy[k] = -1;
  }
  ants.corpseHeld[i] = -1;
  // Or the husk of an insect, or a mouldy piece (Arena 3).
  if (ants.pieceHeld[i]! >= 0) dropPiece(ctx, i);
  ants.state[i] = ants.place[i] === Place.arena ? AntState.homing : AntState.wandering;
  ants.timer[i] = 0;
  ants.corpseVersion++;
}
