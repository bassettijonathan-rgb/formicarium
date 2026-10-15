import { describe, expect, it } from 'vitest';
import { type AntContext, AntState, Caste, Place } from '../src/sim/ants';
import { createArena } from '../src/sim/arena';
import { addBrood, BroodStage } from '../src/sim/brood';
import { cellSolid } from '../src/sim/farm';
import { hashState } from '../src/sim/hash';
import { inspectAnt } from '../src/sim/inspect';
import { applyCommand, createTank } from '../src/sim/keeper';
import { TEST_TUBE_SETUP } from '../src/sim/nest';
import { SEED_SCOOP } from '../src/sim/objects';
import { type Piece, SEED_MASS, agePieces, edible, makeSeeds, mayStoreSeed, tendStores } from '../src/sim/prey';
import { Rng } from '../src/sim/rng';
import { SAVE_VERSION, type Save, loadWorld } from '../src/sim/save';
import { Species, arenaFor } from '../src/sim/species';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { humidityAt } from '../src/sim/water';
import { type World, createWorld, placeSeeds, step } from '../src/sim/world';

const save = (world: World): Save => ({ version: SAVE_VERSION, seed: world.seed, savedAt: 0, log: [], world: structuredClone(world) });

/** A lab colony of `species` in a bare arena of its own size. */
function labColony(species: number, seed = 1, ants = 30): World {
  const world = createWorld(seed, { nest: 'lab', ants, species });
  const size = arenaFor(species);
  world.arena = createArena(size.width, size.height);
  return world;
}

function run(world: World, minutes: number, each?: () => void): void {
  for (let s = 0; s < minutes * 60 * STEPS_PER_SECOND; s++) {
    step(world);
    each?.();
  }
}

/** The ants' view of the world, as a step sees it. */
function ctxOf(world: World): AntContext {
  return { ...world, prey: world.prey, rng: Rng.over(world.rng) };
}

/** The driest and the dampest open floor in a tank's nest. */
function dryAndDamp(world: World): { dry: { x: number; y: number }; damp: { x: number; y: number } } {
  const { farm } = world;
  let dry = { x: 0, y: 0, rh: Infinity };
  let damp = { x: 0, y: 0, rh: -Infinity };
  for (let y = 1; y < farm.height - 1; y++) {
    for (let x = 1; x < farm.width - 1; x++) {
      if (cellSolid(farm, x, y)) continue;
      const rh = humidityAt(farm, x + 0.5, y + 0.5);
      if (rh < dry.rh) dry = { x: x + 0.5, y: y + 0.5, rh };
      if (rh > damp.rh) damp = { x: x + 0.5, y: y + 0.5, rh };
    }
  }
  return { dry, damp };
}

/** A seed moved into the nest at (x, y). */
function seedInNest(world: World, x: number, y: number, mass = 1): Piece {
  const [p] = makeSeeds(world.seed, world.step, world.nextFoodId++, 'small', 1, x, y, 0);
  p!.place = Place.farm;
  p!.mass = mass;
  p!.juice = mass * 0.75;
  world.prey.push(p!);
  return p!;
}

describe('seeds (DESIGN.md 4.4)', () => {
  it('come in three mixes of sizes, the same for the same seed and moment', () => {
    for (const mix of ['small', 'mixed', 'big'] as const) {
      const seeds = makeSeeds(1, 0, 1, mix, 50, 100, 100, 6);
      const [lo, hi] = SEED_MASS[mix];
      for (const p of seeds) {
        expect(p.mass).toBeGreaterThanOrEqual(lo);
        expect(p.mass).toBeLessThanOrEqual(hi);
        expect(p.juice).toBeLessThan(p.mass);
        expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThanOrEqual(6);
        expect(p.part).toBe('seed');
      }
    }
    expect(hashState(makeSeeds(1, 0, 1, 'mixed', 20, 0, 0, 5))).toBe(hashState(makeSeeds(1, 0, 1, 'mixed', 20, 0, 0, 5)));
    // A big seed is a few mm long, a small one a mm or two.
    expect(makeSeeds(1, 0, 1, 'big', 1, 0, 0, 0)[0]!.length).toBeGreaterThan(makeSeeds(1, 0, 1, 'small', 1, 0, 0, 0)[0]!.length);
  });

  it('a Messor tank has a 60 x 40 cm arena and a scoop of seeds to find; others keep 40 x 30 cm and a sugar drop', () => {
    const messor = createTank(1, TEST_TUBE_SETUP, Species.messor);
    expect([messor.arena.width, messor.arena.height]).toEqual([600, 400]);
    expect(messor.prey.filter((p) => p.insect === 'seed')).toHaveLength(SEED_SCOOP.count);
    expect(messor.food).toHaveLength(0);
    expect(messor.params.seeds).toBe(true);
    for (const species of [Species.lasiusNiger, Species.crematogaster]) {
      const other = createTank(1, TEST_TUBE_SETUP, species);
      expect([other.arena.width, other.arena.height]).toEqual([400, 300]);
      expect(other.prey).toHaveLength(0);
      expect(other.food).toHaveLength(1);
      expect(other.params.seeds).toBe(false);
    }
  });

  it('a kept Messor colony comes back as it was, in its big arena', () => {
    const world = createTank(2, undefined, Species.messor);
    run(world, 0.5);
    const back = loadWorld(save(world))!;
    expect([back.arena.width, back.arena.height]).toEqual([600, 400]);
    expect(hashState(back)).toBe(hashState(world));
  });

  it('Lasius niger and Crematogaster pass seeds by', () => {
    for (const species of [Species.lasiusNiger, Species.crematogaster]) {
      const world = labColony(species);
      world.ants.seekProtein.fill(1);
      placeSeeds(world, 'small', 20, world.arena.entranceX + 40, world.arena.entranceY, 5);
      const before = hashState(world.prey);
      let held = 0;
      run(world, 15, () => {
        for (let i = 0; i < world.ants.count; i++) if (world.ants.pieceHeld[i]! >= 0 || world.ants.state[i] === AntState.atPrey) held++;
      });
      expect(held).toBe(0);
      expect(hashState(world.prey)).toBe(before);
    }
  });

  it('a harvester carries a seed home whole, laying trail from a pile but not from a lone seed', () => {
    const pile = labColony(Species.messor, 3);
    placeSeeds(pile, 'small', 20, pile.arena.entranceX + 60, pile.arena.entranceY, 5);
    run(pile, 30);
    expect(pile.prey.length).toBeLessThan(20);
    expect(pile.arena.trail.some((v) => v > 0)).toBe(true);
    const lone = labColony(Species.messor, 3);
    placeSeeds(lone, 'small', 1, lone.arena.entranceX + 60, lone.arena.entranceY, 0);
    run(lone, 30);
    expect(lone.prey).toHaveLength(0);
    expect(lone.arena.trail.every((v) => v === 0)).toBe(true);
  });

  it('a seed too heavy for a worker is left lying', () => {
    const world = labColony(Species.messor, 4);
    const [id] = placeSeeds(world, 'big', 1, world.arena.entranceX + 30, world.arena.entranceY, 0);
    const p = world.prey.find((q) => q.id === id)!;
    p.mass = world.params.seedCarryMax * 2;
    run(world, 20);
    expect(p.place).toBe(Place.arena);
    expect(p.carriedBy).toBe(-1);
  });

  it('a seed keeps in dry air and goes mouldy in damp air', () => {
    const world = createTank(5, undefined, Species.messor);
    world.params.mould = true;
    const { dry, damp } = dryAndDamp(world);
    expect(humidityAt(world.farm, dry.x, dry.y)).toBeLessThan(world.params.seedDampHumidity);
    expect(humidityAt(world.farm, damp.x, damp.y)).toBeGreaterThanOrEqual(world.params.seedDampHumidity);
    const kept = seedInNest(world, dry.x, dry.y);
    const rotting = seedInNest(world, damp.x, damp.y);
    const [outside] = world.prey.filter((p) => p.place === Place.arena);
    for (let k = 0; k < 30; k++) agePieces(world, world.params.daySeconds * 4);
    expect(kept.mouldy).toBe(false);
    expect(outside!.mouldy).toBe(false);
    expect(rotting.mouldy).toBe(true);
  });

  it('a hungry worker cracks a seed it touches; a full one leaves it whole; then it eats from it', () => {
    for (const hungry of [true, false]) {
      const world = createTank(6, undefined, Species.messor);
      const i = world.ants.caste.indexOf(Caste.worker);
      // In the dry, where seeds are stored: one in damp air it would rather carry there first.
      const { dry } = dryAndDamp(world);
      world.ants.x[i] = dry.x;
      world.ants.y[i] = dry.y;
      const p = seedInNest(world, dry.x, dry.y);
      world.ants.crop[i] = hungry ? 0 : world.params.cropLoad;
      world.ants.broodNeed[i] = 0;
      const ctx = ctxOf(world);
      for (let s = 0; s < 10 * p.skin * STEPS_PER_SECOND && p.cuts === 0; s++) tendStores(ctx, i);
      expect(p.cuts > 0).toBe(hungry);
      if (!hungry) continue;
      const juice = p.juice;
      for (let s = 0; s < 120 * STEPS_PER_SECOND && world.ants.crop[i]! === 0; s++) tendStores(ctx, i);
      expect(p.juice).toBeLessThan(juice);
      expect(world.ants.crop[i]).toBeGreaterThan(0);
      expect(world.ants.cropProtein[i]).toBeCloseTo(world.ants.crop[i]! * world.params.seedProtein, 9);
    }
  });

  it('a worker picks up a whole seed lying in damp air, not one in dry air', () => {
    const world = createTank(11, undefined, Species.messor);
    const { dry, damp } = dryAndDamp(world);
    const i = world.ants.caste.indexOf(Caste.worker);
    const ctx = ctxOf(world);
    for (const at of [dry, damp]) {
      const p = seedInNest(world, at.x, at.y);
      world.ants.x[i] = at.x;
      world.ants.y[i] = at.y;
      world.ants.crop[i] = world.params.cropLoad;
      let took = false;
      for (let s = 0; s < 120 * STEPS_PER_SECOND && !took; s++) took = tendStores(ctx, i);
      expect(took).toBe(at === damp);
      expect(p.carriedBy).toBe(at === damp ? i : -1);
      world.prey.splice(world.prey.indexOf(p), 1);
      world.ants.pieceHeld[i] = -1;
    }
  });

  it('a worker carrying a seed puts it down in dry air, not in damp air nor by the brood', () => {
    const world = createTank(7, undefined, Species.messor);
    const { dry, damp } = dryAndDamp(world);
    const i = world.ants.caste.indexOf(Caste.worker);
    const ctx = ctxOf(world);
    const carry = (x: number, y: number): Piece => {
      const p = seedInNest(world, x, y);
      p.carriedBy = i;
      world.ants.pieceHeld[i] = p.id;
      world.ants.x[i] = x;
      world.ants.y[i] = y;
      return p;
    };
    const tries = (byBrood: boolean) => {
      let n = 0;
      while (n < 60 * STEPS_PER_SECOND && !mayStoreSeed(ctx, i, byBrood)) n++;
      return n;
    };
    carry(damp.x, damp.y);
    expect(tries(false)).toBe(60 * STEPS_PER_SECOND);
    carry(dry.x, dry.y);
    expect(tries(true)).toBe(60 * STEPS_PER_SECOND);
    const dropped = world.prey.find((p) => p.id === world.ants.pieceHeld[i])!;
    expect(tries(false)).toBeLessThan(60 * STEPS_PER_SECOND);
    expect(dropped.carriedBy).toBe(-1);
    expect(world.ants.pieceHeld[i]).toBe(-1);
  });

  it('a seed dispenser drops a scoop, and the next only once every seed of the last is gone', () => {
    const world = labColony(Species.lasiusNiger, 8, 0);
    applyCommand(world, { type: 'put', item: 'seedDispenser', x: 200, y: 200, concentration: 1, seeds: 'mixed' });
    run(world, 0.25);
    expect(world.prey).toHaveLength(SEED_SCOOP.count);
    for (const p of world.prey) {
      expect(p.mass).toBeGreaterThanOrEqual(SEED_MASS.mixed[0]);
      expect(p.mass).toBeLessThanOrEqual(SEED_MASS.mixed[1]);
    }
    // Nobody takes them here: it waits.
    run(world, 2);
    expect(world.prey).toHaveLength(SEED_SCOOP.count);
    world.prey.pop();
    run(world, 0.25);
    expect(world.prey).toHaveLength(SEED_SCOOP.count - 1);
    world.prey = [];
    run(world, 0.25);
    expect(world.prey).toHaveLength(SEED_SCOOP.count);
    // An insect dispenser saved before seeds still gives insects.
    const d = world.decor.find((x) => x.kind === 'dispenser')!;
    expect(d.kind === 'dispenser' && d.seeds).toBe('mixed');
  });

  it('the inspector says a worker carries a seed home', () => {
    const world = labColony(Species.messor, 9);
    placeSeeds(world, 'small', 10, world.arena.entranceX + 30, world.arena.entranceY, 3);
    let said = '';
    run(world, 20, () => {
      if (said) return;
      for (let i = 0; i < world.ants.count; i++) {
        if (world.ants.pieceHeld[i]! >= 0 && world.ants.place[i] === Place.arena) said = inspectAnt(world, i).doing;
      }
    });
    expect(said).toBe('carrying a seed home');
  });

  it('seeds a Messor colony carried in lie in its nest, edible, until cracked and eaten', () => {
    const world = createTank(10, TEST_TUBE_SETUP, Species.messor);
    addBrood(world.brood, BroodStage.larva, world.ants.x[0]!, world.ants.y[0]!);
    run(world, 60);
    const inNest = world.prey.filter((p) => p.place === Place.farm && p.carriedBy < 0);
    expect(inNest.length).toBeGreaterThan(0);
    expect(inNest.some(edible)).toBe(true);
  });
});
