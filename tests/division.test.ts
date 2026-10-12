import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import { BroodStage, addBrood } from '../src/sim/brood';
import { addToField, updateField } from '../src/sim/farm';
import { type AntParams, DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { createWorld, removeAnt, step, type World } from '../src/sim/world';

function run(w: World, seconds: number): void {
  for (let s = 0; s < seconds * STEPS_PER_SECOND; s++) step(w);
}

/** How many of `n` hungry workers with the lowest threshold go out within 15 minutes. */
function goOut(n: number, set: (w: World) => void, params: Partial<AntParams> = {}): number {
  const w = createWorld(2, { ants: n, params: { burnRate: 0, ...params } });
  w.ants.crop.fill(0);
  w.ants.forageThreshold.fill(2);
  set(w);
  const out = new Uint8Array(n);
  for (let s = 0; s < 900 * STEPS_PER_SECOND; s++) {
    step(w);
    for (let i = 0; i < n; i++) if (w.ants.place[i] !== Place.farm) out[i] = 1;
  }
  return out.reduce((a, b) => a + b, 0);
}

describe('age and fat (M4)', () => {
  it('workers age one day per tank day', () => {
    const w = createWorld(1, { ants: 1 });
    const start = w.ants.age[0]!;
    run(w, w.params.daySeconds / 10);
    expect(w.ants.age[0]! - start).toBeCloseTo(0.1, 6);
  });

  it('the keeper starts with workers of the settled fat and mixed ages', () => {
    const w = createWorld(3, { ants: 40 });
    const { age, fat } = w.ants;
    for (let i = 0; i < 40; i++) {
      expect(fat[i]).toBe(w.params.fatRef);
      expect(age[i]).toBeGreaterThanOrEqual(w.params.startAgeMin);
      expect(age[i]).toBeLessThanOrEqual(w.params.startAgeMax);
    }
    expect(Math.max(...age) - Math.min(...age)).toBeGreaterThan(50);
  });

  it('a well-fed worker in the nest builds fat; one out in the arena spends it', () => {
    const home = createWorld(1, { ants: 1, params: { burnRate: 0 } });
    home.ants.crop[0] = home.params.cropLoad;
    home.ants.fat[0] = 0.3;
    home.ants.forageThreshold[0] = home.params.forageThresholdMax; // it stays in
    run(home, home.params.daySeconds / 10);
    expect(home.ants.fat[0]).toBeGreaterThan(0.32);
    // Out in the arena exploring, far from any food.
    const out = createWorld(1, { ants: 1, params: { burnRate: 0 } });
    const { ants } = out;
    ants.crop[0] = out.params.cropLoad;
    ants.fat[0] = 0.3;
    ants.place[0] = Place.arena;
    ants.state[0] = AntState.exploring;
    ants.x[0] = 150;
    ants.y[0] = 100;
    run(out, 90);
    expect(ants.place[0]).toBe(Place.arena);
    expect(ants.fat[0]).toBeLessThan(0.3 - 0.8 * out.params.fatBurnOut * (90 / out.params.daySeconds));
  }, 60_000);

  it('an empty crop builds no fat, so a hungry worker grows lean', () => {
    const w = createWorld(1, { ants: 1, params: { burnRate: 0 } });
    w.ants.crop[0] = 0;
    w.ants.forageThreshold[0] = w.params.forageThresholdMax; // it stays in
    run(w, w.params.daySeconds / 4);
    expect(w.ants.fat[0]).toBeCloseTo(w.params.fatRef - w.params.fatBurn / 4, 3);
  }, 60_000);

  it('with fat drift off (the control), fat stays where it starts', () => {
    const w = createWorld(1, { ants: 1, params: { fatDrift: false } });
    w.ants.crop[0] = 0;
    run(w, w.params.daySeconds / 4);
    expect(w.ants.fat[0]).toBe(w.params.fatRef);
  });

  it('lean workers go out to forage far more than fat ones with the same threshold', () => {
    const lean = goOut(20, (w) => w.ants.fat.fill(0.2));
    const fat = goOut(20, (w) => w.ants.fat.fill(1));
    expect(lean).toBeGreaterThan(8);
    expect(fat).toBeLessThan(lean / 3);
  }, 60_000);

  it('callows stay in the nest, however hungry and lean', () => {
    const callows = goOut(20, (w) => {
      w.ants.fat.fill(0);
      w.ants.age.fill(0);
    });
    expect(callows).toBe(0);
    const grown = goOut(20, (w) => {
      w.ants.fat.fill(0);
      w.ants.age.fill(w.params.callowDays);
    });
    expect(grown).toBeGreaterThan(10);
  }, 60_000);

  it('counts each trip out of the farm', () => {
    const w = createWorld(2, { ants: 10, params: { burnRate: 0 } });
    w.ants.crop.fill(0);
    w.ants.fat.fill(0);
    let departures = 0;
    for (let s = 0; s < 600 * STEPS_PER_SECOND; s++) {
      const was = w.ants.place.slice();
      step(w);
      for (let i = 0; i < 10; i++) if (was[i] === Place.farm && w.ants.place[i] === Place.tube) departures++;
    }
    expect(departures).toBeGreaterThan(0);
    expect(w.ants.trips.reduce((a, b) => a + b, 0)).toBe(departures);
  });
});

describe('taking workers out', () => {
  it('frees a nestmate it was feeding and puts down the brood it carried', () => {
    const w = createWorld(1, { ants: 3 });
    const { ants, brood } = w;
    ants.state[0] = AntState.sharing;
    ants.state[1] = AntState.sharing;
    ants.partner[0] = 1;
    ants.partner[1] = 0;
    const k = addBrood(brood, BroodStage.larva, ants.x[2]!, ants.y[2]!);
    brood.carried[k] = 1;
    ants.broodHeld[2] = k;
    ants.state[2] = AntState.carryingBrood;
    removeAnt(w, 0);
    removeAnt(w, 2);
    expect(ants.place[0]).toBe(Place.gone);
    expect(ants.state[1]).toBe(AntState.wandering);
    expect(ants.partner[1]).toBe(-1);
    expect(brood.carried[k]).toBe(0);
    const x = ants.x[0];
    run(w, 10);
    expect(ants.x[0]).toBe(x);
    expect(ants.place[0]).toBe(Place.gone);
  });
});

describe('protein for the brood (M4a)', () => {
  it('a worker carrying protein for the brood does not go out again until it has given it away', () => {
    const lean = goOut(20, (w) => w.ants.fat.fill(0));
    const carrying = goOut(20, (w) => {
      w.ants.fat.fill(0);
      w.ants.crop.fill(2 * w.params.nurseLoad);
      w.ants.cropProtein.fill(2 * w.params.nurseLoad);
    });
    expect(lean).toBeGreaterThan(8);
    expect(carrying).toBe(0);
  }, 60_000);

  it('out in the open, a protein carrier follows the larvae\'s scent instead of going back down its own hole', () => {
    const xAfter = (protein: number, seed: number): number => {
      const w = createWorld(seed, { ants: 1, params: { burnRate: 0 } });
      const { ants, farm } = w;
      const top = farm.surface[60]!;
      addToField(farm, farm.broodScent, 60, top - 3, 1000);
      for (let s = 0; s < 300; s++) updateField(farm, farm.broodScent, 2, 1e9, 1, true);
      ants.forageThreshold[0] = w.params.forageThresholdMax;
      ants.state[0] = AntState.wandering;
      ants.x[0] = 120;
      ants.y[0] = farm.surface[120]! - 2;
      ants.heading[0] = 0;
      ants.crop[0] = w.params.cropLoad / 2;
      ants.cropProtein[0] = protein;
      ants.hasHole[0] = 1;
      ants.holeX[0] = ants.piX[0]!;
      ants.holeY[0] = ants.piY[0]!;
      run(w, 60);
      return ants.x[0]!;
    };
    // The scent comes from x = 60; both start at x = 120, over their own hole.
    const seeds = [1, 2, 3, 4];
    for (const seed of seeds) expect(xAfter(2 * DEFAULT_ANT_PARAMS.nurseLoad, seed)).toBeLessThan(80);
    const others = seeds.map((seed) => xAfter(0, seed));
    expect(others.reduce((a, b) => a + b, 0) / seeds.length).toBeGreaterThan(100);
  }, 60_000);
});
