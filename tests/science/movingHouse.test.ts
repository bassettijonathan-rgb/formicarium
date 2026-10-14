/**
 * Moving house (DESIGN.md section 9, test 18; Nests 3). A queen, 250 workers
 * and brood settled in a test tube; after an hour the keeper joins it to a
 * dark, damp ytong nest. With the tube uncovered, as keepers do to make a
 * colony move, the queen, the workers and the brood go into the dark nest
 * within two hours; with the tube covered and room to spare in it, they stay.
 */
import { describe, expect, it } from 'vitest';
import { runMovingHouse } from '../../src/sim/experiments';

describe('a colony in a test tube joined to a nest', () => {
  it.each([1, 2])(
    'moves queen and brood into the dark nest when the tube is uncovered (seed %i)',
    (seed) => {
      const r = runMovingHouse({ seed, ants: 250, hours: 2, lit: true });
      expect(r.queenInNestByHour.at(-1)).toBe(true);
      expect(r.broodInNestByHour.at(-1)!).toBeGreaterThanOrEqual(0.85);
      expect(r.broodInTubeByHour.at(-1)!).toBeLessThanOrEqual(0.05);
      expect(r.tubeRestingByHour.at(-1)!).toBeLessThanOrEqual(5);
    },
    1_800_000,
  );

  it(
    'stays in a covered tube that has room',
    () => {
      const r = runMovingHouse({ seed: 1, ants: 250, hours: 2 });
      expect(r.queenInNestByHour.at(-1)).toBe(false);
      expect(r.broodInNestByHour.at(-1)!).toBeLessThanOrEqual(0.05);
      expect(r.nestRestingByHour.at(-1)!).toBeLessThan(0.1 * r.tubeRestingByHour.at(-1)!);
    },
    1_800_000,
  );
});
