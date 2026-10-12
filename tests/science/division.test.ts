/**
 * Division of labour (DESIGN.md section 9, test 9). A queen, 60 workers and
 * their brood are fed sugar and an insect every tank day. Foragers grow lean
 * and lean workers forage: the busiest foragers end up with almost no fat
 * while the workers that stay in keep theirs (Blanchard et al. 2000). Then
 * the keeper takes out the busiest fifth of the foragers. Other workers take
 * up the foraging, grow lean in their turn, and the colony goes on feeding
 * itself, as colonies do when foragers are removed (Robinson et al. 2009).
 */
import { describe, expect, it } from 'vitest';
import { type DivisionResult, runDivision } from '../../src/sim/experiments';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const SEEDS = [1, 2, 3];

/** The workers left after the removal, busiest first, split into the new busiest fifth and the rest. */
function after(r: DivisionResult): { top: number[]; rest: number[] } {
  const removed = new Set(r.removed);
  const kept = r.tripsBefore.map((_, n) => n).filter((n) => !removed.has(n));
  const busiest = [...kept].sort((a, b) => r.tripsAfter[b]! - r.tripsAfter[a]! || a - b);
  return { top: busiest.slice(0, r.removed.length), rest: busiest.slice(r.removed.length) };
}

describe('division of labour', () => {
  let runs: DivisionResult[];

  it(
    'the busiest foragers are lean, the rest are not (each colony)',
    () => {
      runs = SEEDS.map((seed) => runDivision({ seed, days: 4, afterDays: 6, removeShare: 0.2 }));
      for (const r of runs) {
        const removed = new Set(r.removed);
        const kept = r.tripsBefore.map((_, n) => n).filter((n) => !removed.has(n));
        expect(mean(r.removed.map((n) => r.fatBefore[n]!))).toBeLessThan(0.5 * mean(kept.map((n) => r.fatBefore[n]!)));
      }
    },
    2_700_000,
  );

  // What happens after the removal varies a lot from colony to colony (over seeds 1-6 the new busiest fifth
  // had 0.12-0.69 of the others' fat, and crops at the end were 0.36-1.7 of what they were), so these two
  // are asked of the three colonies on average (DESIGN.md 9.5).
  it('when the busiest are taken out, others take over and grow lean in their turn', () => {
    const lean = runs.map((r) => {
      const { top, rest } = after(r);
      return mean(top.map((n) => r.fatAfter[n]!)) / mean(rest.map((n) => r.fatAfter[n]!));
    });
    expect(mean(lean)).toBeLessThan(0.6);
  });

  it('and the colony still feeds itself', () => {
    // Crops over the last two days against the two days before the removal.
    const kept = runs.map((r) => mean(r.cropsByDay.slice(-2)) / mean(r.cropsByDay.slice(2, 4)));
    expect(mean(kept)).toBeGreaterThan(0.4);
  });
});
