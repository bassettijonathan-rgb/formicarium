/**
 * Hygiene (DESIGN.md section 9, test 12). Workers carry their dead out of
 * the nest before mould grows on them, which keeps the brood safe; colonies
 * kept from removing corpses fare worse (Myrmica rubra, Diez et al. 2014).
 * Five workers die in the brood pile of a settled colony. With corpse
 * removal no brood is lost to mould; with corpses left in place and nurses
 * that do not carry brood out of mould (the control), most of it dies.
 */
import { describe, expect, it } from 'vitest';
import { runHygiene } from '../../src/sim/experiments';

describe('hygiene', () => {
  it.each([1, 2, 3])(
    'workers carry their dead out and no brood is lost to mould (seed %i)',
    (seed) => {
      const r = runHygiene({ seed, settleHours: 2, days: 4, deaths: 5 });
      expect(r.killedByDay.at(-1)).toBe(0);
      expect(r.corpsesByDay.at(-1)).toBeLessThanOrEqual(3);
      expect(r.mouldByDay.at(-1)).toBeLessThan(200);
    },
    900_000,
  );

  it.each([1, 2])(
    'dead left in the brood pile grow mould that kills most of the brood, when nurses do not move it (seed %i)',
    (seed) => {
      const r = runHygiene({ seed, settleHours: 2, days: 5, deaths: 5, params: { corpsePickRate: 0, mouldSense: 2 } });
      expect(r.mouldByDay.at(-1)).toBeGreaterThan(400);
      expect(r.killedByDay.at(-1)).toBeGreaterThan(r.brood / 2);
    },
    900_000,
  );
});
