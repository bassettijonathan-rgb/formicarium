/**
 * Colony growth (DESIGN.md section 9, test 8). A queen and 30 workers get
 * fresh sugar water and an insect every day. Larvae grow only on protein, so
 * the colony raises new workers only when its foragers bring the insect in:
 * workers that smell hungry larvae go out for protein, nurses carry it to the
 * brood, and the queen lays on what she is fed. Without the insect (the
 * control) the queen's first eggs hatch but the larvae never grow, and in
 * the end the nurses eat them.
 *
 * To keep the test short, eggs and pupae develop eight times faster than in
 * the tank (2 and 1.75 tank days instead of 16 and 14). Larvae keep their
 * real 12 days: squeezing the larval stage would ask the nurses for its
 * protein eight times faster than a real colony feeds its larvae.
 * `npm run experiment -- growth` runs the real durations over 60 tank days.
 */
import { describe, expect, it } from 'vitest';
import { type GrowthDay, runColonyGrowth } from '../../src/sim/experiments';

const FAST = { eggDays: 2, pupaDays: 1.75 };
const WORKERS = 30;
const grow = (seed: number, protein: boolean): GrowthDay[] =>
  runColonyGrowth({ seed, ants: WORKERS, days: 20, protein, params: FAST });

describe('colony growth', () => {
  // One colony per test, each with its own time limit: a colony takes about 3 minutes.
  it.each([1, 2, 3])(
    'a colony fed sugar and insects raises new workers (seed %i)',
    (seed) => {
      expect(grow(seed, true).at(-1)!.workers).toBeGreaterThan(WORKERS);
    },
    900_000,
  );

  it(
    'without protein the larvae never grow: no pupae, no new workers',
    () => {
      const days = grow(1, false);
      expect(Math.max(...days.map((d) => d.larvae))).toBeGreaterThan(0);
      for (const d of days) {
        expect(d.pupae).toBe(0);
        expect(d.workers).toBe(WORKERS);
      }
    },
    900_000,
  );
});
