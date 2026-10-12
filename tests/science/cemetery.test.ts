/**
 * Cemetery formation and the midden (DESIGN.md section 9, test 6).
 *
 * Theraulaz et al. (2002) strewed 100 or 200 corpses over a 25 cm arena next
 * to a nest; within about 30 hours the workers had gathered them into 1.73
 * and 2.07 piles on average. Here 100 corpses lie strewn over the 20 cm
 * arena, with a lab nest of 40 workers behind the entrance. The control lets
 * carriers ignore other corpses when picking up and putting down: they still
 * push the dead against the far walls, but no piles form.
 *
 * In the farm, workers that die inside the nest are carried out through the
 * tube once they smell of death, and end up in a pile far out in the arena.
 */
import { describe, expect, it } from 'vitest';
import { runCemetery, runMidden } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];

describe('cemetery formation', () => {
  it(
    'strewn corpses end up in one to three piles within 30 hours',
    () => {
      const piles: number[] = [];
      for (const seed of SEEDS) {
        const r = runCemetery({ seed, hours: 30, corpses: 100 });
        piles.push(r.pilesByHour.at(-1)!);
        expect(r.inPilesByHour.at(-1)).toBeGreaterThan(0.95);
        expect(r.pilesByHour.at(-1)).toBeGreaterThanOrEqual(1);
        expect(r.pilesByHour.at(-1)).toBeLessThanOrEqual(3);
      }
      // Theraulaz et al. found 1.73 piles on average with 100 corpses.
      expect(piles.reduce((a, b) => a + b, 0) / piles.length).toBeLessThan(2.5);
    },
    900_000,
  );

  it(
    'carriers that ignore other corpses (the control) form no piles',
    () => {
      for (const seed of SEEDS) {
        const r = runCemetery({ seed, hours: 12, corpses: 100, params: { corpseClustering: false } });
        expect(r.inPilesByHour.at(-1)).toBeLessThan(0.8);
      }
    },
    900_000,
  );
});

describe('the midden', () => {
  it.each([1, 2])(
    'workers dead in the nest are carried out into the arena, far from the entrance (seed %i)',
    (seed) => {
      const r = runMidden({ seed, settleHours: 3, hours: 3, deaths: 10 });
      // For the first hour (a tank day) the dead do not yet smell of death and stay where they fell.
      expect(r.inFarmByHour[0]).toBeGreaterThanOrEqual(8);
      expect(r.inArenaByHour.at(-1)).toBeGreaterThanOrEqual(8);
      // Corpses strewn at random over the arena would lie about 110 mm from the entrance on average.
      expect(r.arenaDistance).toBeGreaterThan(150);
    },
    900_000,
  );
});
