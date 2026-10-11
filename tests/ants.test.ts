import { describe, expect, it } from 'vitest';
import { AntState } from '../src/sim/ants';
import { isBlocked } from '../src/sim/arena';
import { doubleBridge } from '../src/sim/lab';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { createWorld, placeSugar, step } from '../src/sim/world';
import { expectDeterministic } from './helpers';

const MINUTE = 60 * STEPS_PER_SECOND;

describe('ants', () => {
  it('are deterministic', () => {
    expectDeterministic((seed) => {
      const w = createWorld(seed, { ants: 30, nest: 'lab' });
      placeSugar(w, 120, 80, 50, 1);
      for (let i = 0; i < 2 * MINUTE; i++) step(w);
      return w;
    });
  });

  it('start in the nest and come out over time', () => {
    const w = createWorld(1, { ants: 40, nest: 'lab', params: { leaveRate: 1 / 60 } });
    expect([...w.ants.state].every((s) => s === AntState.inNest)).toBe(true);
    for (let i = 0; i < 2 * MINUTE; i++) step(w);
    expect([...w.ants.state].filter((s) => s !== AntState.inNest).length).toBeGreaterThan(10);
  });

  it('never walk into walls', () => {
    const w = createWorld(2, { ants: 40, nest: 'lab', params: { leaveRate: 1 / 30 } });
    doubleBridge(w, 2);
    for (let i = 0; i < 5 * MINUTE; i++) {
      step(w);
      for (let a = 0; a < w.ants.count; a++) {
        if (w.ants.state[a] === AntState.inNest) continue;
        expect(isBlocked(w.arena, w.ants.x[a]!, w.ants.y[a]!)).toBe(false);
      }
    }
  });

  it('find their way home by path integration after exploring', () => {
    // No food: every ant explores, gives up and must get home on its own.
    const w = createWorld(3, { ants: 40, nest: 'lab', params: { leaveRate: 1 / 60, exploreTime: 60 } });
    const homingSince = new Int32Array(w.ants.count).fill(-1);
    let longest = 0;
    let homeComings = 0;
    for (let i = 0; i < 20 * MINUTE; i++) {
      step(w);
      for (let a = 0; a < w.ants.count; a++) {
        const s = w.ants.state[a];
        if (s === AntState.homing && homingSince[a] === -1) homingSince[a] = w.step;
        if (s === AntState.inNest && homingSince[a]! >= 0) {
          longest = Math.max(longest, w.step - homingSince[a]!);
          homeComings++;
          homingSince[a] = -1;
        }
      }
    }
    expect(homeComings).toBeGreaterThan(50);
    // The arena is 20 cm across: walking home should never take more than a couple of minutes.
    expect(longest / STEPS_PER_SECOND).toBeLessThan(120);
    for (let a = 0; a < w.ants.count; a++) {
      if (homingSince[a]! >= 0) expect((w.step - homingSince[a]!) / STEPS_PER_SECOND).toBeLessThan(120);
    }
  });

  it('lay no trail unless they found food', () => {
    const w = createWorld(4, { ants: 40, nest: 'lab', params: { leaveRate: 1 / 30 } });
    for (let i = 0; i < 5 * MINUTE; i++) step(w);
    expect(w.arena.trail.every((v) => v === 0)).toBe(true);
  });

  it('carry sugar from a drop to the nest, and lay trail on the way back', () => {
    const w = createWorld(5, { ants: 40, nest: 'lab', params: { leaveRate: 1 / 30 } });
    placeSugar(w, 60, 100, 500, 1);
    for (let i = 0; i < 15 * MINUTE; i++) step(w);
    const drop = w.food[0]!;
    expect(drop.volume).toBeLessThan(500);
    expect(w.nest.stores).toBeGreaterThan(0);
    // Sugar is conserved: what left the drop is in the nest or in crops.
    let inCrops = 0;
    for (let a = 0; a < w.ants.count; a++) inCrops += w.ants.crop[a]!;
    expect(w.nest.stores + inCrops).toBeCloseTo(500 - drop.volume, 9);
    expect(w.arena.trail.some((v) => v > 0)).toBe(true);
  });

  it('remove a drop once it is used up', () => {
    const w = createWorld(6, { ants: 40, nest: 'lab', params: { leaveRate: 1 / 20 } });
    placeSugar(w, 40, 100, 0.5, 1);
    for (let i = 0; i < 15 * MINUTE; i++) step(w);
    expect(w.food.length).toBe(0);
  });
});
