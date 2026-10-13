/**
 * Feeder insects (DESIGN.md section 3.4, B6-B8): a fruit fly, a cricket and
 * a mealworm, dead, as keepers buy them, given whole, cut in two or in
 * pieces.
 *
 * An insect is a set of pieces (head, thorax, abdomen, legs; a mealworm's
 * sections), each hanging from another by a joint until it is bitten off.
 * Its juice (haemolymph and soft tissue) can be drunk once it is cut open;
 * an open circulatory system, so a cut anywhere opens the juice of every
 * piece still joined to it. What is left when the juice is gone is the
 * hard skin: a husk.
 *
 * A forager that comes on an insect does what it can with it, by touch:
 *
 * 1. If the piece it touches is free and light enough, it carries it home.
 * 2. Else, if a part joined to it would be light enough once off (a leg),
 *    it bites at that joint; several ants bite faster. When the part comes
 *    off, the cut opens the body, and the ant carries the part home.
 * 3. Else, if the body is open, it drinks, and goes home with a crop full.
 * 4. Else it bites through the skin to open it.
 *
 * An ant that has bitten for `preyGiveUp` seconds without getting anything
 * goes home for help, laying trail. One carrying a piece lays trail if the
 * insect it came from is still there, too big to take (it touched it), and
 * none if it took the whole thing. So trail, and the crowd it brings, follows
 * whether the find can be taken home by one ant (Detrain & Deneubourg 1997):
 * a fruit fly goes home with one forager and little trail; a cricket draws a
 * trail and a crowd, and is cut up and drunk over hours.
 *
 * In the farm a carried piece is taken to the brood and put down there;
 * workers that touch it drink from it (and feed the protein on to the larvae,
 * farmAnts.ts); the husk is carried out to the midden like a corpse; and a
 * piece left uneaten goes mouldy (mould.ts).
 */
import { type AntContext, AntState, DT, Place } from './ants';
import { foodQuality } from './food';
import { temperatureAt } from './heat';
import type { AntParams } from './params';
import { Purpose, Rng } from './rng';
import { STEPS_PER_SECOND } from './time';

/** The feeder insects a keeper buys (B6). */
export type Insect = 'fly' | 'cricket' | 'mealworm';
/** How the keeper gives it: whole, cut in two, or cut into its parts (B6). */
export type Cut = 'whole' | 'halved' | 'pieces';
export type Part = 'fly' | 'head' | 'thorax' | 'abdomen' | 'hindLeg' | 'leg' | 'section';

/** A piece of a feeder insect: plain data, in `World.prey`. */
export interface Piece {
  id: number;
  insect: Insect;
  part: Part;
  /** Where it is (`Place`): the arena, the farm, the tube while carried, or gone (eaten in a lab nest). */
  place: number;
  x: number;
  y: number;
  /** Which way it points, radians. */
  angle: number;
  /** Its length and width, mm. */
  length: number;
  width: number;
  /** Fresh mass, mg: hard skin plus juice (1 µL of juice weighs about 1 mg). */
  mass: number;
  /** Juice left, µL: what can be drunk. */
  juice: number;
  /** Wounds in it: cuts where a part came off, or bitten through its skin. Two workers can drink at each. */
  cuts: number;
  /** The piece it hangs from by a joint, or -1 once free. */
  joint: number;
  /** Seconds of one ant biting to cut that joint. */
  toughness: number;
  /** Seconds of one ant biting to open its skin. */
  skin: number;
  /** Seconds of biting it has had so far (at its joint while it could come off, else at its skin). */
  bitten: number;
  /** The ant carrying it, or -1. */
  carriedBy: number;
  /** Steps it has been carried. */
  heldFor: number;
  /** Tank days it has lain uneaten at 25 °C, and whether it has gone mouldy. */
  age: number;
  mouldy: boolean;
}

interface PartSpec {
  part: Part;
  /** Where it lies from the insect's middle, mm, and which way it points, in the insect's frame (x toward the head). */
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  mass: number;
  /** Fraction of its mass that is hard skin, left as the husk. */
  hard: number;
  /** Index of the part it hangs from, or -1. */
  joint: number;
  toughness: number;
  skin: number;
}

/**
 * The insects as keepers buy them. Masses are rough: a flightless fruit fly
 * about 1 mg and 2.5 mm, a small house cricket about 40 mg and 12 mm, a
 * mealworm about 120 mg and 22 mm. Biting times are rough too: a fly's
 * and a cricket's leg joints are soft, a mealworm's skin is hard.
 */
const INSECTS: Record<Insect, PartSpec[]> = {
  fly: [{ part: 'fly', x: 0, y: 0, angle: 0, length: 2.5, width: 1.1, mass: 1, hard: 0.3, joint: -1, toughness: 0, skin: 20 }],
  cricket: [
    { part: 'thorax', x: 0, y: 0, angle: 0, length: 3.5, width: 3, mass: 10, hard: 0.3, joint: -1, toughness: 0, skin: 90 },
    { part: 'head', x: 3, y: 0, angle: 0, length: 2.6, width: 2.8, mass: 5, hard: 0.45, joint: 0, toughness: 150, skin: 90 },
    { part: 'abdomen', x: -5.2, y: 0, angle: 0, length: 7, width: 3.6, mass: 19.6, hard: 0.15, joint: 0, toughness: 150, skin: 60 },
    { part: 'hindLeg', x: -2.8, y: 2.2, angle: Math.PI - 0.35, length: 7.5, width: 1.3, mass: 1.8, hard: 0.45, joint: 0, toughness: 60, skin: 30 },
    { part: 'hindLeg', x: -2.8, y: -2.2, angle: -Math.PI + 0.35, length: 7.5, width: 1.3, mass: 1.8, hard: 0.45, joint: 0, toughness: 60, skin: 30 },
    { part: 'leg', x: 1.4, y: 2.2, angle: 1.0, length: 3.8, width: 0.45, mass: 0.45, hard: 0.5, joint: 0, toughness: 30, skin: 15 },
    { part: 'leg', x: 1.4, y: -2.2, angle: -1.0, length: 3.8, width: 0.45, mass: 0.45, hard: 0.5, joint: 0, toughness: 30, skin: 15 },
    { part: 'leg', x: -0.6, y: 2.4, angle: 1.9, length: 4, width: 0.45, mass: 0.45, hard: 0.5, joint: 0, toughness: 30, skin: 15 },
    { part: 'leg', x: -0.6, y: -2.4, angle: -1.9, length: 4, width: 0.45, mass: 0.45, hard: 0.5, joint: 0, toughness: 30, skin: 15 },
  ],
  mealworm: [
    { part: 'head', x: 9.9, y: 0, angle: 0, length: 1.6, width: 2.4, mass: 2, hard: 0.5, joint: 1, toughness: 600, skin: 600 },
    ...Array.from({ length: 6 }, (_, k): PartSpec => ({
      part: 'section',
      x: 7.4 - 3.4 * k,
      y: 0,
      angle: 0,
      length: 3.4,
      width: 2.8,
      mass: 118 / 6,
      hard: 0.2,
      joint: k === 0 ? -1 : k,
      toughness: 600,
      skin: 600,
    })),
  ],
};

/** The cut a keeper makes to halve each insect: the joint at this part's index is cut (a fly is just opened). */
const HALVE: Record<Insect, number> = { fly: -1, cricket: 2, mealworm: 4 };

/**
 * Puts a feeder insect on the arena floor with its middle at (x, y), whole,
 * cut in two or in pieces, lying any way round. Returns the new pieces.
 */
export function makeInsect(seed: number, step: number, firstId: number, insect: Insect, cut: Cut, x: number, y: number): Piece[] {
  const rng = new Rng(seed, Purpose.prey, step, firstId);
  const turn = rng.range(-Math.PI, Math.PI);
  const specs = INSECTS[insect];
  const pieces = specs.map((s, k): Piece => {
    let jx = s.x;
    let jy = s.y;
    // Pieces laid out a little apart, as a keeper cuts them on a tile and tips them out.
    if (cut === 'pieces') {
      jx *= 1.6;
      jy *= 1.6;
    } else if (cut === 'halved' && insect === 'cricket' && s.part === 'abdomen') jx -= 2;
    else if (cut === 'halved' && insect === 'mealworm' && s.part === 'section' && k > HALVE.mealworm - 1) jx -= 2;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    return {
      id: firstId + k,
      insect,
      part: s.part,
      place: Place.arena,
      x: x + jx * c - jy * sn,
      y: y + jx * sn + jy * c,
      angle: turn + s.angle + rng.range(-0.15, 0.15),
      length: s.length,
      width: s.width,
      mass: s.mass,
      juice: s.mass * (1 - s.hard),
      cuts: cut === 'whole' || insect !== 'fly' ? 0 : 1,
      joint: s.joint < 0 ? -1 : firstId + s.joint,
      toughness: s.toughness,
      skin: s.skin,
      bitten: 0,
      carriedBy: -1,
      heldFor: 0,
      age: 0,
      mouldy: false,
    };
  });
  // Each joint the keeper cuts leaves a wound on both sides.
  const sever = (p: Piece) => {
    const parent = pieces.find((q) => q.id === p.joint);
    if (parent) parent.cuts++;
    p.cuts++;
    p.joint = -1;
  };
  if (cut === 'pieces') for (const p of pieces) if (p.joint >= 0) sever(p);
  if (cut === 'halved' && HALVE[insect] >= 0) sever(pieces[HALVE[insect]]!);
  return pieces;
}

/** Workers that can drink at once at each wound (rough). */
export const AT_A_WOUND = 2;

/** True for a piece of insect that still has juice and is not mouldy: food. */
export function edible(p: Piece): boolean {
  return p.juice > 1e-6 && !p.mouldy;
}

/** True for what is left of a piece once it is drunk dry, or gone mouldy: refuse, carried out of the nest. */
export function refuse(p: Piece): boolean {
  return !edible(p);
}

/** How far from a piece's middle an ant touches it, mm. */
export function pieceReach(p: Piece): number {
  return Math.max(p.length, p.width) / 2;
}

/** The pieces joined to `p` through joints, `p` included, in id order. */
export function assembly(prey: readonly Piece[], p: Piece): Piece[] {
  const byId = new Map(prey.map((q) => [q.id, q]));
  const root = (q: Piece): Piece => {
    let r = q;
    while (r.joint >= 0) {
      const up = byId.get(r.joint);
      if (!up) break;
      r = up;
    }
    return r;
  };
  const top = root(p);
  return prey.filter((q) => root(q) === top);
}

/** True if nothing hangs from `p`. */
function bare(prey: readonly Piece[], p: Piece): boolean {
  return !prey.some((q) => q.joint === p.id);
}

/** True if one ant could take `p` home: free, nothing hanging from it, light enough, and lying where the ant is. */
export function carryable(prey: readonly Piece[], p: Piece, params: AntParams): boolean {
  return p.joint < 0 && p.carriedBy < 0 && p.mass <= params.preyCarryMax && bare(prey, p);
}

/** The nearest edible piece lying in the arena within `range` mm of its edge, or undefined. */
export function nearestPiece(ctx: AntContext, x: number, y: number, range: number): Piece | undefined {
  let best: Piece | undefined;
  let bestGap = range;
  for (const p of ctx.prey) {
    if (p.place !== Place.arena || p.carriedBy >= 0 || !edible(p)) continue;
    const gap = Math.hypot(p.x - x, p.y - y) - pieceReach(p);
    if (gap <= bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best;
}

/** A forager touching a piece of insect starts working at it. */
export function startAtPrey(ctx: AntContext, i: number, p: Piece): void {
  const { ants } = ctx;
  ants.state[i] = AntState.atPrey;
  ants.preyId[i] = p.id;
  ants.foodId[i] = -1;
  ants.timer[i] = 0;
}

/** What a forager at an insect does this step: carry, cut, drink or bite (see the top of this file). */
export function workAtPrey(ctx: AntContext, i: number): void {
  const { ants, params, prey } = ctx;
  const p = prey.find((q) => q.id === ants.preyId[i]);
  if (!p || p.place !== Place.arena || p.carriedBy >= 0 || !edible(p)) {
    leavePrey(ctx, i, false);
    return;
  }
  const steps = ++ants.timer[i]!;
  if (carryable(prey, p, params)) {
    pickUpPiece(ctx, i, p, remainsNear(ctx, p));
    return;
  }
  const body = assembly(prey, p);
  if (ants.foodId[i]! >= 0) {
    // Drinking at a wound is slow: the juice is chewed out of the tissue.
    if (steps >= params.preyDrinkTime * STEPS_PER_SECOND) drinkFrom(ctx, i, body);
    return;
  }
  // A part that would be light enough once off: the nearest such, bitten at its joint.
  let part: Piece | undefined;
  let partGap = Infinity;
  for (const q of body) {
    if (q.joint < 0 || q.mass > params.preyCarryMax || !bare(prey, q)) continue;
    const gap = Math.hypot(q.x - ants.x[i]!, q.y - ants.y[i]!);
    if (gap < partGap) {
      part = q;
      partGap = gap;
    }
  }
  if (part) {
    part.bitten += DT;
    if (part.bitten >= part.toughness) {
      // Off: a wound on the part and one on the body it came from.
      const from = body.find((q) => q.id === part.joint);
      if (from) from.cuts++;
      part.cuts++;
      part.joint = -1;
      pickUpPiece(ctx, i, part, true);
    } else if (steps >= params.preyGiveUp * STEPS_PER_SECOND) leavePrey(ctx, i, true);
    return;
  }
  // A place free at a wound: drink there. The more cuts, the more workers drink at once.
  const wounds = body.reduce((n, q) => n + q.cuts, 0);
  if (wounds > 0 && ants.crop[i]! < params.cropLoad && drinkers(ctx, body) < AT_A_WOUND * wounds) {
    ants.foodId[i] = p.id;
    ants.timer[i] = 0;
    return;
  }
  // Else bite a new hole through its skin.
  p.bitten += DT;
  if (p.bitten >= p.skin) {
    p.cuts++;
    p.bitten = 0;
  } else if (steps >= params.preyGiveUp * STEPS_PER_SECOND) leavePrey(ctx, i, true);
}

/** Workers drinking at the wounds of `body`. */
function drinkers(ctx: AntContext, body: Piece[]): number {
  const { ants } = ctx;
  let n = 0;
  for (let i = 0; i < ants.count; i++) {
    if (ants.state[i] === AntState.atPrey && ants.foodId[i]! >= 0 && body.some((q) => q.id === ants.foodId[i])) n++;
  }
  return n;
}

/** True if, where `p` lies, the ant touches another piece of insect too big to take home: what it came from is still there. */
function remainsNear(ctx: AntContext, p: Piece): boolean {
  const { params, prey } = ctx;
  return prey.some(
    (q) =>
      q !== p &&
      q.place === Place.arena &&
      q.carriedBy < 0 &&
      edible(q) &&
      !carryable(prey, q, params) &&
      Math.hypot(q.x - p.x, q.y - p.y) <= pieceReach(q) + params.contactRadius,
  );
}

/** The ant fills its crop from the juice of an open insect and heads home with it, laying trail by how much it drank (as at a drop). */
function drinkFrom(ctx: AntContext, i: number, body: Piece[]): void {
  const { ants, params } = ctx;
  let room = Math.max(0, params.cropLoad - ants.crop[i]!);
  let take = 0;
  for (const q of body) {
    const sip = Math.min(room, q.juice);
    q.juice -= sip;
    q.mass -= sip;
    room -= sip;
    take += sip;
  }
  ants.crop[i]! += take;
  ants.cropProtein[i]! += take;
  ants.cropQuality[i] = foodQuality(1, params) * (take / params.cropLoad);
  goHome(ctx, i, true);
}

/** The ant leaves the insect: for help, laying trail, if it got nothing from it; else to search on. */
function leavePrey(ctx: AntContext, i: number, forHelp: boolean): void {
  const { ants, params } = ctx;
  if (!forHelp) {
    ants.preyId[i] = -1;
    ants.foodId[i] = -1;
    ants.state[i] = AntState.exploring;
    return;
  }
  ants.cropQuality[i] = params.preyTrail;
  goHome(ctx, i, true);
}

function goHome(ctx: AntContext, i: number, remember: boolean): void {
  const { ants } = ctx;
  ants.preyId[i] = -1;
  ants.foodId[i] = -1;
  ants.state[i] = AntState.returning;
  ants.hasMemory[i] = remember ? 1 : 0;
  if (remember) {
    ants.memX[i] = ants.piX[i]!;
    ants.memY[i] = ants.piY[i]!;
    ants.memoryProtein[i] = 1;
  }
  ants.heading[i]! += Math.PI;
}

/** The ant takes the piece in its mandibles and heads home; it lays trail if the insect it came from is still there. */
function pickUpPiece(ctx: AntContext, i: number, p: Piece, more: boolean): void {
  const { ants, params } = ctx;
  p.carriedBy = i;
  p.heldFor = 0;
  ants.pieceHeld[i] = p.id;
  ants.cropQuality[i] = more ? params.preyTrail : 0;
  goHome(ctx, i, more);
}

/** Where a carried piece is held, ahead of the carrier's centre, mm. */
const HELD_AHEAD = 2.5;

/** A carried piece is held out in front of its carrier and goes where it goes. */
export function holdPiece(ctx: AntContext, i: number): void {
  const { ants } = ctx;
  const p = ctx.prey.find((q) => q.id === ants.pieceHeld[i]);
  if (!p) {
    ants.pieceHeld[i] = -1;
    return;
  }
  const h = ants.heading[i]!;
  p.place = ants.place[i]!;
  p.x = ants.x[i]! + (HELD_AHEAD + p.length / 2) * Math.cos(h);
  p.y = ants.y[i]! + (HELD_AHEAD + p.length / 2) * Math.sin(h);
  p.angle = h;
  p.heldFor++;
}

/** The ant puts down the piece it carries where it stands. */
export function dropPiece(ctx: AntContext, i: number): void {
  const { ants } = ctx;
  const p = ctx.prey.find((q) => q.id === ants.pieceHeld[i]);
  ants.pieceHeld[i] = -1;
  if (!p) return;
  p.carriedBy = -1;
  p.heldFor = 0;
  p.place = ants.place[i]!;
  p.x = ants.x[i]!;
  p.y = ants.y[i]!;
}

/** A forager carrying a piece into the lab nest: the colony eats it there (the lab nest is not simulated inside). */
export function deliverToLabNest(ctx: AntContext, i: number): void {
  const { ants } = ctx;
  const p = ctx.prey.find((q) => q.id === ants.pieceHeld[i]);
  ants.pieceHeld[i] = -1;
  if (p) {
    p.carriedBy = -1;
    p.place = Place.gone;
  }
}

/** The piece lying free in the farm that worker `i` touches, or undefined. */
export function pieceTouched(ctx: AntContext, i: number, wanted: (p: Piece) => boolean): Piece | undefined {
  const { ants, params } = ctx;
  for (const p of ctx.prey) {
    if (p.place !== Place.farm || p.carriedBy >= 0 || !wanted(p)) continue;
    if (Math.hypot(p.x - ants.x[i]!, p.y - ants.y[i]!) <= pieceReach(p) + params.contactRadius) return p;
  }
  return undefined;
}

/**
 * A worker in the farm touching a piece of insect now and then drinks from
 * it (workers chew into a piece; it need not be open), filling its crop with
 * protein-rich juice that nurses feed on to the larvae. Returns true if it drank.
 */
export function sipPiece(ctx: AntContext, i: number): boolean {
  const { ants, params, rng } = ctx;
  if (ants.crop[i]! >= params.cropLoad) return false;
  const p = pieceTouched(ctx, i, edible);
  if (!p || !rng.chance(params.pieceSipRate * DT)) return false;
  const take = Math.min(params.cropLoad - ants.crop[i]!, p.juice);
  p.juice -= take;
  p.mass -= take;
  p.cuts = Math.max(1, p.cuts);
  ants.crop[i]! += take;
  ants.cropProtein[i]! += take;
  return true;
}

/**
 * A worker resting or about the nest that touches a husk, or a piece gone
 * mouldy, may carry it out to the midden, as it would a corpse. Returns true if it picked it up.
 */
export function tryPickUpRefuse(ctx: AntContext, i: number): boolean {
  const { ants, params, rng } = ctx;
  const p = pieceTouched(ctx, i, refuse);
  if (!p || !rng.chance(params.corpsePickRate * DT)) return false;
  p.carriedBy = i;
  p.heldFor = 0;
  ants.pieceHeld[i] = p.id;
  ants.state[i] = AntState.carryingCorpse;
  ants.timer[i] = 0;
  ants.hasDigSite[i] = 0;
  holdPiece(ctx, i);
  return true;
}

/**
 * A worker that carried a piece into the farm puts it down once it is by the
 * brood (`byBrood`), or after `preyDropTime` seconds anyway. Returns true if it did.
 */
export function mayPutDownPiece(ctx: AntContext, i: number, byBrood: boolean): boolean {
  const { ants, params } = ctx;
  const p = ctx.prey.find((q) => q.id === ants.pieceHeld[i]);
  if (!p) return false;
  if (!byBrood && p.heldFor < params.preyDropTime * STEPS_PER_SECOND) return false;
  dropPiece(ctx, i);
  return true;
}

/**
 * Pieces lying uneaten age by `seconds` of ant time, faster when warm, and go
 * mouldy after `preyMouldDays` (in the arena at room temperature, in the farm
 * at the soil's). Does nothing unless `mould` is on.
 */
export function agePieces(ctx: Pick<AntContext, 'prey' | 'farm' | 'params'>, seconds: number): void {
  const { params } = ctx;
  if (!params.mould) return;
  for (const p of ctx.prey) {
    // A husk is dry skin: nothing for mould. A mouldy piece goes on ageing, its mould thickening (mould.ts).
    if (p.carriedBy >= 0 || (!p.mouldy && !edible(p)) || (p.place !== Place.arena && p.place !== Place.farm)) continue;
    const celsius = p.place === Place.farm ? temperatureAt(ctx.farm, p.x, p.y) : params.roomTemperature;
    p.age += (seconds / params.daySeconds) * Math.pow(2, (celsius - 25) / params.mouldDoubling);
    if (p.age >= params.preyMouldDays) p.mouldy = true;
  }
}
