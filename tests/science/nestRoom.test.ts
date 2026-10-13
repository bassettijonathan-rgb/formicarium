/**
 * Room to grow (DESIGN.md section 9, test 15). Workers and a queen moved into
 * a large ytong nest, far more room than they need: the floor the resting
 * colony covers grows in proportion to its workers (Mallon & Franks 2000).
 */
import { describe, expect, it } from 'vitest';
import { runNestRoom } from '../../src/sim/experiments';

describe('a colony in a bought nest', () => {
  it.each([1, 2])(
    'covers floor in proportion to its workers (seed %i)',
    (seed) => {
      const small = runNestRoom({ seed, ants: 20, hours: 2 });
      const big = runNestRoom({ seed, ants: 80, hours: 2 });
      const perAnt = (r: typeof small) => r.areaByHour.at(-1)! / r.restingByHour.at(-1)!;
      expect(big.areaByHour.at(-1)!).toBeGreaterThan(2.5 * small.areaByHour.at(-1)!);
      expect(perAnt(big) / perAnt(small)).toBeGreaterThan(0.7);
      expect(perAnt(big) / perAnt(small)).toBeLessThan(1.3);
      // A small colony keeps to part of a big nest.
      expect(small.chambersByHour.at(-1)!).toBeLessThan(small.chambers);
    },
    1_800_000,
  );
});
