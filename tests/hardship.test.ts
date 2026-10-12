import { describe, expect, it } from 'vitest';
import { type AntContext, AntState, Caste, Cause, DT, Place } from '../src/sim/ants';
import { endure } from '../src/sim/corpses';
import { Material } from '../src/sim/materials';
import { type AntParams } from '../src/sim/params';
import { Rng } from '../src/sim/rng';
import { STEPS_PER_SECOND } from '../src/sim/time';
import {
  addCorpse,
  cleanArena,
  createWorld,
  deathsBy,
  placeProtein,
  placeSugar,
  step,
  type World,
} from '../src/sim/world';

const MORTAL: Partial<AntParams> = { mortal: true };

/** A farm with one worker resting in it (or the queen alone), its crop empty and its fat `fat`. */
function oneAnt(params: Partial<AntParams> = MORTAL, fat = 0, queen = false): World {
  const w = createWorld(1, { ants: queen ? 0 : 1, queen, params });
  const { ants } = w;
  ants.place[0] = Place.farm;
  ants.state[0] = AntState.resting;
  ants.x[0] = 150;
  ants.y[0] = 150;
  ants.crop[0] = 0;
  ants.cropProtein[0] = 0;
  ants.fat[0] = fat;
  return w;
}

/** Runs the hardship rule alone on ant 0 for `days` tank days, as each step would. Returns true if it died. */
function endureFor(w: World, days: number): boolean {
  const ctx: AntContext = { ...w, rng: Rng.over(w.rng) };
  const steps = Math.round((days * w.params.daySeconds) / DT);
  for (let s = 0; s < steps; s++) if (endure(ctx, 0)) return true;
  return false;
}

describe('hunger, drying out and heat (M5c)', () => {
  it('with `mortal` off, a worker with nothing in its crop and no fat lives on', () => {
    const w = oneAnt({ starveDays: 0.01 }, 0);
    for (let s = 0; s < 0.03 * w.params.daySeconds * STEPS_PER_SECOND; s++) step(w);
    expect(w.ants.state[0]).not.toBe(AntState.dead);
  });

  it('a worker with an empty crop and its fat spent dies of hunger after `starveDays`', () => {
    const w = oneAnt();
    const days = w.params.starveDays;
    expect(endureFor(w, 0.95 * days)).toBe(false);
    expect(endureFor(w, 0.1 * days)).toBe(true);
    expect(w.ants.state[0]).toBe(AntState.dead);
    expect(w.ants.cause[0]).toBe(Cause.hunger);
  });

  it('a worker with food in its crop, or fat left, does not starve', () => {
    const fed = oneAnt();
    fed.ants.crop[0] = 0.01;
    expect(endureFor(fed, 3 * fed.params.starveDays)).toBe(false);
    const fat = oneAnt(MORTAL, 0.05);
    expect(endureFor(fat, 3 * fat.params.starveDays)).toBe(false);
  });

  it('a meal ends hunger: a worker fed just before it would starve starts over', () => {
    const w = oneAnt();
    const days = w.params.starveDays;
    expect(endureFor(w, 0.9 * days)).toBe(false);
    w.ants.crop[0] = 0.01;
    endureFor(w, DT / w.params.daySeconds);
    w.ants.crop[0] = 0;
    expect(endureFor(w, 0.9 * days)).toBe(false);
  });

  it('the queen does not starve', () => {
    const w = oneAnt(MORTAL, 0, true);
    expect(w.ants.caste[0]).toBe(Caste.queen);
    expect(endureFor(w, 3 * w.params.starveDays)).toBe(false);
  });

  it('a fat worker outlives a lean one when there is no food', () => {
    // Fat spent fast here so the test is short: the lean worker's lasts a quarter as long.
    const w = createWorld(1, { ants: 2, params: { ...MORTAL, fatBurn: 10, starveDays: 0.02 } });
    const { ants, params } = w;
    for (let i = 0; i < 2; i++) {
      ants.crop[i] = 0;
      ants.cropProtein[i] = 0;
    }
    ants.fat[0] = 0.8;
    ants.fat[1] = 0.2;
    const died = [-1, -1];
    for (let s = 0; s < 0.2 * params.daySeconds * STEPS_PER_SECOND && died[0]! < 0; s++) {
      step(w);
      for (let i = 0; i < 2; i++) if (died[i]! < 0 && ants.state[i] === AntState.dead) died[i] = s;
    }
    expect(died[1]).toBeGreaterThan(0);
    expect(died[0]).toBeGreaterThan(died[1]!);
    expect(ants.cause[0]).toBe(Cause.hunger);
  }, 60_000);

  it('an ant in dry air dies after `adultDryDays`; in damp air it lives', () => {
    const params = { ...MORTAL, waterFlow: true };
    const dry = oneAnt(params, 0.5);
    dry.farm.humidity.fill(0.2);
    const days = dry.params.adultDryDays;
    expect(endureFor(dry, 0.95 * days)).toBe(false);
    expect(endureFor(dry, 0.1 * days)).toBe(true);
    expect(dry.ants.cause[0]).toBe(Cause.drying);
    const damp = oneAnt(params, 0.5);
    damp.farm.humidity.fill(0.5);
    expect(endureFor(damp, 3 * days)).toBe(false);
    // The queen dries out too.
    const queen = oneAnt(params, 0, true);
    queen.farm.humidity.fill(0.2);
    expect(endureFor(queen, 1.05 * days)).toBe(true);
  });

  it('damp air undoes drying out, four times as fast as dry air does it', () => {
    const w = oneAnt({ ...MORTAL, waterFlow: true }, 0.5);
    const days = w.params.adultDryDays;
    w.farm.humidity.fill(0.2);
    expect(endureFor(w, 0.8 * days)).toBe(false);
    w.farm.humidity.fill(0.9);
    expect(endureFor(w, 0.2 * days)).toBe(false);
    w.farm.humidity.fill(0.2);
    expect(endureFor(w, 0.9 * days)).toBe(false);
  });

  it('with the soil\'s water still, nobody dries out', () => {
    const w = oneAnt(MORTAL, 0.5);
    w.farm.humidity.fill(0.2);
    expect(endureFor(w, 3 * w.params.adultDryDays)).toBe(false);
  });

  it('an ant above `heatDeath` dies within about an hour; at the heat mat\'s warmest it lives', () => {
    const hot = oneAnt(MORTAL, 0.5);
    hot.farm.temperature.fill(hot.params.heatDeath + 3);
    expect(endureFor(hot, 0.9 * hot.params.heatDeathDays)).toBe(false);
    expect(endureFor(hot, 0.2 * hot.params.heatDeathDays)).toBe(true);
    expect(hot.ants.cause[0]).toBe(Cause.heat);
    const warm = oneAnt(MORTAL, 0.5);
    warm.farm.temperature.fill(warm.params.matTemperature);
    expect(endureFor(warm, 2)).toBe(false);
  });

  it('a dying ant holding something dies once it has put it down', () => {
    const w = oneAnt();
    w.ants.state[0] = AntState.carryingBrood;
    expect(endureFor(w, 1.5 * w.params.starveDays)).toBe(false);
    w.ants.state[0] = AntState.wandering;
    expect(endureFor(w, DT / w.params.daySeconds)).toBe(true);
  });
});

describe('a forager lost in the farm (M5c)', () => {
  it('gives up looking for the tube after `tubeSearchMax` and forgets the way it thought it knew', () => {
    const w = createWorld(1, { ants: 1, params: { tubeSearchMax: 60 } });
    const { ants } = w;
    // Heading out from the headspace's top left corner, its path integrator so far off that it points
    // further into the corner.
    ants.place[0] = Place.farm;
    ants.state[0] = AntState.exploring;
    ants.x[0] = 4;
    ants.y[0] = 4;
    ants.knowsTube[0] = 1;
    ants.piX[0] = 300;
    ants.piY[0] = 30;
    ants.timer[0] = 0;
    for (let s = 0; s < 50 * STEPS_PER_SECOND; s++) step(w);
    expect(ants.state[0]).toBe(AntState.exploring);
    expect(ants.x[0]).toBeLessThan(30);
    for (let s = 0; s < 15 * STEPS_PER_SECOND; s++) step(w);
    expect(ants.state[0]).toBe(AntState.wandering);
    expect(ants.knowsTube[0]).toBe(0);
  });
});

describe('an ant shut in by fallen sand (M5c)', () => {
  /** A farm with one worker in a one-cell gap at the bottom of `depth` mm of loose sand filling a shaft from the surface. */
  function buried(seed: number, depth: number): World {
    const w = createWorld(seed, { ants: 1 });
    const { farm, ants } = w;
    for (let y = 50; y < 50 + depth; y++) {
      for (let x = 145; x < 156; x++) {
        const i = y * farm.width + x;
        farm.material[i] = Material.sand;
        farm.loose[i] = 1;
      }
    }
    const i = (50 + depth - 1) * farm.width + 150;
    farm.material[i] = Material.air;
    farm.loose[i] = 0;
    ants.place[0] = Place.farm;
    ants.state[0] = AntState.wandering;
    ants.x[0] = 150.5;
    ants.y[0] = 50 + depth - 0.5;
    return w;
  }

  it('after a minute shut in, digs its way up and out', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = buried(seed, 20);
      for (let s = 0; s < 50 * STEPS_PER_SECOND; s++) step(w);
      expect(w.ants.y[0]).toBeGreaterThan(65); // a moment in a tight spot is normal: it waits
      for (let s = 0; s < 70 * STEPS_PER_SECOND; s++) step(w);
      expect(w.ants.y[0]).toBeLessThan(52);
    }
  });

  it('a worker at the tip of a tunnel it is digging is not shut in', () => {
    const w = createWorld(1, { ants: 1 });
    const { farm, ants } = w;
    // A shaft 1 mm wide and 20 mm deep, open to the headspace: as tight round the ant at its bottom as a
    // pocket of fallen sand, but it leads on.
    for (let y = 40; y < 70; y++) farm.material[y * farm.width + 150] = Material.air;
    ants.place[0] = Place.farm;
    ants.state[0] = AntState.resting;
    ants.timer[0] = 1e6;
    ants.x[0] = 150.5;
    ants.y[0] = 69.5;
    for (let s = 0; s < 10 * STEPS_PER_SECOND; s++) step(w);
    expect(ants.state[0]).toBe(AntState.resting);
    expect(ants.y[0]).toBe(69.5);
  });
});

describe('a colony dying out (M5c)', () => {
  it('the tank notes when its last ant dies, and what it died of', () => {
    const w = oneAnt({ ...MORTAL, starveDays: 0.01 });
    expect(w.diedOut).toBe(-1);
    // (It may be carrying a grain up when its time comes, and dies once it has put it down.)
    for (let s = 0; s < 0.1 * w.params.daySeconds * STEPS_PER_SECOND; s++) step(w);
    expect(w.ants.state[0]).toBe(AntState.dead);
    expect(w.diedOut).toBeGreaterThan(0);
    expect(deathsBy(w)[Cause.hunger]).toBe(1);
  });

  it('a colony with ants alive has not died out', () => {
    const w = createWorld(1, { ants: 5, params: MORTAL });
    for (let s = 0; s < 600 * STEPS_PER_SECOND; s++) step(w);
    expect(w.diedOut).toBe(-1);
  });
});

describe('cleaning the arena (M5c)', () => {
  it('takes out the dead lying in the arena and mouldy food; leaves fresh food and the dead in the farm', () => {
    const w = createWorld(1, { ants: 0 });
    const out = addCorpse(w, Place.arena, 40, 40, 3);
    const inFarm = addCorpse(w, Place.farm, 150, 150, 3);
    placeSugar(w, 50, 50, 10, 1);
    const old = placeProtein(w, 60, 50, 3);
    w.food.find((d) => d.id === old)!.mouldy = true;
    expect(cleanArena(w)).toBe(2);
    expect(w.ants.place[out]).toBe(Place.gone);
    expect(w.ants.place[inFarm]).toBe(Place.farm);
    expect(w.food.map((d) => d.protein)).toEqual([0]);
    expect(deathsBy(w)[Cause.killed]).toBe(2);
  });
});
