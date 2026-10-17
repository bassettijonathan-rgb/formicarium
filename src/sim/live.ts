/**
 * Live feeder insects in the arena (DESIGN.md 3.4, L1-L12; Marco,
 * 2026-10-17): a flightless fruit fly, a small cricket and a mealworm, put
 * in alive. They wander the arena at random (a fly in bursts, a cricket
 * walking and now and then hopping, a mealworm crawling), climb what lies on
 * the floor as the ants do, and never leave the arena. They do not eat,
 * drink or breed, and they cannot hurt an ant (L11).
 *
 * An ant notices one only by touching it (L4; Richard, Fabre & Dejean 2001):
 * a worker out in the arena that bumps into a live insect grabs it and hangs
 * on (L5, L9). Each ant holding it slows it; enough of them hold it still
 * (Dejean et al. 2007: large prey "spread-eagled" by several workers). It
 * struggles all the while, and may shake every holder off at once and run
 * (a cricket hops away): the more ants hold it, the less likely; a weak one
 * struggles less (L6; Richard et al. 2001: capture fails more often the
 * bigger the prey, and less once nestmates have joined). While held it
 * weakens, each holder adding its attack, and when its strength is gone it
 * dies (L8). An insect left alone dies of age (L3). Dead, it becomes an
 * ordinary dead insect (prey.ts), lying where it died; the ants holding it
 * that want protein set to work on it at once.
 */
import { type AntContext, AntState, Caste, DT, Place, wantsProtein, wrapAngle } from './ants';
import { type Arena, floorStep, isBlocked } from './arena';
import { type Insect, type Piece, makeInsect, startAtPrey } from './prey';
import { Purpose, Rng } from './rng';
import { STEPS_PER_SECOND } from './time';

/** A live insect: plain data, in `World.live`. */
export interface LiveInsect {
  id: number;
  insect: Insect;
  x: number;
  y: number;
  /** Which way its head points, radians. */
  heading: number;
  /** Fight left in it: 1 when put in, drained by the ants holding it; at 0 it dies. */
  strength: number;
  /** Tank days since it was put in, and the age at which it dies on its own (L3). */
  age: number;
  lifespan: number;
  /** Steps left of the current walk (`walking`) or pause. */
  timer: number;
  walking: boolean;
  /** A hop in progress (crickets): steps left in the air (0 on the ground), steps the whole hop takes, its length, mm, and its direction. */
  hop: number;
  hopSteps: number;
  hopLength: number;
  hopHeading: number;
  /** Steps left during which no ant gets a grip: it has just shaken its holders off and is running. */
  slip: number;
  /** Distance walked, mm, for drawing its legs. */
  walked: number;
  /** Ants holding it, counted each step. */
  holders: number;
  /** For the experiments: times an ant grabbed it while none held it, times it shook every holder off, and most ants holding it at once. */
  grabs: number;
  escapes: number;
  mostHolders: number;
}

interface LiveSpec {
  /** Walking speed, mm/s. */
  speed: number;
  /** Seconds a walk and a pause last, each drawn evenly from its range. */
  walk: [number, number];
  pause: [number, number];
  /** How sharply it turns as it walks, radians per √s. */
  wiggle: number;
  /** How often it hops while free, per second, and how far, mm (0 for insects that do not hop). */
  hopRate: number;
  hop: [number, number];
  /** Half its length, and half its width with its legs, mm: an ant touches it within these of its middle line. */
  half: number;
  side: number;
  /** Ants that hold it still (L5), and most that find room round it to take hold (rough: its outline over an ant's width). */
  pinned: number;
  room: number;
  /** How often a fresh insect held by ants that cannot pin it shakes them off, per second, before the share they pin (L6). */
  escape: number;
  /** Seconds of one ant's attack that kill it (L8). */
  toughness: number;
  /** Tank days it lives on its own, ±30% (L3). */
  life: number;
}

/**
 * The live insects (L2; rough, from keepers: a flightless fruit fly walks
 * in bursts at about an ant's speed, a small cricket walks a little faster
 * and hops 3-6 cm, a mealworm crawls about 4 mm/s). How many ants pin each
 * and how long it takes to kill are rough too: Dejean et al. (2007) saw large
 * prey held still by several workers, each pulling a leg or antenna, and
 * killed in minutes; a fruit fly is overpowered by one worker in seconds.
 */
export const LIVE: Record<Insect, LiveSpec> = {
  fly: { speed: 15, walk: [0.5, 3], pause: [1, 5], wiggle: 2, hopRate: 0, hop: [0, 0], half: 1.25, side: 1.2, pinned: 1.5, room: 3, escape: 0.5, toughness: 4, life: 2 },
  cricket: { speed: 20, walk: [1, 5], pause: [2, 10], wiggle: 1.5, hopRate: 1 / 30, hop: [30, 60], half: 7.5, side: 3, pinned: 4, room: 12, escape: 1, toughness: 300, life: 5 },
  mealworm: { speed: 4, walk: [10, 40], pause: [2, 10], wiggle: 0.8, hopRate: 0, hop: [0, 0], half: 11, side: 1.6, pinned: 6, room: 14, escape: 1, toughness: 1500, life: 20 },
};

/** How far beyond an insect's outline an ant touches it, mm: its antennae and mandibles. */
const TOUCH = 1.5;
/** Seconds a hop lasts (rough: a small cricket's jump). */
const HOP_TIME = 0.3;
/** Seconds an insect that has shaken its holders off runs at twice its speed, slipping every grip (rough). */
const SLIP_TIME = 1.5;

/** A live insect of kind `insect` put in at (x, y), facing any way, numbered `id`. */
export function makeLive(seed: number, step: number, id: number, insect: Insect, x: number, y: number): LiveInsect {
  const rng = new Rng(seed, Purpose.live, step, id);
  const spec = LIVE[insect];
  return {
    id,
    insect,
    x,
    y,
    heading: rng.range(-Math.PI, Math.PI),
    strength: 1,
    age: 0,
    lifespan: spec.life * rng.range(0.7, 1.3),
    timer: Math.round(rng.range(spec.walk[0], spec.walk[1]) * STEPS_PER_SECOND),
    walking: true,
    hop: 0,
    hopSteps: 0,
    hopLength: 0,
    hopHeading: 0,
    slip: 0,
    walked: 0,
    holders: 0,
    grabs: 0,
    escapes: 0,
    mostHolders: 0,
  };
}

/** Where (x, y) lies in the insect's own frame: along its body toward the head, and to its left. */
function toLocal(b: LiveInsect, x: number, y: number): { u: number; v: number } {
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  const dx = x - b.x;
  const dy = y - b.y;
  return { u: dx * c + dy * s, v: -dx * s + dy * c };
}

/** How far (x, y) is from the insect's outline, mm (negative inside it). */
export function liveGap(b: LiveInsect, x: number, y: number): number {
  const spec = LIVE[b.insect];
  const { u, v } = toLocal(b, x, y);
  const along = Math.max(0, Math.abs(u) - spec.half);
  return Math.hypot(along, v) - spec.side;
}

/** True for a worker that grabs a live insect it touches: out in the arena on its own errands, its mandibles free (L9). */
function mayGrab(ctx: AntContext, i: number): boolean {
  const { ants } = ctx;
  const state = ants.state[i]!;
  return (
    ants.caste[i] === Caste.worker &&
    ants.place[i] === Place.arena &&
    ants.pieceHeld[i]! < 0 &&
    ants.corpseHeld[i]! < 0 &&
    (state === AntState.exploring || state === AntState.toFood || state === AntState.homing || state === AntState.returning)
  );
}

/**
 * A worker walking in the arena that touches a live insect grabs it and
 * holds on (L4, L5, L9). Returns true if it did.
 */
export function grabLive(ctx: AntContext, i: number): boolean {
  const live = ctx.live;
  if (!live || live.length === 0 || !mayGrab(ctx, i)) return false;
  const { ants } = ctx;
  for (const b of live) {
    // In the air, or slipping out of every grip as it runs, or with no room left round it: not to be had.
    if (b.hop > 0 || b.slip > 0 || b.holders >= LIVE[b.insect].room) continue;
    if (liveGap(b, ants.x[i]!, ants.y[i]!) > TOUCH) continue;
    if (b.holders === 0) b.grabs++;
    b.holders++;
    ants.resume[i] = ants.state[i]!;
    ants.state[i] = AntState.holding;
    ants.liveHeld[i] = b.id;
    const { u, v } = toLocal(b, ants.x[i]!, ants.y[i]!);
    ants.holdU[i] = u;
    ants.holdV[i] = v;
    return true;
  }
  return false;
}

/** A holder lets go (or is shaken off) and goes back to what it was doing. */
function letGo(ctx: AntContext, i: number): void {
  const { ants } = ctx;
  ants.liveHeld[i] = -1;
  if (ants.state[i] === AntState.holding) {
    ants.state[i] = ants.resume[i]!;
    ants.resume[i] = 0;
  }
}

/** A holding ant whose insect is gone (died, or taken out by the keeper) goes back to what it was doing. */
export function holdLive(ctx: AntContext, i: number): void {
  const id = ctx.ants.liveHeld[i]!;
  if (!ctx.live?.some((b) => b.id === id)) letGo(ctx, i);
}

/** What the live insects need of the world besides the ants' view. */
export interface LiveWorld {
  seed: number;
  step: number;
  nextFoodId: number;
  live: LiveInsect[];
}

/**
 * Advances the live insects by one step, after the ants have moved: each
 * ages, is weakened by its holders, dies or struggles, and moves, dragging
 * its holders with it.
 */
export function stepLive(world: LiveWorld, ctx: AntContext): void {
  const { ants, params, rng } = ctx;
  const live = world.live;
  for (const b of live) b.holders = 0;
  const attack = new Map<number, number>();
  for (let i = 0; i < ants.count; i++) {
    const id = ants.liveHeld[i]!;
    if (id < 0) continue;
    const b = ants.state[i] === AntState.holding && ants.place[i] === Place.arena ? live.find((q) => q.id === id) : undefined;
    if (!b) {
      letGo(ctx, i);
      continue;
    }
    b.holders++;
    attack.set(id, (attack.get(id) ?? 0) + params.liveAttack);
  }
  for (const b of [...live]) {
    const spec = LIVE[b.insect];
    b.mostHolders = Math.max(b.mostHolders, b.holders);
    b.age += DT / params.daySeconds;
    b.strength -= (DT * (attack.get(b.id) ?? 0)) / spec.toughness;
    if (b.strength <= 0 || b.age >= b.lifespan) {
      die(world, ctx, b);
      continue;
    }
    if (b.slip > 0) b.slip--;
    if (b.holders > 0) {
      // It struggles to shake them off: the fewer of what it takes to pin it, and the stronger it is, the likelier (L6).
      const free = Math.max(0, 1 - b.holders / spec.pinned);
      if (rng.chance(spec.escape * b.strength * free * free * DT)) breakFree(ctx, b);
    }
    move(ctx, b);
  }
}

/** The insect shakes off every ant holding it and runs, or (a cricket) hops away. */
function breakFree(ctx: AntContext, b: LiveInsect): void {
  const { ants, rng } = ctx;
  for (let i = 0; i < ants.count; i++) if (ants.liveHeld[i] === b.id) letGo(ctx, i);
  b.holders = 0;
  b.escapes++;
  b.slip = Math.round(SLIP_TIME * STEPS_PER_SECOND);
  b.walking = true;
  b.timer = b.slip;
  b.heading = wrapAngle(b.heading + rng.range(-1, 1));
  if (LIVE[b.insect].hopRate > 0) startHop(ctx, b);
}

function startHop(ctx: AntContext, b: LiveInsect): void {
  const spec = LIVE[b.insect];
  b.hopSteps = Math.round(HOP_TIME * STEPS_PER_SECOND);
  b.hop = b.hopSteps;
  b.hopLength = ctx.rng.range(spec.hop[0], spec.hop[1]);
  b.hopHeading = wrapAngle(b.heading + ctx.rng.range(-0.5, 0.5));
  b.heading = b.hopHeading;
}

function move(ctx: AntContext, b: LiveInsect): void {
  const { arena, rng } = ctx;
  const spec = LIVE[b.insect];
  if (b.hop > 0) {
    // In the air: straight on, landing early against the arena's wall.
    const d = b.hopLength / b.hopSteps;
    const nx = b.x + d * Math.cos(b.hopHeading);
    const ny = b.y + d * Math.sin(b.hopHeading);
    if (isBlocked(arena, nx, ny)) b.hop = 0;
    else {
      b.x = nx;
      b.y = ny;
      b.hop--;
    }
  } else {
    if (b.holders === 0 && b.slip === 0) {
      if (--b.timer <= 0) {
        b.walking = !b.walking;
        const [lo, hi] = b.walking ? spec.walk : spec.pause;
        b.timer = Math.round(rng.range(lo, hi) * STEPS_PER_SECOND);
      }
      if (spec.hopRate > 0 && rng.chance(spec.hopRate * DT)) startHop(ctx, b);
    }
    // Held, it pulls against its holders all the time; free, it walks only while not resting.
    if (b.hop === 0 && (b.walking || b.holders > 0 || b.slip > 0)) {
      b.heading = wrapAngle(b.heading + rng.normal(0, spec.wiggle * Math.sqrt(DT)));
      const pull = Math.max(0, 1 - b.holders / spec.pinned) * Math.sqrt(b.strength) * (b.slip > 0 ? 2 : 1);
      if (pull > 0) walkOn(arena, b, spec.speed * pull * DT, rng.chance(0.5) ? 1 : -1);
    }
  }
  if (b.holders > 0) drag(ctx, b);
}

/** Steps the insect forward, turning along a wall it meets (as `moveAnt`), or round if it is cornered. */
function walkOn(arena: Arena, b: LiveInsect, distance: number, side: number): void {
  for (let k = 0; k <= 8; k++) {
    for (const sign of k === 0 ? [0] : [side, -side]) {
      const h = b.heading + sign * k * 0.35;
      const d = floorStep(arena, b.x, b.y, h, distance);
      const nx = b.x + d * Math.cos(h);
      const ny = b.y + d * Math.sin(h);
      if (isBlocked(arena, nx, ny)) continue;
      b.x = nx;
      b.y = ny;
      b.heading = wrapAngle(h);
      b.walked += distance;
      return;
    }
  }
  b.heading = wrapAngle(b.heading + Math.PI);
}

/** The holders keep their grip where they took it, carried along as the insect moves and turns; each faces its body. */
function drag(ctx: AntContext, b: LiveInsect): void {
  const { ants, arena } = ctx;
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  const half = LIVE[b.insect].half;
  for (let i = 0; i < ants.count; i++) {
    if (ants.liveHeld[i] !== b.id) continue;
    const u = ants.holdU[i]!;
    const v = ants.holdV[i]!;
    let nx = b.x + u * c - v * s;
    let ny = b.y + u * s + v * c;
    // Pulled onto a wall the insect slipped past: it keeps its place.
    if (isBlocked(arena, nx, ny)) {
      nx = ants.x[i]!;
      ny = ants.y[i]!;
    }
    const moved = Math.hypot(nx - ants.x[i]!, ny - ants.y[i]!);
    // Dragged, it feels its own legs move: its path integrator counts it.
    ants.piX[i]! += nx - ants.x[i]!;
    ants.piY[i]! += ny - ants.y[i]!;
    ants.walked[i]! += moved;
    ants.x[i] = nx;
    ants.y[i] = ny;
    const au = Math.max(-half, Math.min(half, u));
    ants.heading[i] = Math.atan2(b.y + au * s - ny, b.x + au * c - nx);
  }
}

/**
 * The insect dies where it is (L3, L8) and becomes an ordinary dead insect,
 * whole, lying as it stood. Its holders let go; those that want protein set
 * to work on it at once (L9: whether it goes home is the dead insect's rule).
 */
function die(world: LiveWorld, ctx: AntContext, b: LiveInsect): void {
  const { ants } = ctx;
  world.live = world.live.filter((q) => q !== b);
  ctx.live = world.live;
  const pieces = makeInsect(world.seed, world.step, world.nextFoodId, b.insect, 'whole', b.x, b.y, b.heading);
  world.nextFoodId += pieces.length;
  ctx.prey.push(...pieces);
  for (let i = 0; i < ants.count; i++) {
    if (ants.liveHeld[i] !== b.id) continue;
    letGo(ctx, i);
    if (wantsProtein(ctx, i)) startAtPrey(ctx, i, nearest(pieces, ants.x[i]!, ants.y[i]!));
  }
}

function nearest(pieces: Piece[], x: number, y: number): Piece {
  let best = pieces[0]!;
  for (const p of pieces) if (Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y)) best = p;
  return best;
}

/** The keeper takes every live insect out of the arena; their holders let go. */
export function removeLive(world: LiveWorld, ctx: AntContext): void {
  world.live = [];
  ctx.live = world.live;
  for (let i = 0; i < ctx.ants.count; i++) if (ctx.ants.liveHeld[i]! >= 0) letGo(ctx, i);
}
