/**
 * Food choice (DESIGN.md section 9, test 2).
 *
 * Beckers et al. 1990 and 1993 (Lasius niger): offered a rich (1 M) and a poor
 * (0.1 M) sucrose drop at the same distance, the colony concentrates on the
 * rich one, because foragers lay more trail for better food.
 */
import { describe, expect, it } from 'vitest';
import { runFoodChoice } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TIMEOUT = 120_000;

describe('food choice', () => {
  it(
    'colonies feed mostly at the richer drop',
    () => {
      const shares = SEEDS.map((seed) => runFoodChoice({ seed, concentrationA: 1, concentrationB: 0.1 }).shareA);
      expect(shares.filter((s) => s > 0.6).length).toBeGreaterThanOrEqual(8);
    },
    TIMEOUT,
  );

  it(
    'with two equal drops there is no side preference: each side wins in some colonies',
    () => {
      const shares = SEEDS.map((seed) => runFoodChoice({ seed, concentrationA: 1, concentrationB: 1 }).shareA);
      expect(shares.filter((s) => s > 0.6).length).toBeGreaterThanOrEqual(2);
      expect(shares.filter((s) => s < 0.4).length).toBeGreaterThanOrEqual(2);
    },
    TIMEOUT,
  );
});
