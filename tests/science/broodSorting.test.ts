/**
 * Brood sorting (DESIGN.md section 9, test 5). Eggs, larvae and pupae
 * scattered through a closed chamber with 30 workers end up in piles of
 * their own stage (Franks & Sendova-Franks 1992), from each worker picking up
 * brood that lies among few of its kind and putting it down among many
 * (Deneubourg et al. 1991). The control piles brood without regard to stage,
 * as M3b did: the piles stay mixed.
 */
import { describe, expect, it } from 'vitest';
import { runBroodSorting } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];

describe('brood sorting', () => {
  it.each(SEEDS)(
    'the stages end up apart (seed %i)',
    (seed) => {
      const r = runBroodSorting({ seed, hours: 3 });
      // Each item's three nearest neighbours: at random a third are of its stage.
      expect(r.sameAfter).toBeGreaterThan(0.55);
    },
    600_000,
  );

  it(
    'piling that ignores stages (the control) leaves them mixed',
    () => {
      const same = SEEDS.map(
        (seed) => runBroodSorting({ seed, hours: 3, params: { broodOtherWeight: 1, broodSortRadius: 5 } }).sameAfter,
      );
      expect(same.reduce((a, b) => a + b, 0) / same.length).toBeLessThan(0.45);
    },
    900_000,
  );
});
