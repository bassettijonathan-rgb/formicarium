/**
 * Double bridge (DESIGN.md section 9, tests 1 and the symmetric variant).
 *
 * Goss et al. 1989 and Beckers et al. 1992 (Lasius niger): offered a short and
 * a long branch to the same food, most colonies end up using the short one.
 * Deneubourg et al. 1990: with two equal branches, colonies still settle on
 * one of them, chosen at random. Both results come from trail laying, so the
 * control without trail must not show them.
 */
import { describe, expect, it } from 'vitest';
import { runDoubleBridge } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TIMEOUT = 120_000;

describe('double bridge, long branch twice the short one', () => {
  it(
    'most colonies settle on the short branch, which the no-trail control never does',
    () => {
      const withTrail = SEEDS.map((seed) => runDoubleBridge({ seed, longRatio: 2 }).upperShare);
      const control = SEEDS.map((seed) => runDoubleBridge({ seed, longRatio: 2, params: { trailLaying: false } }).upperShare);
      // A colony "settles" on a branch when 80% of the crossings use it.
      expect(withTrail.filter((s) => s > 0.8).length).toBeGreaterThanOrEqual(7);
      expect(control.filter((s) => s > 0.8).length).toBe(0);
    },
    TIMEOUT,
  );
});

describe('double bridge, two equal branches', () => {
  it(
    'colonies pick one branch at random; without trail, traffic splits evenly',
    () => {
      const withTrail = SEEDS.map((seed) => runDoubleBridge({ seed, longRatio: 1 }).upperShare);
      const control = SEEDS.map((seed) => runDoubleBridge({ seed, longRatio: 1, params: { trailLaying: false } }).upperShare);
      expect(withTrail.filter((s) => Math.abs(s - 0.5) > 0.3).length).toBeGreaterThanOrEqual(8);
      // Random choice: both branches win in some colonies.
      expect(withTrail.some((s) => s > 0.8)).toBe(true);
      expect(withTrail.some((s) => s < 0.2)).toBe(true);
      for (const s of control) expect(Math.abs(s - 0.5)).toBeLessThan(0.1);
    },
    TIMEOUT,
  );
});
