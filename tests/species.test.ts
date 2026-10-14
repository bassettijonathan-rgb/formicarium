import { describe, expect, it } from 'vitest';
import { AntState, Caste, Place } from '../src/sim/ants';
import { hashState } from '../src/sim/hash';
import { applyCommand, createTank } from '../src/sim/keeper';
import { DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { SAVE_VERSION, type Save, loadWorld } from '../src/sim/save';
import { Species, speciesParams } from '../src/sim/species';
import { step, type World } from '../src/sim/world';

const save = (world: World): Save => ({ version: SAVE_VERSION, seed: world.seed, savedAt: 0, log: [], world: structuredClone(world) });

/** The live workers, by id. */
function workers(world: World): number[] {
  const out: number[] = [];
  for (let i = 0; i < world.ants.count; i++) {
    if (world.ants.caste[i] === Caste.worker && world.ants.state[i] !== AntState.dead) out.push(i);
  }
  return out;
}

describe('species (DESIGN.md 4.4)', () => {
  it('Lasius niger is the model as it was; Crematogaster scutellaris changes only what the papers measured', () => {
    expect(speciesParams(Species.lasiusNiger)).toEqual({});
    const lasius = createTank(1);
    expect(lasius.species).toBe(Species.lasiusNiger);
    expect(lasius.params.alarm).toBe(false);
    expect(lasius.params.trailHalfLife).toBe(DEFAULT_ANT_PARAMS.trailHalfLife);
    const crema = createTank(1, undefined, Species.crematogaster);
    expect(crema.species).toBe(Species.crematogaster);
    expect(crema.params.alarm).toBe(true);
    expect(crema.params.trailHalfLife).toBeLessThan(lasius.params.trailHalfLife);
    expect(crema.params.broodHumidity).toBeLessThan(lasius.params.broodHumidity);
    // Brood times and food are borrowed from Lasius niger.
    expect(crema.params.daySeconds).toBe(lasius.params.daySeconds);
  });

  it('a kept colony comes back as its species; one kept before species is Lasius niger', () => {
    const crema = createTank(2, undefined, Species.crematogaster);
    for (let i = 0; i < 50; i++) step(crema);
    const back = loadWorld(save(crema))!;
    expect(back.species).toBe(Species.crematogaster);
    expect(back.params.alarm).toBe(true);
    expect(hashState(back)).toBe(hashState(crema));
    const old = save(createTank(3));
    delete (old.world as Partial<World>).species;
    delete (old.world.ants as Partial<World['ants']>).alarm;
    const lasius = loadWorld(old)!;
    expect(lasius.species).toBe(Species.lasiusNiger);
    expect(lasius.ants.alarm).toHaveLength(lasius.ants.count);
    expect(lasius.params.alarm).toBe(false);
  });

  it('the keeper\'s hand near workers in the arena alarms them, in a species that takes alarm', () => {
    for (const species of [Species.lasiusNiger, Species.crematogaster]) {
      const world = createTank(4, undefined, species);
      const [near, far] = workers(world);
      world.ants.place[near!] = Place.arena;
      world.ants.x[near!] = 200;
      world.ants.y[near!] = 150;
      world.ants.place[far!] = Place.arena;
      world.ants.x[far!] = 350;
      world.ants.y[far!] = 150;
      applyCommand(world, { type: 'sugar', x: 210, y: 150, volume: 20, concentration: 1 });
      expect(world.ants.alarm[near!]).toBe(species === Species.crematogaster ? 1 : 0);
      expect(world.ants.alarm[far!]).toBe(0);
    }
  });

  it('an alarmed worker wakes, and passes its alarm, weaker, only to the nestmates it touches', () => {
    const world = createTank(5, undefined, Species.crematogaster);
    for (let i = 0; i < 20 * 60 * 5; i++) step(world);
    const { ants, params } = world;
    const farm = workers(world).filter((i) => ants.place[i] === Place.farm);
    // A resting worker with a resting nestmate touching it.
    const pair = farm.flatMap((i) => farm.filter((j) => j !== i && Math.hypot(ants.x[j]! - ants.x[i]!, ants.y[j]! - ants.y[i]!) < params.contactRadius * 0.8).map((j) => [i, j]))
      .find(([i, j]) => ants.state[i!] === AntState.resting && ants.state[j!] === AntState.resting)!;
    expect(pair).toBeDefined();
    const [i, j] = pair as [number, number];
    const far = farm.filter((k) => Math.hypot(ants.x[k]! - ants.x[i]!, ants.y[k]! - ants.y[i]!) > 30);
    ants.alarm[i] = 1;
    step(world);
    expect(ants.alarm[j]).toBeGreaterThan(params.alarmRelay * 0.95);
    expect(ants.alarm[j]).toBeLessThanOrEqual(params.alarmRelay);
    for (const k of far) expect(ants.alarm[k]).toBe(0);
    step(world);
    expect(ants.state[i]).not.toBe(AntState.resting);
    expect(ants.state[j]).not.toBe(AntState.resting);
  });

  it('alarm fades with its half-life', () => {
    const world = createTank(6, undefined, Species.crematogaster);
    const [i] = workers(world);
    world.ants.alarm[i!] = 1;
    for (let s = 0; s < world.params.alarmHalfLife * 20; s++) step(world);
    expect(world.ants.alarm[i!]).toBeLessThan(0.75);
    for (let s = 0; s < world.params.alarmHalfLife * 20 * 6; s++) step(world);
    expect(world.ants.alarm[i!]).toBe(0);
  });
});
