import { describe, expect, it } from 'vitest';
import { createArena, reliefAt } from '../src/sim/arena';
import { DISH_WALL, type Decoration, buildRelief, decorationAt, reliefOf, stampDecorations } from '../src/sim/decor';
import { foodReach } from '../src/sim/food';
import { hashState } from '../src/sim/hash';
import { type KeeperCommand, type LoggedCommand, applyCommand, createTank, replayTank } from '../src/sim/keeper';
import { FEEDER_CAPACITY } from '../src/sim/objects';
import { TANK_ARENA } from '../src/sim/tank';
import { type World, createWorld, placeSugar, step } from '../src/sim/world';

/** A lab colony in the keeper's 40 x 30 cm arena with nothing in it yet. */
function bareArena(seed = 1, ants = 40): World {
  const world = createWorld(seed, { nest: 'lab', ants });
  world.arena = createArena(TANK_ARENA.width, TANK_ARENA.height);
  world.decor = [];
  stampDecorations(world.arena, world.decor);
  return world;
}

const put = (world: World, item: 'dish' | 'feeder' | 'stone' | 'bark' | 'branch', x: number, y: number, concentration = 1) =>
  applyCommand(world, { type: 'put', item, x, y, concentration });

function only<K extends Decoration['kind']>(world: World, kind: K): Extract<Decoration, { kind: K }> {
  const found = world.decor.filter((d): d is Extract<Decoration, { kind: K }> => d.kind === kind);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe("the keeper's objects (DESIGN.md B3-B5)", () => {
  it('puts a dish, a feeder, a stone, cork bark and a branch in, and the ground rises to their shapes', () => {
    const world = bareArena();
    put(world, 'dish', 100, 60);
    put(world, 'feeder', 250, 60);
    put(world, 'stone', 100, 240);
    put(world, 'bark', 200, 240);
    put(world, 'branch', 300, 160);
    expect(world.decor.map((d) => d.kind)).toEqual(['dish', 'feeder', 'stone', 'bark', 'branch']);
    expect(world.arena.relief).toEqual(buildRelief(world.arena.width, world.arena.height, world.decor));
    // The dish: a 4 mm rim round a 1 mm floor, nothing outside it.
    const dish = only(world, 'dish');
    expect(reliefAt(world.arena, dish.x, dish.y)).toBeCloseTo(dish.base, 3);
    expect(reliefOf(dish, dish.x + dish.radius - DISH_WALL / 2, dish.y)).toBe(dish.rim);
    expect(reliefOf(dish, dish.x + dish.radius + 0.5, dish.y)).toBe(0);
    // The feeder lies on the floor like the water tube: its top is its diameter.
    const feeder = only(world, 'feeder');
    expect(reliefAt(world.arena, (feeder.x0 + feeder.x1) / 2, feeder.y)).toBeCloseTo(2 * feeder.radius, 0);
    // The branch is a thin round bar along its length.
    const branch = only(world, 'branch');
    expect(reliefOf(branch, (branch.x0 + branch.x1) / 2, (branch.y0 + branch.y1) / 2)).toBeCloseTo(2 * branch.radius, 3);
  });

  it("refuses an object over the tube's mouth, against the glass, on another one or on food", () => {
    const world = bareArena();
    const { entranceX, entranceY } = world.arena;
    put(world, 'stone', entranceX + 20, entranceY);
    put(world, 'dish', 398, 150);
    expect(world.decor).toHaveLength(0);
    put(world, 'bark', 200, 150);
    put(world, 'stone', 205, 150);
    expect(world.decor.map((d) => d.kind)).toEqual(['bark']);
    placeSugar(world, 300, 100, 10, 1);
    put(world, 'stone', 300, 100);
    expect(world.decor).toHaveLength(1);
    // A dish can go over moss or a leaf: they lie flat.
    world.decor.push({ kind: 'moss', x: 100, y: 220, radius: 30 });
    stampDecorations(world.arena, world.decor);
    put(world, 'dish', 100, 220);
    expect(world.decor.at(-1)!.kind).toBe('dish');
  });

  it('keeps food put in a dish, refuses it on the rim, and cleaning the arena empties the dish', () => {
    const world = bareArena();
    put(world, 'dish', 120, 80);
    const dish = only(world, 'dish');
    applyCommand(world, { type: 'sugar', x: dish.x + 3, y: dish.y, volume: 10, concentration: 1 });
    applyCommand(world, { type: 'protein', x: dish.x - 5, y: dish.y + 2, volume: 3 });
    applyCommand(world, { type: 'sugar', x: dish.x + dish.radius - 0.5, y: dish.y, volume: 10, concentration: 1 });
    applyCommand(world, { type: 'sugar', x: 300, y: 200, volume: 10, concentration: 1 });
    expect(world.food.map((f) => [f.x, f.y])).toEqual([
      [dish.x + 3, dish.y],
      [dish.x - 5, dish.y + 2],
      [300, 200],
    ]);
    applyCommand(world, { type: 'clean' });
    // The drop on the open floor stays; cleaning takes out only the dead, mouldy food and the dish's contents.
    expect(world.food.map((f) => [f.x, f.y])).toEqual([[300, 200]]);
  });

  it('is climbed into: foragers go over the rim to sugar in a dish', () => {
    let found = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const world = bareArena(seed);
      put(world, 'dish', 100, 150);
      applyCommand(world, { type: 'sugar', x: 100, y: 150, volume: 20, concentration: 1 });
      for (let s = 0; s < 15 * 60 * 20; s++) step(world);
      if ((world.food[0]?.volume ?? 0) < 20) found++;
    }
    expect(found).toBe(3);
  }, 60_000);

  it('moves a dish with its food in it, takes it out with its food, and moves the seeded stones too', () => {
    const world = bareArena();
    put(world, 'dish', 120, 80);
    put(world, 'stone', 250, 200);
    applyCommand(world, { type: 'sugar', x: 123, y: 80, volume: 10, concentration: 1 });
    applyCommand(world, { type: 'sugar', x: 160, y: 80, volume: 10, concentration: 1 });
    applyCommand(world, { type: 'move', index: 0, x: 220, y: 70 });
    expect(only(world, 'dish')).toMatchObject({ x: 220, y: 70 });
    expect(world.food.map((f) => [f.x, f.y])).toEqual([
      [223, 70],
      [160, 80],
    ]);
    // Not onto the stone.
    applyCommand(world, { type: 'move', index: 0, x: 250, y: 200 });
    expect(only(world, 'dish')).toMatchObject({ x: 220, y: 70 });
    expect(world.arena.relief).toEqual(buildRelief(world.arena.width, world.arena.height, world.decor));
    applyCommand(world, { type: 'remove', index: 0 });
    expect(world.decor.map((d) => d.kind)).toEqual(['stone']);
    expect(world.food.map((f) => [f.x, f.y])).toEqual([[160, 80]]);
    expect(reliefAt(world.arena, 220, 70)).toBe(0);
    // A tank's own decorations move and go the same way.
    const tank = createTank(2);
    const k = tank.decor.findIndex((d) => d.kind === 'stone');
    const before = tank.decor.length;
    applyCommand(tank, { type: 'remove', index: k });
    expect(tank.decor.length).toBe(before - 1);
    expect(tank.arena.relief).toEqual(buildRelief(tank.arena.width, tank.arena.height, tank.decor));
  });

  it('finds the decoration under a point, the standing one first', () => {
    const world = bareArena();
    world.decor.push({ kind: 'moss', x: 200, y: 150, radius: 40 });
    put(world, 'stone', 200, 150);
    expect(decorationAt(world.decor, 200, 150)).toBe(1);
    expect(decorationAt(world.decor, 200, 185)).toBe(0);
    expect(decorationAt(world.decor, 380, 20)).toBe(-1);
  });

  it('fills a liquid feeder with 2 mL that the ants drink at the cotton, and refills it', () => {
    const world = bareArena(3);
    // The cotton plug faces the tube's mouth, 8 cm away.
    put(world, 'feeder', 120, 150, 1);
    const feeder = only(world, 'feeder');
    const drop = world.food.find((f) => f.reach)!;
    expect(drop).toMatchObject({ x: feeder.x0, y: feeder.y, volume: FEEDER_CAPACITY, concentration: 1 });
    expect(foodReach(drop)).toBe(feeder.radius);
    for (let s = 0; s < 15 * 60 * 20; s++) step(world);
    const drunk = FEEDER_CAPACITY - world.food.find((f) => f.reach)!.volume;
    // It never spreads: the drop stays at the cotton, the size of the tube's mouth.
    expect(drunk).toBeGreaterThan(1);
    expect(world.food.find((f) => f.reach)).toMatchObject({ x: feeder.x0, y: feeder.y, reach: feeder.radius });
    applyCommand(world, { type: 'refill', concentration: 0.5 });
    expect(world.food.filter((f) => f.reach)).toHaveLength(1);
    expect(world.food.find((f) => f.reach)).toMatchObject({ volume: FEEDER_CAPACITY, concentration: 0.5 });
    // Moving the feeder takes its sugar water with it.
    applyCommand(world, { type: 'move', index: 0, x: 220, y: 100 });
    expect(world.food.find((f) => f.reach)).toMatchObject({ x: 180, y: 100 });
  }, 60_000);

  it('rebuilds a tank exactly from its log of objects put in, moved and taken out', () => {
    const log: LoggedCommand[] = [
      { step: 10, command: { type: 'put', item: 'dish', x: 300, y: 60, concentration: 1 } },
      { step: 10, command: { type: 'put', item: 'stone', x: 330, y: 250, concentration: 1 } },
      { step: 40, command: { type: 'sugar', x: 300, y: 60, volume: 10, concentration: 1 } },
      { step: 60, command: { type: 'put', item: 'feeder', x: 260, y: 270, concentration: 0.5 } },
      { step: 90, command: { type: 'move', index: 0, x: 200, y: 50 } },
      { step: 120, command: { type: 'refill', concentration: 1 } },
      { step: 150, command: { type: 'remove', index: 1 } },
    ];
    const a = replayTank(7, log, 400);
    const b = replayTank(7, log, 400);
    expect(hashState(a)).toBe(hashState(b));
    // The same as applying each command by hand at its step.
    const c = createTank(7);
    let next = 0;
    while (c.step < 400) {
      while (next < log.length && log[next]!.step <= c.step) applyCommand(c, log[next++]!.command as KeeperCommand);
      step(c);
    }
    expect(hashState(c)).toBe(hashState(a));
  }, 60_000);
});
