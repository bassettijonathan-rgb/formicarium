import { describe, expect, it } from 'vitest';
import { Place } from '../src/sim/ants';
import { depositTrail, isBlocked } from '../src/sim/arena';
import { covers, isObstacle } from '../src/sim/decor';
import { hashState } from '../src/sim/hash';
import { FIRST_DROP, applyCommand, createTank, furnishArena } from '../src/sim/keeper';
import { SAVE_VERSION, loadWorld } from '../src/sim/save';
import { TANK_ARENA } from '../src/sim/tank';
import { createWorld, placeSugar, step } from '../src/sim/world';

describe("the keeper's arena (DESIGN.md A1, A4)", () => {
  it('is 40 x 30 cm with the tube halfway along its left wall', () => {
    const { arena } = createTank(1);
    expect([arena.width, arena.height]).toEqual([TANK_ARENA.width, TANK_ARENA.height]);
    expect(arena.entranceY).toBe(150);
    // The lab experiments keep their own 20 x 20 cm arena.
    expect(createWorld(1).arena.width).toBe(200);
  });

  it('lays out stones, bark, a water tube, leaves, twigs and moss from the seed', () => {
    const a = createTank(4);
    const kinds = new Set(a.decor.map((d) => d.kind));
    for (const k of ['stone', 'bark', 'tube', 'leaf', 'twig', 'moss']) expect(kinds.has(k as never)).toBe(true);
    expect(hashState(createTank(4).decor)).toBe(hashState(a.decor));
    expect(hashState(createTank(5).decor)).not.toBe(hashState(a.decor));
  });

  it('blocks the floor under stones, bark and the tube, and nowhere else', () => {
    const { arena, decor } = createTank(2);
    for (let y = 0; y < arena.height; y++) {
      for (let x = 0; x < arena.width; x++) {
        const under = decor.some((d) => isObstacle(d) && covers(d, x + 0.5, y + 0.5));
        expect(arena.wall[y * arena.width + x] === 1).toBe(under);
      }
    }
  });

  it("keeps the tube's mouth and the first drop clear", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { arena } = createTank(seed);
      for (let a = 0; a < 2 * Math.PI; a += 0.2) {
        expect(isBlocked(arena, arena.entranceX + 1 + 40 * Math.max(0, Math.cos(a)), arena.entranceY + 40 * Math.sin(a))).toBe(false);
        expect(isBlocked(arena, FIRST_DROP.x + 25 * Math.cos(a), FIRST_DROP.y + 25 * Math.sin(a))).toBe(false);
      }
    }
  });

  it('refuses food put down on top of an obstacle', () => {
    const world = createTank(3);
    const stone = world.decor.find((d) => d.kind === 'stone')!;
    const before = world.food.length;
    applyCommand(world, { type: 'sugar', x: stone.x, y: stone.y, volume: 10, concentration: 1 });
    applyCommand(world, { type: 'protein', x: stone.x, y: stone.y, volume: 3 });
    expect(world.food).toHaveLength(before);
  });

  it('is walked round: foragers never stand in an obstacle, and still find food on the far side', () => {
    // A lab colony at the tube's mouth, so foraging starts at once; sugar 36 cm away across the decorated floor.
    let found = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const world = createWorld(seed, { nest: 'lab', ants: 40 });
      furnishArena(world, [{ x: 360, y: 150, radius: 15 }]);
      const id = placeSugar(world, 360, 150, 20, 1);
      for (let s = 0; s < 10 * 60 * 20; s++) {
        step(world);
        if (s % 5 !== 0) continue;
        for (let i = 0; i < world.ants.count; i++) {
          if (world.ants.place[i] === Place.arena) expect(isBlocked(world.arena, world.ants.x[i]!, world.ants.y[i]!)).toBe(false);
        }
      }
      if ((world.food.find((d) => d.id === id)?.volume ?? 0) < 20) found++;
    }
    // In a bare arena of the same size all six colonies find it in 10 minutes; obstacles slow the search a little.
    expect(found).toBeGreaterThanOrEqual(4);
  }, 120_000);
});

describe('an old tank moving into the bigger arena (DESIGN.md A2)', () => {
  /** A save as it was before the arena grew: the old 20 x 20 arena and no decorations. */
  function oldSave() {
    const world = createWorld(7, { nest: 'lab', ants: 30 });
    placeSugar(world, 120, 60, 20, 1);
    for (let s = 0; s < 3 * 60 * 20; s++) step(world);
    // A trail from the tube's mouth toward the sugar.
    for (let x = 2; x < 120; x++) depositTrail(world.arena, x, 100 - (40 * x) / 120, 1);
    const raw = structuredClone(world) as unknown as Record<string, unknown>;
    delete raw.decor;
    return { world, save: { version: SAVE_VERSION, seed: 7, savedAt: 0, log: [], world: raw as never } };
  }

  it('keeps the ants, food and trails where they were relative to the tube, and lays decorations round them', () => {
    const { world, save } = oldSave();
    const loaded = loadWorld(save)!;
    const dy = TANK_ARENA.height / 2 - world.arena.entranceY;
    expect(loaded.arena.width).toBe(TANK_ARENA.width);
    expect(loaded.decor.length).toBeGreaterThan(0);
    expect(loaded.food[0]!.y).toBe(world.food[0]!.y + dy);
    let out = 0;
    for (let i = 0; i < world.ants.count; i++) {
      if (world.ants.place[i] !== Place.arena) continue;
      out++;
      expect(loaded.ants.y[i]).toBe(world.ants.y[i]! + dy);
      expect(isBlocked(loaded.arena, loaded.ants.x[i]!, loaded.ants.y[i]!)).toBe(false);
    }
    expect(out).toBeGreaterThan(0);
    let trail = 0;
    for (let y = 0; y < world.arena.height; y++) {
      for (let x = 0; x < world.arena.width; x++) {
        const v = world.arena.trail[y * world.arena.width + x]!;
        trail += v;
        const cell = (y + dy) * loaded.arena.width + x;
        if (!loaded.arena.wall[cell]) expect(loaded.arena.trail[cell]).toBe(v);
      }
    }
    expect(trail).toBeGreaterThan(0);
    for (let s = 0; s < 1200; s++) step(loaded);
  }, 60_000);
});
