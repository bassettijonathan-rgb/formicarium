import { describe, expect, it } from 'vitest';
import { Place } from '../src/sim/ants';
import { createArena } from '../src/sim/arena';
import { type Decoration, chuteOf, stampDecorations } from '../src/sim/decor';
import { hashState } from '../src/sim/hash';
import { type KeeperCommand, type LoggedCommand, applyCommand, createTank, replayTank } from '../src/sim/keeper';
import { FEEDER_CAPACITY } from '../src/sim/objects';
import { TANK_ARENA } from '../src/sim/tank';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { type World, createWorld, step } from '../src/sim/world';

/** A lab colony in the keeper's 40 x 30 cm arena with nothing in it yet. */
function bareArena(seed = 1, ants = 0): World {
  const world = createWorld(seed, { nest: 'lab', ants });
  world.arena = createArena(TANK_ARENA.width, TANK_ARENA.height);
  world.decor = [];
  stampDecorations(world.arena, world.decor);
  return world;
}

const run = (world: World, seconds: number) => {
  for (let s = 0; s < seconds * STEPS_PER_SECOND; s++) step(world);
};

function dispenser(world: World): Extract<Decoration, { kind: 'dispenser' }> {
  const d = world.decor.find((x): x is Extract<Decoration, { kind: 'dispenser' }> => x.kind === 'dispenser');
  expect(d).toBeDefined();
  return d!;
}

/** The pieces lying in the arena. */
const lying = (world: World) => world.prey.filter((p) => p.place === Place.arena && p.carriedBy < 0);

describe('the automatic feeders (Marco, 2026-10-14)', () => {
  it('an automatic sugar feeder is kept full as the ants drink; an ordinary one is not', () => {
    const world = bareArena();
    applyCommand(world, { type: 'put', item: 'autoFeeder', x: 120, y: 80, concentration: 1 });
    applyCommand(world, { type: 'put', item: 'feeder', x: 120, y: 220, concentration: 1 });
    const [auto, plain] = world.food.filter((f) => f.reach);
    auto!.volume = 300;
    plain!.volume = 300;
    run(world, 10);
    expect(auto!.volume).toBe(FEEDER_CAPACITY);
    expect(auto!.concentration).toBe(1);
    expect(plain!.volume).toBe(300);
    // Even after Clear food takes its sugar water away, it fills again.
    applyCommand(world, { type: 'clearFood' });
    run(world, 10);
    expect(world.food.filter((f) => f.reach)).toEqual([expect.objectContaining({ x: 80, y: 80, volume: FEEDER_CAPACITY, concentration: 1 })]);
  });

  it('an insect dispenser drops its insect at the chute, and the next only once the last is gone', () => {
    const world = bareArena();
    applyCommand(world, { type: 'put', item: 'dispenser', x: 200, y: 100, concentration: 1, insect: 'cricket', cut: 'halved' });
    const d = dispenser(world);
    run(world, 10);
    const first = lying(world);
    expect(first).toHaveLength(9);
    expect(first.every((p) => p.insect === 'cricket')).toBe(true);
    expect(d.dropped).toEqual(first.map((p) => p.id));
    // Near the chute, in front of the box, on open floor.
    const c = chuteOf(d);
    const mx = first.reduce((s, p) => s + p.x, 0) / first.length;
    const my = first.reduce((s, p) => s + p.y, 0) / first.length;
    expect(Math.hypot(mx - c.x, my - c.y)).toBeLessThan(6);
    // While any of it lies there to be eaten, nothing more drops.
    run(world, 60);
    expect(lying(world)).toHaveLength(9);
    // Most of it carried into the nest and the rest drunk to a husk: gone, so the next drops.
    for (const p of first.slice(1)) p.place = Place.farm;
    first[0]!.juice = 0;
    run(world, 10);
    expect(lying(world)).toHaveLength(10);
    expect(d.dropped).not.toEqual(first.map((p) => p.id));
  });

  it('waits while its insect lies mouldy, until Clean arena takes it out', () => {
    const world = bareArena();
    applyCommand(world, { type: 'put', item: 'dispenser', x: 200, y: 100, concentration: 1, insect: 'fly', cut: 'whole' });
    run(world, 10);
    const fly = lying(world)[0]!;
    fly.mouldy = true;
    run(world, 30);
    expect(lying(world)).toEqual([fly]);
    applyCommand(world, { type: 'clean' });
    run(world, 10);
    expect(lying(world)).toHaveLength(1);
    expect(lying(world)[0]!.id).not.toBe(fly.id);
  });

  it('is refused where its insects would land against the glass or on something', () => {
    const world = bareArena();
    expect(applyCommand(world, { type: 'put', item: 'stone', x: 200, y: 150, concentration: 1 })).toBe(true);
    applyCommand(world, { type: 'put', item: 'dispenser', x: 300, y: TANK_ARENA.height - 25, concentration: 1, insect: 'fly', cut: 'whole' });
    applyCommand(world, { type: 'put', item: 'dispenser', x: 200, y: 115, concentration: 1, insect: 'fly', cut: 'whole' });
    expect(world.decor.filter((d) => d.kind === 'dispenser')).toHaveLength(0);
  });

  it('a colony with hungry larvae carries off the flies a dispenser gives, and gets more', () => {
    const world = createTank(4);
    applyCommand(world, { type: 'put', item: 'dispenser', x: 120, y: 150, concentration: 1, insect: 'fly', cut: 'whole' });
    run(world, 2 * 60 * 60);
    const given = world.prey.filter((p) => p.insect === 'fly').length;
    expect(given).toBeGreaterThan(1);
  }, 600_000);

  it('rebuilds a tank exactly from its log, the dispensers included', () => {
    const log: LoggedCommand[] = [
      { step: 10, command: { type: 'put', item: 'autoFeeder', x: 260, y: 270, concentration: 0.5 } },
      { step: 10, command: { type: 'put', item: 'dispenser', x: 250, y: 120, concentration: 1, insect: 'mealworm', cut: 'pieces' } },
      { step: 300, command: { type: 'clearFood' } },
    ];
    const a = replayTank(7, log, 800);
    const c = createTank(7);
    let next = 0;
    while (c.step < 800) {
      while (next < log.length && log[next]!.step <= c.step) applyCommand(c, log[next++]!.command as KeeperCommand);
      step(c);
    }
    expect(hashState(c)).toBe(hashState(a));
    expect(c.prey.filter((p) => p.insect === 'mealworm')).toHaveLength(7);
  }, 60_000);
});
