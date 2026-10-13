/**
 * The keeper's objects in the arena (DESIGN.md section 3.4, B3-B5): a feeding
 * dish, a liquid feeder, and stones, cork bark and branches to climb, which
 * the keeper puts in, moves and takes out. The decorations a tank starts with
 * can be moved and taken out the same way.
 *
 * Every change is a keeper command (keeper.ts), so a tank's seed and log
 * still rebuild it exactly. After each change the arena's relief is rebuilt,
 * so ants climb whatever now stands there.
 */
import { isBlocked, reliefAt } from './arena';
import { type Decoration, buildRelief, extent, inDish, isObstacle, middleOf, reliefOf, shifted, stampDecorations } from './decor';
import { Place } from './ants';
import { Purpose, Rng } from './rng';
import type { World } from './world';

/** What the keeper can put in the arena. */
export type Item = 'dish' | 'feeder' | 'stone' | 'bark' | 'branch';

/** A liquid feeder holds 2 mL of sugar water when full (B5). */
export const FEEDER_CAPACITY = 2000;

/** Nothing the keeper puts in may come closer than this to the tube's mouth, mm, so the ants can get out. */
const MOUTH_CLEAR = 25;
/** Nor closer than this to the glass, mm. */
const WALL_CLEAR = 3;

/** The object `item` with its middle at (x, y). Stones, bark and branches take their shape from the tank's seed and the step. */
export function makeItem(world: World, item: Item, x: number, y: number): Decoration {
  const rng = new Rng(world.seed, Purpose.decor, world.step, world.decor.length);
  switch (item) {
    case 'dish':
      // A shallow plastic dish 35 mm across with a 4 mm rim, the kind keepers use (B4).
      return { kind: 'dish', x, y, radius: 17.5, rim: 4, base: 1 };
    case 'feeder':
      // A test tube 8 cm long and 15 mm across, its cotton plug at the left end (B5).
      return { kind: 'feeder', x0: x - 40, x1: x + 40, y, radius: 7.5, capacity: FEEDER_CAPACITY };
    case 'stone': {
      const radius = rng.range(11, 17);
      return { kind: 'stone', x, y, radius, height: radius * rng.range(0.55, 0.8), outline: Array.from({ length: 20 }, () => rng.range(0.84, 1.1)) };
    }
    case 'bark':
      return { kind: 'bark', x, y, length: rng.range(40, 55), width: rng.range(18, 24), height: rng.range(14, 20), angle: rng.range(-0.6, 0.6) };
    case 'branch': {
      const angle = rng.range(-0.5, 0.5);
      const half = rng.range(45, 65);
      return { kind: 'branch', x0: x - half * Math.cos(angle), y0: y - half * Math.sin(angle), x1: x + half * Math.cos(angle), y1: y + half * Math.sin(angle), radius: rng.range(2.5, 3.5) };
    }
  }
}

/**
 * True if `d` can lie where it is: inside the box clear of the glass and of
 * the tube's mouth, and, if it stands up, not on anything else that stands
 * up (`others`' relief) nor on food other than `carried`.
 */
function fits(world: World, d: Decoration, others: Float32Array, carried: Set<number>): boolean {
  const { arena } = world;
  const [x0, y0, x1, y1] = extent(d);
  if (x0 < WALL_CLEAR || y0 < WALL_CLEAR || x1 > arena.width - WALL_CLEAR || y1 > arena.height - WALL_CLEAR) return false;
  // The nearest point of its box to the mouth.
  const nx = Math.max(x0, Math.min(arena.entranceX, x1));
  const ny = Math.max(y0, Math.min(arena.entranceY, y1));
  if (Math.hypot(nx - arena.entranceX, ny - arena.entranceY) < MOUTH_CLEAR) return false;
  if (!isObstacle(d)) return true;
  for (let cy = Math.max(0, Math.floor(y0)); cy <= Math.min(arena.height - 1, Math.ceil(y1)); cy++) {
    for (let cx = Math.max(0, Math.floor(x0)); cx <= Math.min(arena.width - 1, Math.ceil(x1)); cx++) {
      if (reliefOf(d, cx + 0.5, cy + 0.5) > 0 && others[cy * arena.width + cx]! > 0) return false;
    }
  }
  return (
    world.food.every((f) => carried.has(f.id) || reliefOf(d, f.x, f.y) === 0) &&
    world.prey.every((p) => p.place !== Place.arena || p.carriedBy >= 0 || carried.has(p.id) || reliefOf(d, p.x, p.y) === 0)
  );
}

/** The relief of every decoration but the one at `skip`. */
function reliefWithout(world: World, skip: number): Float32Array {
  return buildRelief(world.arena.width, world.arena.height, world.decor.filter((_, k) => k !== skip));
}

/** The food that goes with a decoration when it moves: what lies in a dish, and a feeder's sugar water. */
function foodWith(world: World, d: Decoration): number[] {
  if (d.kind === 'dish') return world.food.filter((f) => !f.reach && inDish(d, f.x, f.y)).map((f) => f.id);
  if (d.kind === 'feeder') return world.food.filter((f) => f.reach && f.x === d.x0 && f.y === d.y).map((f) => f.id);
  return [];
}

/**
 * Puts `item` in the arena with its middle at (x, y), if it fits there. A
 * feeder comes full of sugar water of `concentration` mol/L. Returns true if it was put in.
 */
export function putItem(world: World, item: Item, x: number, y: number, concentration: number): boolean {
  const d = makeItem(world, item, x, y);
  if (!fits(world, d, world.arena.relief, new Set())) return false;
  world.decor.push(d);
  stampDecorations(world.arena, world.decor);
  if (d.kind === 'feeder') fillFeeder(world, d, concentration);
  return true;
}

/** Moves the decoration at `index` so its middle is at (x, y), with the food in it, if it fits there. Returns true if it moved. */
export function moveDecoration(world: World, index: number, x: number, y: number): boolean {
  const d = world.decor[index];
  if (!d) return false;
  const from = middleOf(d);
  const dx = x - from.x;
  const dy = y - from.y;
  const moved = shifted(d, dx, dy);
  const pieces = new Set(piecesIn(world, d));
  // Food and pieces of insect share one set of ids.
  const carried = new Set([...foodWith(world, d), ...pieces]);
  if (!fits(world, moved, reliefWithout(world, index), carried)) return false;
  world.decor[index] = moved;
  for (const f of world.food) {
    if (!carried.has(f.id)) continue;
    f.x += dx;
    f.y += dy;
  }
  for (const p of world.prey) {
    if (!pieces.has(p.id)) continue;
    p.x += dx;
    p.y += dy;
  }
  stampDecorations(world.arena, world.decor);
  return true;
}

/** Takes the decoration at `index` out of the arena, with the food in it. Returns true if there was one. */
export function removeDecoration(world: World, index: number): boolean {
  const d = world.decor[index];
  if (!d) return false;
  const gone = new Set(foodWith(world, d));
  world.food = world.food.filter((f) => !gone.has(f.id));
  const pieces = new Set(piecesIn(world, d));
  world.prey = world.prey.filter((p) => !pieces.has(p.id));
  world.decor.splice(index, 1);
  stampDecorations(world.arena, world.decor);
  return true;
}

/** Fills every liquid feeder to the top with sugar water of `concentration` mol/L (B5). */
export function refillFeeders(world: World, concentration: number): void {
  for (const d of world.decor) if (d.kind === 'feeder') fillFeeder(world, d, concentration);
}

function fillFeeder(world: World, d: Extract<Decoration, { kind: 'feeder' }>, concentration: number): void {
  const drop = world.food.find((f) => f.reach && f.x === d.x0 && f.y === d.y);
  if (drop) {
    drop.volume = d.capacity;
    drop.concentration = concentration;
    return;
  }
  // The sugar water soaks the cotton plug: ants drink at its face, which is about as wide as the tube.
  world.food.push({ id: world.nextFoodId++, x: d.x0, y: d.y, volume: d.capacity, concentration, protein: 0, age: 0, mouldy: false, reach: d.radius });
}

/**
 * True if food can be put down at (x, y): on open floor, or on the floor of a
 * feeding dish. Food put on anything else would roll off.
 */
export function canPutFood(world: World, x: number, y: number): boolean {
  if (isBlocked(world.arena, x, y)) return false;
  if (reliefAt(world.arena, x, y) === 0) return true;
  return world.decor.some((d) => inDish(d, x, y));
}

/** Takes out the food lying in the feeding dishes (cleaning the arena empties them). Returns how many went. */
export function emptyDishes(world: World): number {
  const before = world.food.length + world.prey.length;
  world.food = world.food.filter((f) => f.reach || !world.decor.some((d) => inDish(d, f.x, f.y)));
  world.prey = world.prey.filter((p) => p.place !== Place.arena || p.carriedBy >= 0 || !world.decor.some((d) => inDish(d, p.x, p.y)));
  return before - world.food.length - world.prey.length;
}

/** The pieces of insect lying in a dish (Arena 3): they go where the dish goes. */
function piecesIn(world: World, d: Decoration): number[] {
  if (d.kind !== 'dish') return [];
  return world.prey.filter((p) => p.place === Place.arena && p.carriedBy < 0 && inDish(d, p.x, p.y)).map((p) => p.id);
}
