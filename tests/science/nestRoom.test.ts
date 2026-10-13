/**
 * Room to grow (DESIGN.md section 9, test 15). Workers and a queen moved into
 * a large ytong nest, far more room than they need: the resting colony keeps
 * together in a few chambers (Lasius niger workers settle beside resting
 * nestmates, Depickère et al. 2004), and the floor under it grows in
 * proportion to its workers (Mallon & Franks 2000).
 */
import { describe, expect, it } from 'vitest';
import { runNestRoom } from '../../src/sim/experiments';

describe('a colony in a bought nest', () => {
  it.each([1, 2])(
    'keeps together, on floor in proportion to its workers (seed %i)',
    (seed) => {
      const small = runNestRoom({ seed, ants: 20, hours: 3 });
      const big = runNestRoom({ seed, ants: 160, hours: 3 });
      const perAnt = (r: typeof small) => r.bodyByHour.at(-1)! / r.restingByHour.at(-1)!;
      expect(perAnt(big) / perAnt(small)).toBeGreaterThan(0.6);
      expect(perAnt(big) / perAnt(small)).toBeLessThan(1.6);
      // A small colony keeps to a corner of a big nest; a big one spreads into more of it.
      expect(small.chambersByHour.at(-1)!).toBeLessThanOrEqual(3);
      expect(big.chambersByHour.at(-1)!).toBeGreaterThan(small.chambersByHour.at(-1)!);
    },
    1_800_000,
  );

  it(
    'without settling beside nestmates (the control), a small colony spreads through the nest',
    () => {
      const r = runNestRoom({ seed: 1, ants: 20, hours: 3, params: { aggregation: false } });
      expect(r.chambersByHour.at(-1)!).toBeGreaterThanOrEqual(6);
    },
    1_800_000,
  );
});
