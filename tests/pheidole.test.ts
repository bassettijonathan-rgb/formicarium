import { describe, expect, it } from 'vitest';
import { type AntContext, AntState, Caste, Place } from '../src/sim/ants';
import { createArena } from '../src/sim/arena';
import { inspectAnt } from '../src/sim/inspect';
import { createTank } from '../src/sim/keeper';
import { TEST_TUBE_SETUP } from '../src/sim/nest';
import { DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { startAtPrey, workAtPrey } from '../src/sim/prey';
import { Rng } from '../src/sim/rng';
import { SAVE_VERSION, type Save, loadWorld } from '../src/sim/save';
import { crackSpeed, cutSpeed, drawCaste, isMajor, laysTrail, majorResponse } from '../src/sim/sizes';
import { SPECIES_NAMES, Species, speciesParams } from '../src/sim/species';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { TANK_ARENA } from '../src/sim/tank';
import { type World, createWorld, placeInsect, step } from '../src/sim/world';

const ctxOf = (world: World): AntContext => ({ ...world, prey: world.prey, rng: Rng.over(world.rng) });
const MINOR = 25;
const MAJOR = 36;

/** A Pheidole lab colony of `ants` minors in the keeper's bare arena, all resting in the nest. */
function lab(seed: number, ants = 2): World {
  const world = createWorld(seed, { nest: 'lab', ants, species: Species.pheidole });
  world.arena = createArena(TANK_ARENA.width, TANK_ARENA.height);
  world.ants.size.fill(MINOR);
  return world;
}

describe('Pheidole pallidula (DESIGN.md 4.4)', () => {
  it('is a fourth species, with minors and majors and seeds taken only for protein', () => {
    expect(Species.pheidole).toBe(3);
    expect(SPECIES_NAMES[Species.pheidole]).toBe('Pheidole pallidula');
    expect(speciesParams(Species.pheidole)).toMatchObject({ dimorphic: true, seeds: true, seedHoard: 0 });
    for (const species of [Species.lasiusNiger, Species.crematogaster, Species.messor]) expect(speciesParams(species).dimorphic).toBeUndefined();
  });

  it('a worker comes out a minor or a major, about one in ten a major, nothing between', () => {
    const params = { ...DEFAULT_ANT_PARAMS, ...speciesParams(Species.pheidole) };
    const rng = new Rng(1, 98);
    let majors = 0;
    for (let k = 0; k < 4000; k++) {
      const size = drawCaste(rng, params) / 10;
      const [lo, hi] = size >= params.majorLength[0] ? params.majorLength : params.minorLength;
      expect(size).toBeGreaterThanOrEqual(lo);
      expect(size).toBeLessThanOrEqual(hi);
      if (size >= params.majorLength[0]) majors++;
    }
    expect(majors / 4000).toBeGreaterThan(0.08);
    expect(majors / 4000).toBeLessThan(0.12);
  });

  it('a new tank starts with minors and majors, the queen unsized, and a sugar drop rather than seeds', () => {
    const world = createTank(3, undefined, Species.pheidole);
    const { ants, params } = world;
    let majors = 0;
    for (let i = 0; i < ants.count; i++) {
      if (ants.caste[i] === Caste.queen) {
        expect(ants.size[i]).toBe(0);
        continue;
      }
      expect(ants.size[i]).toBeGreaterThan(0);
      if (isMajor(ants, params, i)) majors++;
      expect(inspectAnt(world, i).title).toMatch(isMajor(ants, params, i) ? /, a major of 3\.\d mm$/ : /, a minor of 2\.\d mm$/);
    }
    expect(majors).toBeGreaterThan(0);
    expect(majors).toBeLessThan(15);
    expect(world.food).toHaveLength(1);
    expect(world.prey).toHaveLength(0);
    const tube = createTank(3, TEST_TUBE_SETUP, Species.pheidole);
    for (let i = 0; i < tube.ants.count; i++) expect(tube.ants.size[i]! > 0).toBe(tube.ants.caste[i] === Caste.worker);
  });

  it('a major lays no trail, bites five times faster than a minor, and cracks seeds faster', () => {
    const world = lab(1);
    const { ants, params } = world;
    ants.size[1] = MAJOR;
    expect([isMajor(ants, params, 0), isMajor(ants, params, 1)]).toEqual([false, true]);
    expect(laysTrail(ants, params, 0)).toBe(1);
    expect(laysTrail(ants, params, 1)).toBe(0);
    expect(cutSpeed(ants, params, 0)).toBe(params.minorBite);
    expect(cutSpeed(ants, params, 1)).toBeCloseTo(params.minorBite * params.majorBite, 9);
    expect(crackSpeed(ants, params, 1) / crackSpeed(ants, params, 0)).toBeGreaterThan(params.majorBite);
    // Both walk home from food with a full crop: only the minor marks the way.
    for (const i of [0, 1]) {
      ants.state[i] = AntState.returning;
      ants.cropQuality[i] = 1;
      ants.x[i] = 200;
      ants.y[i] = i === 0 ? 60 : 240;
      ants.heading[i] = Math.PI;
    }
    for (let s = 0; s < 20; s++) step(world);
    let top = 0;
    let bottom = 0;
    for (let y = 0; y < world.arena.height; y++) {
      for (let x = 0; x < world.arena.width; x++) {
        const v = world.arena.trail[y * world.arena.width + x]!;
        if (y < 150) top += v;
        else bottom += v;
      }
    }
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBe(0);
  });

  it('other species bite as before', () => {
    const world = createWorld(1, { nest: 'lab', ants: 1, species: Species.messor });
    world.ants.size[0] = 110;
    expect(cutSpeed(world.ants, world.params, 0)).toBe(1);
    expect(laysTrail(world.ants, world.params, 0)).toBe(1);
  });

  it('a weak invitation barely moves a major, a strong one does; with no higher threshold it answers as a minor', () => {
    const params = { ...DEFAULT_ANT_PARAMS, ...speciesParams(Species.pheidole) };
    expect(majorResponse(0.5, params)).toBeLessThan(0.05 * 0.5);
    expect(majorResponse(10, params)).toBeGreaterThan(0.9 * 10);
    expect(majorResponse(0.5, { ...params, majorCall: 0 })).toBeCloseTo(0.5, 9);
  });

  it('a major cuts a leg off a cricket and leaves it lying, cutting on; a minor carries the leg it cuts home and invites majors', () => {
    for (const size of [MINOR, MAJOR]) {
      const world = lab(2, 1);
      const { ants, params } = world;
      ants.size[0] = size;
      placeInsect(world, 'cricket', 'whole', 150, 150);
      const leg = world.prey.find((p) => p.part === 'leg')!;
      ants.place[0] = Place.arena;
      ants.state[0] = AntState.exploring;
      ants.x[0] = leg.x;
      ants.y[0] = leg.y;
      const ctx = ctxOf(world);
      startAtPrey(ctx, 0, leg);
      let s = 0;
      for (; s < 1000 * STEPS_PER_SECOND && leg.joint >= 0; s++) workAtPrey(ctx, 0);
      expect(leg.joint).toBe(-1);
      if (size === MAJOR) {
        expect(leg.carriedBy).toBe(-1);
        expect(ants.state[0]).toBe(AntState.atPrey);
        expect(s).toBeLessThan((leg.toughness / params.minorBite) * STEPS_PER_SECOND / 2);
      } else {
        expect(leg.carriedBy).toBe(0);
        expect(ants.state[0]).toBe(AntState.returning);
        expect(ants.invite[0]).toBe(-1);
      }
    }
  });

  it('in the lab nest, a minor back from big prey calls the majors; one back from sugar does not', () => {
    const world = lab(3, 2);
    const { ants } = world;
    for (const i of [0, 1]) {
      ants.state[i] = AntState.returning;
      ants.cropQuality[i] = 0.6;
      ants.crop[i] = 0.1;
      ants.x[i] = world.arena.entranceX + 1;
      ants.y[i] = world.arena.entranceY;
    }
    ants.invite[0] = -1;
    step(world);
    expect(ants.state[0]).toBe(AntState.inNest);
    expect(ants.invite[0]).toBe(0);
    expect(world.nest.call).toBeCloseTo(0.6, 2);
    expect(world.nest.excitement).toBeCloseTo(1.2, 2);
  });

  it('a major in a tank is called by minors back from big prey that touch it, and then goes out for protein', () => {
    const world = createTank(5, undefined, Species.pheidole);
    const { ants, params } = world;
    const workers = [...ants.caste.keys()].filter((i) => ants.caste[i] === Caste.worker);
    const major = workers.find((i) => isMajor(ants, params, i))!;
    const minor = workers.find((i) => !isMajor(ants, params, i))!;
    for (const i of workers) if (i !== major && i !== minor) ants.x[i] = ants.x[i]! + 1000; // out of reach
    ants.x[minor] = ants.x[major]!;
    ants.y[minor] = ants.y[major]!;
    ants.age[major] = 30;
    ants.invite[minor] = Math.round(params.inviteTime * STEPS_PER_SECOND);
    let out = false;
    for (let s = 0; s < 120 * STEPS_PER_SECOND && !out; s++) {
      ants.x[minor] = ants.x[major]!;
      ants.y[minor] = ants.y[major]!;
      step(world);
      out = ants.state[major] === AntState.exploring || ants.state[major] === AntState.toFood;
    }
    expect(out).toBe(true);
    expect(ants.seekProtein[major]).toBe(1);
  });

  it('a tank kept before Pheidole loads with no invitations', () => {
    const world = createTank(4, TEST_TUBE_SETUP, Species.messor);
    const kept = structuredClone(world) as unknown as Record<string, unknown> & { ants: Record<string, unknown>; nest: Record<string, unknown> };
    delete kept.ants.invite;
    delete kept.ants.called;
    delete kept.nest.call;
    const save: Save = { version: SAVE_VERSION, seed: world.seed, savedAt: 0, log: [], world: kept as unknown as World };
    const loaded = loadWorld(save)!;
    expect(loaded.ants.invite.length).toBe(world.ants.count);
    expect(loaded.ants.called.every((c) => c === 0)).toBe(true);
    expect(loaded.nest.call).toBe(0);
  });
});
