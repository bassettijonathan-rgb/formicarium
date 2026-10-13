/**
 * Brood in a bought nest (DESIGN.md section 9, test 15). A medium ytong nest
 * is wet at its water end and dry at the tube end; brood strewn through all
 * its chambers ends up in the damp ones. The control, nurses that ignore
 * humidity, leaves it about where it was strewn.
 */
import { describe, expect, it } from 'vitest';
import { runNestDamp } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];

describe('brood in a bought nest', () => {
  it.each(SEEDS)(
    'nurses carry the brood into the damp chambers (seed %i)',
    (seed) => {
      const r = runNestDamp({ seed, hours: 2 });
      expect(r.dampFloor).toBeLessThan(0.8);
      expect(r.dampByHour.at(-1)).toBeGreaterThan(0.9);
    },
    900_000,
  );

  it(
    'nurses that ignore humidity (the control) leave much of it in the dry end',
    () => {
      const damp = SEEDS.map((seed) => runNestDamp({ seed, hours: 2, params: { hygrotaxis: false } }).dampByHour.at(-1)!);
      expect(damp.reduce((a, b) => a + b, 0) / damp.length).toBeLessThan(0.8);
    },
    1_800_000,
  );
});
