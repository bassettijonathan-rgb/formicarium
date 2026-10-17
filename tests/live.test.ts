import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import { createArena } from '../src/sim/arena';
import { applyCommand, createTank } from '../src/sim/keeper';
import { LIVE, type LiveInsect, liveGap } from '../src/sim/live';
import { SAVE_VERSION, loadWorld } from '../src/sim/save';
import { TANK_ARENA } from '../src/sim/tank';
import { type World, createWorld, placeLive, step } from '../src/sim/world';
import { expectDeterministic } from './helpers';

/** The keeper's bare 40 x 30 cm arena with a lab nest behind it and `ants` workers, all in the nest. */
function bareArena(seed: number, ants = 0): World {
  const world = createWorld(seed, { nest: 'lab', ants });
  world.arena = createArena(TANK_ARENA.width, TANK_ARENA.height);
  world.params.leaveRate = 0;
  return world;
}

function run(world: World, seconds: number, each?: () => void): void {
  for (let s = 0; s < seconds * 20; s++) {
    step(world);
    each?.();
  }
}

/** Puts worker `i` out in the arena at (x, y), searching, facing `heading`. */
function sendOut(world: World, i: number, x: number, y: number, heading = 0): void {
  const { ants } = world;
  ants.state[i] = AntState.exploring;
  ants.place[i] = Place.arena;
  ants.x[i] = x;
  ants.y[i] = y;
  ants.heading[i] = heading;
  ants.timer[i] = 0;
}

const insect = (world: World, id: number): LiveInsect | undefined => world.live.find((b) => b.id === id);

describe('live insects (DESIGN.md 3.4, L1-L12)', () => {
  it('wander the arena at their own pace, a fly in bursts, a mealworm slowly, and never leave it', () => {
    const world = bareArena(1);
    const ids = (['fly', 'cricket', 'mealworm'] as const).map((k) => placeLive(world, k, 200, 150));
    const paused = new Map<number, number>();
    run(world, 600, () => {
      for (const b of world.live) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThan(world.arena.width);
        expect(b.y).toBeLessThan(world.arena.height);
        if (!b.walking) paused.set(b.id, (paused.get(b.id) ?? 0) + 1);
      }
    });
    const [fly, cricket, mealworm] = ids.map((id) => insect(world, id)!);
    // In ten minutes a fly walks metres in its bursts, a mealworm a metre or two, and both stop now and then.
    expect(fly!.walked).toBeGreaterThan(1500);
    expect(mealworm!.walked).toBeLessThan(fly!.walked);
    expect(mealworm!.walked).toBeGreaterThan(500);
    for (const b of [fly!, cricket!, mealworm!]) expect(paused.get(b.id) ?? 0).toBeGreaterThan(0);
  });

  it('a cricket hops now and then, 3-6 cm', () => {
    const world = bareArena(2);
    const id = placeLive(world, 'cricket', 200, 150);
    let hops = 0;
    let longest = 0;
    let from: { x: number; y: number } | null = null;
    run(world, 600, () => {
      const b = insect(world, id)!;
      if (b.hop > 0 && !from) from = { x: b.x, y: b.y };
      if (b.hop === 0 && from) {
        hops++;
        longest = Math.max(longest, Math.hypot(b.x - from.x, b.y - from.y));
        from = null;
      }
    });
    expect(hops).toBeGreaterThan(5);
    expect(longest).toBeGreaterThan(25);
    expect(longest).toBeLessThanOrEqual(LIVE.cricket.hop[1] + 1);
  });

  it('left alone, dies of age and lies there as an ordinary dead insect, whole', () => {
    const world = bareArena(3);
    const id = placeLive(world, 'cricket', 200, 150);
    const b = insect(world, id)!;
    b.age = b.lifespan - 0.5 / world.params.daySeconds;
    run(world, 1);
    expect(world.live).toHaveLength(0);
    expect(world.prey).toHaveLength(9);
    expect(world.prey.every((p) => p.place === Place.arena && p.cuts === 0)).toBe(true);
    const thorax = world.prey.find((p) => p.part === 'thorax')!;
    expect(Math.hypot(thorax.x - b.x, thorax.y - b.y)).toBeLessThan(0.01);
    // Lying as it stood: its head ahead of its thorax.
    const head = world.prey.find((p) => p.part === 'head')!;
    expect(Math.cos(Math.atan2(head.y - thorax.y, head.x - thorax.x) - b.heading)).toBeGreaterThan(0.99);
  });

  it('a worker that touches a fruit fly grabs it, holds on, kills it in seconds and, out for protein, carries it home', () => {
    const world = bareArena(4, 1);
    const id = placeLive(world, 'fly', 200, 150);
    const fly = insect(world, id)!;
    fly.walking = false;
    fly.timer = 1000;
    sendOut(world, 0, 200 - LIVE.fly.half - 1.5, 150, 0);
    world.ants.seekProtein[0] = 1;
    world.ants.piX[0] = 200;
    step(world);
    expect(world.ants.state[0]).toBe(AntState.holding);
    expect(world.ants.liveHeld[0]).toBe(id);
    let killedAt = -1;
    let carried = false;
    run(world, 30, () => {
      if (killedAt < 0 && world.live.length === 0) killedAt = world.step;
      if (world.prey.some((p) => p.part === 'fly' && p.carriedBy === 0)) carried = true;
    });
    expect(killedAt).toBeGreaterThan(0);
    expect(killedAt / 20).toBeLessThan(10);
    // Carried home whole by the ant that killed it.
    expect(world.ants.liveHeld[0]).toBe(-1);
    expect(carried).toBe(true);
  });

  it("an ant that does not want protein kills a fly it touches all the same, and leaves it lying", () => {
    const world = bareArena(5, 1);
    const id = placeLive(world, 'fly', 200, 150);
    insect(world, id)!.walking = false;
    insect(world, id)!.timer = 1000;
    sendOut(world, 0, 200 - LIVE.fly.half - 1.5, 150, 0);
    world.ants.seekProtein[0] = 0;
    run(world, 30);
    expect(world.live).toHaveLength(0);
    expect(world.prey).toHaveLength(1);
    expect(world.prey[0]!.carriedBy).toBe(-1);
    expect(world.ants.state[0]).not.toBe(AntState.holding);
  });

  it('touching is by contact only: an ant 5 mm off does not notice', () => {
    const world = bareArena(6, 1);
    const id = placeLive(world, 'mealworm', 200, 150);
    const b = insect(world, id)!;
    b.walking = false;
    b.timer = 1000;
    b.heading = 0;
    sendOut(world, 0, 200, 150 + LIVE.mealworm.side + 5, 0);
    world.params.wiggle = 0;
    world.params.outwardTurn = 0;
    expect(liveGap(b, world.ants.x[0]!, world.ants.y[0]!)).toBeCloseTo(5, 6);
    step(world);
    expect(world.ants.state[0]).toBe(AntState.exploring);
    expect(b.grabs).toBe(0);
  });

  it('holders slow an insect, and enough of them hold it still; they are dragged along and keep their grip', () => {
    const world = bareArena(7, 6);
    const id = placeLive(world, 'cricket', 200, 150);
    const b = insect(world, id)!;
    b.heading = 0;
    // Four workers round it, each touching it: they pin it (L5).
    const spots = [
      [200 + 6, 150 - 4.2],
      [200 + 6, 150 + 4.2],
      [200 - 6, 150 - 4.2],
      [200 - 6, 150 + 4.2],
    ] as const;
    spots.forEach(([x, y], i) => sendOut(world, i, x, y, Math.atan2(150 - y, 200 - x)));
    world.params.liveAttack = 0; // it does not weaken: only the grip is tested
    world.params.wiggle = 0;
    step(world);
    expect(b.holders).toBe(4);
    // Pinned: it does not move, and it cannot shake them off (they are all it takes).
    const at = { x: b.x, y: b.y };
    run(world, 60);
    expect(Math.hypot(b.x - at.x, b.y - at.y)).toBeLessThan(0.01);
    expect(b.escapes).toBe(0);
    // Each holder still touches it.
    for (let i = 0; i < 4; i++) expect(liveGap(b, world.ants.x[i]!, world.ants.y[i]!)).toBeLessThan(1.6);
  });

  it('a lone ant cannot hold a cricket: it is shaken off and the cricket hops away, slipping its grip', () => {
    const world = bareArena(8, 1);
    const id = placeLive(world, 'cricket', 200, 150);
    const b = insect(world, id)!;
    b.heading = 0;
    sendOut(world, 0, 200 + 6, 150 - 4.2, Math.PI / 2);
    step(world);
    expect(b.holders).toBe(1);
    let freed = -1;
    let after = -1;
    run(world, 60, () => {
      if (freed >= 0 || b.escapes === 0) return;
      freed = world.step;
      after = world.ants.state[0]!;
      expect(b.hop + b.slip).toBeGreaterThan(0);
    });
    expect(freed).toBeGreaterThan(0);
    // Free, the ant goes back to what it was doing.
    expect(world.live).toHaveLength(1);
    expect(after).toBe(AntState.exploring);
  });

  it('the keeper clearing the food takes the live insects out too, and their holders let go', () => {
    const world = createTank(9);
    applyCommand(world, { type: 'insect', insect: 'cricket', cut: 'whole', x: 150, y: 120, live: true });
    expect(world.live).toHaveLength(1);
    const i = world.ants.count - 1;
    sendOut(world, i, 150, 120);
    world.ants.state[i] = AntState.holding;
    world.ants.liveHeld[i] = world.live[0]!.id;
    applyCommand(world, { type: 'clearFood' });
    expect(world.live).toHaveLength(0);
    expect(world.ants.liveHeld[i]).toBe(-1);
    expect(world.ants.state[i]).not.toBe(AntState.holding);
  });

  it('a tank saved before live insects loads with none, and runs', () => {
    const world = createTank(10);
    run(world, 5);
    const saved = structuredClone(world) as unknown as Record<string, unknown>;
    delete saved.live;
    const ants = saved.ants as Record<string, unknown>;
    delete ants.liveHeld;
    delete ants.holdU;
    delete ants.holdV;
    const loaded = loadWorld({ version: SAVE_VERSION, seed: 10, savedAt: 0, log: [], world: saved as unknown as World })!;
    expect(loaded.live).toEqual([]);
    expect(Array.from(loaded.ants.liveHeld)).toEqual(new Array(loaded.ants.count).fill(-1));
    applyCommand(loaded, { type: 'insect', insect: 'fly', cut: 'whole', x: 150, y: 120, live: true });
    run(loaded, 5);
  });

  it('is deterministic', () => {
    expectDeterministic((seed) => {
      const world = createTank(seed);
      applyCommand(world, { type: 'insect', insect: 'cricket', cut: 'whole', x: 120, y: 150, live: true });
      applyCommand(world, { type: 'insect', insect: 'fly', cut: 'whole', x: 60, y: 150, live: true });
      run(world, 120);
      return world;
    });
  });
});
