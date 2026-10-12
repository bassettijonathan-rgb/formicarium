import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import { drawLifespan, isLiveWorker } from '../src/sim/corpses';
import { corpsePiles } from '../src/sim/experiments';
import { DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { addCorpse, createWorld, killAnt, removeAnt, step, type World } from '../src/sim/world';

function run(w: World, seconds: number): void {
  for (let s = 0; s < seconds * STEPS_PER_SECOND; s++) step(w);
}

/** A farm with one worker resting on the soil surface that will not go out, and a corpse touching it. */
function restingBeside(deadFor: number): { w: World; corpse: number } {
  const w = createWorld(1, { ants: 1, params: { burnRate: 0 } });
  const { ants } = w;
  ants.forageThreshold[0] = 1e6;
  ants.state[0] = AntState.resting;
  ants.timer[0] = 1e6;
  const corpse = addCorpse(w, Place.farm, ants.x[0]! + 1.5, ants.y[0]!, deadFor);
  return { w, corpse };
}

describe('old age (M4c)', () => {
  it('lifespans average the set mean, differ between workers and never fall short of the age already lived', () => {
    const p = DEFAULT_ANT_PARAMS;
    const spans = Array.from({ length: 4000 }, (_, i) => drawLifespan(7, i, 0, p));
    const mean = spans.reduce((a, b) => a + b, 0) / spans.length;
    expect(mean).toBeGreaterThan(0.95 * p.lifespanMean);
    expect(mean).toBeLessThan(1.05 * p.lifespanMean);
    expect(new Set(spans).size).toBe(spans.length);
    expect(drawLifespan(7, 3, 0, p)).toBe(spans[3]);
    for (let i = 0; i < 200; i++) expect(drawLifespan(7, i, 250, p)).toBeGreaterThanOrEqual(250);
  });

  it('the keeper’s workers get lifespans beyond their ages', () => {
    const w = createWorld(4, { ants: 50 });
    for (let i = 0; i < 50; i++) expect(w.ants.lifespan[i]).toBeGreaterThan(w.ants.age[i]!);
  });

  it('a worker past its lifespan dies where it is, and its crop goes with it', () => {
    const w = createWorld(1, { ants: 2 });
    const { ants } = w;
    ants.lifespan[0] = ants.age[0]!;
    run(w, 1);
    expect(ants.state[0]).toBe(AntState.dead);
    expect(ants.crop[0]).toBe(0);
    expect(isLiveWorker(ants, 0)).toBe(false);
    expect(isLiveWorker(ants, 1)).toBe(true);
    const x = ants.x[0];
    run(w, 10);
    expect(ants.x[0]).toBe(x);
    expect(ants.deadFor[0]! * w.params.daySeconds).toBeGreaterThan(10);
    expect(ants.deadFor[0]! * w.params.daySeconds).toBeLessThanOrEqual(11);
  });

  it('a worker carrying soil dies only once it has put the grain down', () => {
    const w = createWorld(1, { ants: 1 });
    const { ants } = w;
    ants.state[0] = AntState.carrying;
    ants.grain[0] = 1;
    ants.lifespan[0] = ants.age[0]!;
    step(w);
    expect(ants.state[0]).toBe(AntState.carrying);
  });
});

describe('corpses (M4c)', () => {
  it('a fresh corpse is left alone; once it smells of death, a worker touching it carries it off', () => {
    const fresh = restingBeside(0);
    run(fresh.w, 30);
    expect(fresh.w.ants.state[0]).toBe(AntState.resting);
    const old = restingBeside(2);
    run(old.w, 30);
    expect(old.w.ants.state[0]).toBe(AntState.carryingCorpse);
    expect(old.w.ants.corpseHeld[0]).toBe(old.corpse);
    expect(old.w.ants.carriedBy[old.corpse]).toBe(0);
  });

  it('a carried corpse goes where its carrier goes, through the tube into the arena', () => {
    const w = createWorld(2, { ants: 1, params: { burnRate: 0, corpseDropSpont: 0 } });
    const { ants, farm } = w;
    const k = addCorpse(w, Place.farm, farm.tubeX - 2, farm.tubeY, 2);
    ants.x[0] = farm.tubeX - 2;
    ants.y[0] = farm.tubeY;
    ants.piX[0] = -2;
    ants.piY[0] = 0;
    ants.knowsTube[0] = 1;
    ants.state[0] = AntState.resting;
    ants.timer[0] = 1e6;
    ants.forageThreshold[0] = 1e6;
    for (let s = 0; s < 120 * STEPS_PER_SECOND && ants.place[0] !== Place.arena; s++) step(w);
    expect(ants.place[0]).toBe(Place.arena);
    expect(ants.corpseHeld[0]).toBe(k);
    expect(ants.place[k]).toBe(Place.arena);
    expect(Math.hypot(ants.x[k]! - ants.x[0]!, ants.y[k]! - ants.y[0]!)).toBeLessThan(4);
    // Out in the arena it walks away from the entrance.
    run(w, 5);
    expect(ants.x[0]! - w.arena.entranceX).toBeGreaterThan(30);
  });

  it('carriers in the arena put their corpse down by a pile far sooner than alone', () => {
    // Carriers held still (speed 0), so each stays by the pile or alone.
    const dropTime = (pile: boolean): number => {
      let total = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const w = createWorld(seed, { ants: 1, nest: 'lab', params: { speed: 0 } });
        const { ants } = w;
        if (pile) for (let c = 0; c < 8; c++) addCorpse(w, Place.arena, 100 + (c % 3), 100 + Math.floor(c / 3), 2);
        const k = addCorpse(w, Place.arena, 100, 100, 2);
        ants.place[0] = Place.arena;
        ants.state[0] = AntState.carryingCorpse;
        ants.corpseHeld[0] = k;
        ants.carriedBy[k] = 0;
        ants.x[0] = 100;
        ants.y[0] = 100;
        ants.piX[0] = 100;
        let s = 0;
        while (ants.corpseHeld[0] === k && s < 600 * STEPS_PER_SECOND) {
          step(w);
          s++;
        }
        total += s / STEPS_PER_SECOND;
      }
      return total / 20;
    };
    expect(dropTime(true)).toBeLessThan(dropTime(false) / 10);
  });

  it('taking a carrier out leaves its corpse lying; taking a carried corpse out frees its carrier', () => {
    const a = restingBeside(2);
    run(a.w, 30);
    removeAnt(a.w, 0);
    expect(a.w.ants.carriedBy[a.corpse]).toBe(-1);
    expect(a.w.ants.state[a.corpse]).toBe(AntState.dead);
    const b = restingBeside(2);
    run(b.w, 30);
    removeAnt(b.w, b.corpse);
    expect(b.w.ants.corpseHeld[0]).toBe(-1);
    expect(b.w.ants.state[0]).toBe(AntState.wandering);
  });

  it('nestmates killed in an experiment become corpses', () => {
    const w = createWorld(1, { ants: 3 });
    killAnt(w, 1);
    expect(w.ants.state[1]).toBe(AntState.dead);
    expect(w.ants.deadFor[1]).toBe(0);
  });

  it('counts piles of corpses', () => {
    const xs = [0, 1, 2, 3, 4, 50, 51, 52, 53, 54, 100];
    const ys = xs.map(() => 0);
    expect(corpsePiles(xs, ys)).toEqual({ piles: 2, inPiles: 10 / 11 });
  });
});
