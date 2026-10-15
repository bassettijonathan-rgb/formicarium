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
import { crackSpeed, cutSpeed, drawCaste, isMajor, laysTrail, majorChance, majorResponse } from '../src/sim/sizes';
import { BroodStage, addBrood, createBrood, stepBrood } from '../src/sim/brood';
import { SPECIES_NAMES, Species, speciesParams } from '../src/sim/species';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { TANK_ARENA } from '../src/sim/tank';
import { type World, createWorld, placeInsect, step } from '../src/sim/world';

const ctxOf = (world: World): AntContext => ({ ...world, prey: world.prey, rng: Rng.over(world.rng) });
const MINOR = 25;
const MAJOR = 36;

/** A Pheidole farm colony of `ants` workers lying still together at the first worker's place. */
function farm(seed: number, ants: number): World {
  const world = createWorld(seed, { ants, species: Species.pheidole });
  for (let i = 0; i < ants; i++) {
    world.ants.size[i] = MINOR;
    world.ants.state[i] = AntState.resting;
    world.ants.timer[i] = 1e9;
    world.ants.x[i] = world.ants.x[0]!;
    world.ants.y[i] = world.ants.y[0]!;
  }
  return world;
}

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

describe('Pheidole castes that respond (DESIGN.md 4.4, P3 and P7)', () => {
  const params = { ...DEFAULT_ANT_PARAMS, ...speciesParams(Species.pheidole) };

  it('a larva well fed at the end of its growth may become a major, less often the more majors were about; an unfed one never', () => {
    expect(majorChance(0, 0, params)).toBe(0);
    expect(majorChance(1, 0, params)).toBeCloseTo(params.majorMax, 12);
    expect(majorChance(0.5, 0, params)).toBeCloseTo(params.majorMax / 4, 12);
    expect(majorChance(1, params.majorInhibit, params)).toBeCloseTo(params.majorMax / 2, 12);
    expect(majorChance(1, 0.3, params)).toBeLessThan(0.02);
  });

  it('a Pheidole larva records how well it is fed over the end of its growth; earlier, or in another species, nothing', () => {
    const world = farm(1, 1);
    const { brood } = world;
    const early = addBrood(brood, BroodStage.larva, 10, 10);
    const fed = addBrood(brood, BroodStage.larva, 10, 10);
    const starved = addBrood(brood, BroodStage.larva, 10, 10);
    brood.progress[early] = 0.2;
    brood.progress[fed] = brood.progress[starved] = 1 - params.majorWindow + 0.01;
    brood.food[early] = brood.food[fed] = params.larvaFood;
    stepBrood(brood, world.farm, world.params, 600);
    expect(brood.late[early]).toBe(0);
    expect(brood.late[fed]).toBe(600);
    expect(brood.short[fed]).toBe(0);
    expect(brood.late[starved]).toBe(600);
    expect(brood.short[starved]).toBe(600);
    const lasius = createBrood();
    const k = addBrood(lasius, BroodStage.larva, 10, 10);
    lasius.progress[k] = 0.9;
    stepBrood(lasius, world.farm, DEFAULT_ANT_PARAMS, 600);
    expect(lasius.late[k]).toBe(0);
  });

  it('a larva at the end of its growth counts the workers touching it, and the majors among them', () => {
    const world = farm(2, 3);
    world.ants.size[2] = MAJOR;
    const k = addBrood(world.brood, BroodStage.larva, world.ants.x[0]!, world.ants.y[0]!);
    world.brood.progress[k] = 0.95;
    world.brood.food[k] = world.params.larvaFood;
    world.params.broodPickRate = 0; // nobody carries it off
    for (let s = 0; s < STEPS_PER_SECOND; s++) step(world);
    expect(world.brood.workerTouch[k]).toBeCloseTo(3, 6);
    expect(world.brood.majorTouch[k]).toBeCloseTo(1, 6);
  });

  it('a worker comes out a major only if it was fed as a larva; one with no record comes out at the fixed share', () => {
    const sizes = (late: number, short: number, majorMax: number): number[] => {
      const out: number[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const world = farm(seed, 1);
        world.params.majorMax = majorMax;
        const k = addBrood(world.brood, BroodStage.pupa, world.ants.x[0]!, world.ants.y[0]!);
        world.brood.progress[k] = 1;
        world.brood.late[k] = late;
        world.brood.short[k] = short;
        for (let s = 0; s < 60 * STEPS_PER_SECOND && world.ants.count === 1; s++) step(world);
        expect(world.ants.count).toBe(2);
        out.push(world.ants.size[1]!);
      }
      return out;
    };
    expect(sizes(1000, 0, 10).every((s) => s >= 10 * params.majorLength[0])).toBe(true);
    expect(sizes(1000, 1000, 10).every((s) => s > 0 && s <= 10 * params.minorLength[1])).toBe(true);
    expect(sizes(0, 0, 10).every((s) => s > 0)).toBe(true);
  });

  it('a brood slot used again starts with no record', () => {
    const brood = createBrood();
    const k = addBrood(brood, BroodStage.larva, 1, 1);
    brood.late[k] = brood.short[k] = brood.workerTouch[k] = brood.majorTouch[k] = 5;
    brood.stage[k] = BroodStage.none;
    expect(addBrood(brood, BroodStage.egg, 2, 2)).toBe(k);
    expect([brood.late[k], brood.short[k], brood.workerTouch[k], brood.majorTouch[k]]).toEqual([0, 0, 0, 0]);
  });

  it('a tank kept before castes responded loads with its brood unrecorded', () => {
    const world = createTank(6, TEST_TUBE_SETUP, Species.pheidole);
    const kept = structuredClone(world) as unknown as Record<string, unknown> & { brood: Record<string, unknown> };
    for (const key of ['late', 'short', 'workerTouch', 'majorTouch']) delete kept.brood[key];
    const save: Save = { version: SAVE_VERSION, seed: world.seed, savedAt: 0, log: [], world: kept as unknown as World };
    const loaded = loadWorld(save)!;
    expect(loaded.brood.late.length).toBe(world.brood.stage.length);
    expect(loaded.brood.majorTouch.every((t) => t === 0)).toBe(true);
    for (let s = 0; s < 10 * STEPS_PER_SECOND; s++) step(loaded);
  });

  it('Pheidole takes alarm; a major only from a strongly alarmed nestmate, and it holds it longer', () => {
    expect(params.alarm).toBe(true);
    const world = farm(3, 3);
    const { ants } = world;
    ants.size[1] = MAJOR;
    ants.alarm[0] = 0.4; // alarmed, but below `majorAlarm`
    step(world);
    expect(ants.alarm[1]).toBe(0);
    expect(ants.alarm[2]).toBeGreaterThan(world.params.alarmShow);
    const strong = farm(3, 3);
    strong.ants.size[1] = MAJOR;
    strong.ants.alarm[0] = 1;
    step(strong);
    expect(strong.ants.alarm[1]).toBeCloseTo(strong.ants.alarm[2]!, 2);
    // Apart, a major's alarm halves in `majorAlarmHalfLife`, a minor's in `alarmHalfLife`.
    strong.ants.x[2] = strong.ants.x[2]! + 50;
    strong.ants.alarm.fill(0);
    strong.ants.alarm[1] = strong.ants.alarm[2] = 1;
    for (let s = 0; s < 45 * STEPS_PER_SECOND; s++) step(strong);
    expect(strong.ants.alarm[2]).toBeCloseTo(0.5, 2);
    expect(strong.ants.alarm[1]).toBeCloseTo(Math.pow(0.5, 45 / strong.params.majorAlarmHalfLife), 2);
  });
});
