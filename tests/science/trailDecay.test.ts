/**
 * Trail decay (DESIGN.md section 9, test 3): when food runs out, nobody lays
 * trail any more, recruitment stops and the trail fades.
 */
import { describe, expect, it } from 'vitest';
import { runTrailDecay } from '../../src/sim/experiments';
import { DEFAULT_ANT_PARAMS } from '../../src/sim/params';

describe('trail decay after the food is removed', () => {
  it(
    'recruitment collapses and the trail fades at the pheromone half-life',
    () => {
      for (const seed of [1, 2, 3]) {
        const r = runTrailDecay({ seed, minutesWithFood: 20, minutesAfter: 20 });
        expect(r.departuresAfter).toBeLessThan(0.25 * r.departuresWithFood);
        // No one lays trail without food, so it decays exactly with the half-life.
        const expected = Math.pow(0.5, (20 * 60) / DEFAULT_ANT_PARAMS.trailHalfLife);
        expect(r.trailAfter / r.trailAtRemoval).toBeCloseTo(expected, 2);
      }
    },
    120_000,
  );
});
