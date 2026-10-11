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

function check(r: DivisionResult): void {
  const removed = new Set(r.removed);
  const workers = r.tripsBefore.map((_, n) => n);
  const kept = workers.filter((n) => !removed.has(n));
  // Before: the busiest foragers are lean, the rest are not.
  expect(mean(r.removed.map((n) => r.fatBefore[n]!))).toBeLessThan(0.5 * mean(kept.map((n) => r.fatBefore[n]!)));
  // After: the new busiest fifth (of those left) are lean in their turn...
  const busiest = [...kept].sort((a, b) => r.tripsAfter[b]! - r.tripsAfter[a]! || a - b);
  const top = busiest.slice(0, r.removed.length);
  const rest = busiest.slice(r.removed.length);
  expect(mean(top.map((n) => r.fatAfter[n]!))).toBeLessThan(0.6 * mean(rest.map((n) => r.fatAfter[n]!)));
  // ...and the colony still feeds itself: crops over the last two days at least 40% of what they were.
  const before = mean(r.cropsByDay.slice(2, 4));
  const after = mean(r.cropsByDay.slice(-2));
  expect(after).toBeGreaterThan(0.4 * before);
}

describe('division of labour', () => {
  // One colony per test: each takes a few minutes.
  it.each([1, 2, 3])(
    'foragers grow lean, and when the busiest are taken out others take over (seed %i)',
    (seed) => check(runDivision({ seed, days: 4, afterDays: 6, removeShare: 0.2 })),
    900_000,
  );
});
