import { describe, expect, it } from 'vitest';
import { BroodStage, addBrood, broodLike, createBrood } from '../src/sim/brood';
import { pilePurity, stageSegregation } from '../src/sim/experiments';

describe('brood sorting (M4b)', () => {
  it('a sorting worker counts brood of the item\'s own stage fully and other stages at the given weight', () => {
    const b = createBrood();
    addBrood(b, BroodStage.egg, 10, 10);
    addBrood(b, BroodStage.egg, 11, 10);
    addBrood(b, BroodStage.pupa, 10, 11);
    addBrood(b, BroodStage.pupa, 30, 30); // too far
    expect(broodLike(b, 10, 10, 2.5, BroodStage.egg, 0)).toBe(2);
    expect(broodLike(b, 10, 10, 2.5, BroodStage.egg, 0.5)).toBe(2.5);
    expect(broodLike(b, 10, 10, 2.5, BroodStage.egg, 0, 0)).toBe(1);
    expect(broodLike(b, 10, 10, 2.5, BroodStage.pupa, 0)).toBe(1);
    b.carried[1] = 1;
    expect(broodLike(b, 10, 10, 2.5, BroodStage.egg, 0)).toBe(1);
  });

  it('measures sorted piles as sorted and a mixed pile as mixed', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    const st: number[] = [];
    // Three piles 30 mm apart, one stage each.
    for (let s = 1; s <= 3; s++) {
      for (let n = 0; n < 6; n++) {
        xs.push(30 * s + (n % 3));
        ys.push(Math.floor(n / 3));
        st.push(s);
      }
    }
    expect(stageSegregation(xs, ys, st)).toBe(1);
    expect(pilePurity(xs, ys, st)).toEqual({ purity: 1, piles: 3 });
    // The same items all in one pile, stages in turn.
    const mixed = xs.map((_, k) => k % 6);
    const rows = xs.map((_, k) => Math.floor(k / 6));
    const stages = xs.map((_, k) => 1 + (k % 3));
    expect(stageSegregation(mixed, rows, stages)).toBeLessThan(0.5);
    expect(pilePurity(mixed, rows, stages).piles).toBe(1);
    expect(pilePurity(mixed, rows, stages).purity).toBeCloseTo(1 / 3, 9);
  });
});
