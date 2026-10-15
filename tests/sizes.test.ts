import { describe, expect, it } from 'vitest';
import { type AntContext, AntState, Caste, Place } from '../src/sim/ants';
import { BroodStage, addBrood } from '../src/sim/brood';
import { inspectAnt } from '../src/sim/inspect';
import { createTank } from '../src/sim/keeper';
import { TEST_TUBE_SETUP } from '../src/sim/nest';
import { makeSeeds, startAtPrey, tendStores, workAtPrey } from '../src/sim/prey';
import { Rng } from '../src/sim/rng';
import { SAVE_VERSION, type Save, loadWorld } from '../src/sim/save';
import { SIZE_CLASSES, classShares, crackSpeed, drawSize, seedCapacity, sizeClass } from '../src/sim/sizes';
import { Species } from '../src/sim/species';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { type World, createWorld, step } from '../src/sim/world';

const ctxOf = (world: World): AntContext => ({ ...world, prey: world.prey, rng: Rng.over(world.rng) });

/** A seed of `mass` mg lying in the arena at (x, y). */
function seedAt(world: World, x: number, y: number, mass: number) {
  const [p] = makeSeeds(world.seed, world.step, world.nextFoodId++, 'big', 1, x, y, 0);
  p!.mass = mass;
  p!.juice = mass * 0.75;
  world.prey.push(p!);
  return p!;
}

describe('Messor worker sizes (DESIGN.md 4.4)', () => {
  it('a young colony makes only minors; a grown one a third medias and a seventh majors', () => {
    expect(classShares(30)).toEqual({ media: 0, major: 0 });
    expect(classShares(100).major).toBe(0);
    expect(classShares(1000)).toEqual({ media: 0.35, major: 0.15 });
    for (const workers of [20, 1000]) {
      const rng = new Rng(1, 99);
      const n = { minor: 0, media: 0, major: 0 };
      for (let k = 0; k < 2000; k++) {
        const size = drawSize(rng, workers) / 10;
        const c = sizeClass(size);
        expect(size).toBeGreaterThanOrEqual(SIZE_CLASSES[c][0]);
        expect(size).toBeLessThan(SIZE_CLASSES[c][1]);
        n[c]++;
      }
      if (workers === 20) expect(n.minor).toBe(2000);
      else {
        expect(n.media / 2000).toBeCloseTo(0.35, 1);
        expect(n.major / 2000).toBeCloseTo(0.15, 1);
      }
    }
  });

  it('a new Messor tank starts with minors; other species have no sizes', () => {
    const messor = createTank(3, TEST_TUBE_SETUP, Species.messor);
    for (let i = 0; i < messor.ants.count; i++) {
      if (messor.ants.caste[i] !== Caste.worker) continue;
      expect(sizeClass(messor.ants.size[i]! / 10)).toBe('minor');
      expect(inspectAnt(messor, i).title).toMatch(/^Worker \d+, a minor of \d\.\d mm$/);
    }
    for (const species of [Species.lasiusNiger, Species.crematogaster]) expect(createTank(3, TEST_TUBE_SETUP, species).ants.size.every((s) => s === 0)).toBe(true);
  });

  it('a worker coming out of its cocoon gets a size in a Messor colony, none in a Lasius one', () => {
    for (const species of [Species.messor, Species.lasiusNiger]) {
      const w = createWorld(5, { ants: 1, species });
      w.ants.state[0] = AntState.resting;
      w.ants.timer[0] = 1e9;
      addBrood(w.brood, BroodStage.pupa, w.ants.x[0]!, w.ants.y[0]!);
      w.brood.progress[0] = 1;
      for (let s = 0; s < 60 * STEPS_PER_SECOND && w.ants.count === 1; s++) step(w);
      expect(w.ants.count).toBe(2);
      expect(w.ants.size[1]! > 0).toBe(species === Species.messor);
    }
  });

  it('a worker carries seeds up to its load, the cube of its length: a minor leaves a seed a major takes', () => {
    const world = createWorld(2, { nest: 'lab', ants: 2, species: Species.messor });
    const { ants, params } = world;
    ants.size[0] = 40;
    ants.size[1] = 110;
    expect(seedCapacity(ants, params, 0)).toBeCloseTo(params.seedCarryMax * (4 / 7) ** 3, 9);
    expect(seedCapacity(ants, params, 1)).toBeCloseTo(params.seedCarryMax * (11 / 7) ** 3, 9);
    const p = seedAt(world, 200, 200, 10);
    const ctx = ctxOf(world);
    for (const i of [0, 1]) {
      ants.place[i] = Place.arena;
      ants.x[i] = 200;
      ants.y[i] = 200;
      startAtPrey(ctx, i, p);
      workAtPrey(ctx, i);
    }
    expect(p.carriedBy).toBe(1);
    expect(ants.pieceHeld[0]).toBe(-1);
  });

  it('a major cracks a seed faster than a minor', () => {
    const took: number[] = [];
    for (const size of [40, 110]) {
      const world = createTank(6, undefined, Species.messor);
      const i = world.ants.caste.indexOf(Caste.worker);
      world.ants.size[i] = size;
      const [p] = makeSeeds(world.seed, 0, world.nextFoodId++, 'small', 1, world.ants.x[i]!, world.ants.y[i]!, 0);
      p!.place = Place.farm;
      world.prey.push(p!);
      world.ants.crop[i] = 0;
      // Kept from carrying it off to drier air: the seed counts as lying in the dry.
      world.params.seedDryHumidity = 2;
      const ctx = ctxOf(world);
      let s = 0;
      for (; s < 1e6 && p!.cuts === 0; s++) tendStores(ctx, i);
      took.push(s);
    }
    expect(crackSpeed({ size: Uint8Array.of(110) } as never, 0)).toBeCloseTo((11 / 7) ** 2, 9);
    expect(took[1]!).toBeLessThan(took[0]! / 3);
  });

  it('a Messor tank kept before sizes loads with every worker a media', () => {
    const world = createTank(4, TEST_TUBE_SETUP, Species.messor);
    const kept = structuredClone(world) as unknown as Record<string, unknown> & { ants: Record<string, unknown> };
    delete kept.ants.size;
    const save: Save = { version: SAVE_VERSION, seed: world.seed, savedAt: 0, log: [], world: kept as unknown as World };
    const loaded = loadWorld(save)!;
    expect(loaded.ants.size.length).toBe(world.ants.count);
    expect(loaded.ants.size.every((s) => s === 0)).toBe(true);
  });
});
