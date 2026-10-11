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
  DT,
  Place,
  enterTube,
  isOutbound,
  moveAnt,
  wrapAngle,
} from './ants';
import { addToField, cellSolid, isBlockedFarm, isSoil, openAbove, sampleField } from './farm';
import { placeGrain, removeGrain } from './soil';
import { STEPS_PER_SECOND } from './time';

/** Size of a bucket in the contact grid, mm; must be at least the contact radius. */
const BUCKET = 4;

/** Enclosure (see `enclosure`) from which an ant counts itself inside the soil rather than out on the surface. */
const INSIDE = 0.5;

/** Within this distance of the tube's mouth, mm, ants keep the way clear: they drop no spoil and dig out any that blocks it. */
const TUBE_CLEAR = 15;

/** Scratch, rebuilt every step: whether each ant is touching a resting nestmate. */
let touchingRest = new Uint8Array(0);
/** Scratch for bucketing ants by position: bucket starts, fill pointers, each ant's bucket, ants by bucket. */
let start = new Int32Array(0);
let fill = new Int32Array(0);
let bucketOf = new Int32Array(0);
let members = new Int32Array(0);

/**
 * Antennal contacts between ants in the farm. Each ant updates how crowded
 * it has been lately and gets excited by foragers just back with food.
 */
export function computeContacts(ctx: AntContext): void {
  const { ants, farm, params } = ctx;
  if (touchingRest.length !== ants.count) touchingRest = new Uint8Array(ants.count);
  touchingRest.fill(0);

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
    if (ants.place[i] !== Place.farm) continue;
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
          if (ants.state[j] === AntState.resting) touchingRest[i] = 1;
        }
      }
    }
    ants.encounters[i] = ants.encounters[i]! * memory + touching * (1 - memory);
    ants.excitement[i]! += params.recruitPerContact * recruiters * DT;
    if (params.sharing && canShare(ants.state[i]!)) beg(ctx, i, bx, by, bw, bh);
  }
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
        if (j === i || !canShare(ants.state[j]!)) continue;
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
    ants.crop[i]! += flow;
    ants.crop[j]! -= flow;
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
  const state = ctx.ants.state[i];
  if (state === AntState.resting) rest(ctx, i);
  else if (state === AntState.sharing) share(ctx, i);
  else walkFarm(ctx, i);
}

function rest(ctx: AntContext, i: number): void {
  const { ants, farm, params } = ctx;
  addToField(farm, farm.odour, ants.x[i]!, ants.y[i]!, params.odourDeposit * DT);
  if (setOffToForage(ctx, i)) return;
  if (--ants.timer[i]! <= 0) ants.state[i] = AntState.wandering;
}

/**
 * Decides whether a resting or wandering ant sets off for the tube; returns
 * true if it does. Only workers with a low threshold go out much, and they
 * go out more the emptier their own crop: a forager that could unload its
 * crop at home goes back to the food; one that could not, because its
 * nestmates are full, mostly stays in and only scouts now and then.
 */
function setOffToForage(ctx: AntContext, i: number): boolean {
  const { ants, params, rng } = ctx;
  const own = ants.hasMemory[i] ? params.returnToFoodRate : params.forageRate;
  // How readily this worker forages at all (its threshold against the strongest stimulus, Bonabeau et
  // al. 1996), times how hungry it is: trips rise in step with hunger (Greenwald et al. 2018).
  const propensity = 1 / (1 + Math.pow(ants.forageThreshold[i]!, params.forageSteepness));
  const response = propensity * (params.scoutShare + (1 - params.scoutShare) * hunger(ctx, i));
  const rate = (own + params.recruitRate * ants.excitement[i]!) * response;
  if (!rng.chance(rate * DT)) return false;
  ants.state[i] = ants.hasMemory[i] ? AntState.toFood : AntState.exploring;
  ants.timer[i] = 0;
  ants.hasDigSite[i] = 0;
  return true;
}

function walkFarm(ctx: AntContext, i: number): void {
  const { ants, farm, params, rng } = ctx;
  const state = ants.state[i]!;
  const outbound = isOutbound(state);
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

  // Colony odour: going home follows it strongly; wandering ants keep near it.
  if (inbound || state === AntState.wandering) {
    const ol = sampleField(farm, farm.odour, lx, ly);
    const or = sampleField(farm, farm.odour, rx, ry);
    const gain = inbound ? params.odourTurn : params.odourTurn / 4;
    if (ol + or > 1e-3) turn += gain * DT * ((or - ol) / (ol + or));
  }
  // Underground, ants heading out (or carrying soil out) follow the fresh air towards the open.
  const outside = openAbove(farm, x, y) && enclosure(ctx, x, y) < INSIDE;
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
  if (state === AntState.wandering && ants.hasDigSite[i]) {
    // Back to the face it was digging, by its path integrator.
    goal = Math.atan2(ants.digY[i]! - ants.piY[i]!, ants.digX[i]! - ants.piX[i]!);
    strength = params.goalTurn;
  } else if (state === AntState.wandering) {
    goal = Math.PI / 2; // nest-building ants are drawn downwards, into the soil
    strength = params.geotaxis;
  } else if (state === AntState.carrying) {
    if (!outside) {
      goal = -Math.PI / 2; // up, towards the open
      strength = params.geotaxis;
    } else {
      // Out in the open: along the surface, away from the hole, by its path integrator.
      goal = ants.piX[i]! >= ants.digX[i]! ? 0 : Math.PI;
      strength = params.goalTurn;
    }
  } else if (inbound) {
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
    } else {
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

  moveAnt(ctx, i, wrapAngle(heading + turn), params.speed * DT, (px, py) => isBlockedFarm(farm, px, py));
  const nx = ants.x[i]!;
  const ny = ants.y[i]!;

  if (state === AntState.wandering) {
    if (ants.hasDigSite[i]) {
      const near = Math.hypot(ants.digX[i]! - ants.piX[i]!, ants.digY[i]! - ants.piY[i]!) < 2;
      if (near || ++ants.timer[i]! > params.digReturnTime * STEPS_PER_SECOND) ants.hasDigSite[i] = 0;
    }
    if (setOffToForage(ctx, i)) return;
    if (tryDig(ctx, i)) return;
    const enclosed = enclosure(ctx, nx, ny);
    const odour = sampleField(farm, farm.odour, nx, ny);
    const nestLike = odour / (odour + params.homeOdour);
    if (rng.chance(params.restRate * enclosed * (1 + params.restOdourGain * nestLike) * DT)) {
      ants.state[i] = AntState.resting;
      ants.hasDigSite[i] = 0;
      ants.timer[i] = Math.max(1, Math.round(-Math.log(1 - rng.float()) * params.restLength * STEPS_PER_SECOND));
    }
  } else if (state === AntState.carrying) {
    const carried = ++ants.timer[i]! / STEPS_PER_SECOND;
    if (carried >= params.maxCarryTime) {
      dropGrain(ctx, i);
    } else if (!(openAbove(farm, nx, ny) && enclosure(ctx, nx, ny) < INSIDE)) {
      ants.carryOut[i] = 0;
    } else if (
      ++ants.carryOut[i]! * params.speed * DT >= params.spoilDistance &&
      Math.hypot(nx - farm.tubeX, ny - farm.tubeY) >= TUBE_CLEAR
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
    else clearWay(ctx, i, dTube < TUBE_CLEAR);
  } else if (inbound) {
    if (state === AntState.returning && params.trailLaying) {
      depositTrail(farm, nx, ny, params.trailDeposit * params.speed * DT * ants.cropQuality[i]!);
    }
    const inSeconds = ++ants.timer[i]! / STEPS_PER_SECOND;
    // Home is where the colony smells strong or nestmates rest; with no nest yet, anywhere well inside the farm.
    if (sampleField(farm, farm.odour, nx, ny) >= params.homeOdour || touchingRest[i] || inSeconds > 90) arriveHome(ctx, i);
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
  // Out in the open, loose grains are spoil already dug: leave the heaps be.
  // Inside the soil, loose grains are debris that fell in: clear them like the face.
  if (farm.loose[face] && hemmed < INSIDE) return false;
  const cx = face % farm.width;
  const cy = (face - cx) / farm.width;
  const e = ants.encounters[i]!;
  const crowd = params.crowdControl ? (e * e) / (e * e + params.crowdHalf * params.crowdHalf) : 0.5;
  const mark = sampleField(farm, farm.digMark, cx + 0.5, cy + 0.5);
  // Debris is cleared wherever it lies in a tunnel; new digging is mostly at dead ends.
  const where = farm.loose[face] ? 1 : Math.pow(hemmed, params.hemmedPower);
  const p = params.digRate * crowd * where * (1 + params.digMarkGain * mark) * DT;
  if (!rng.chance(p)) return false;
  const grain = removeGrain(farm, cx, cy);
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
  if (ants.state[i] === AntState.carrying || !isSoil(farm, cx, cy)) return true;
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
 * dark, damp shelter of soil), and nor do loose spoil heaps.
 */
function enclosure(ctx: AntContext, x: number, y: number): number {
  const { farm } = ctx;
  let soil = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const cx = Math.floor(x + 3 * Math.cos(a));
    const cy = Math.floor(y + 3 * Math.sin(a));
    if (isSoil(farm, cx, cy) && !farm.loose[cy * farm.width + cx]) soil++;
  }
  return soil / 8;
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
function tubeScent(ctx: AntContext, x: number, y: number): number {
  const d = Math.hypot(x - ctx.farm.tubeX, y - ctx.farm.tubeY);
  return Math.exp(-d / (ctx.params.nestScentRange / 3));
}
