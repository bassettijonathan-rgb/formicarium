/**
 * Brood in a humidity gradient (DESIGN.md section 9, test 11). Nurses carry
 * brood to damp air, as keepers see them do when a nest dries out. Brood
 * strewn through a chamber whose air runs from 60% humidity at one end to
 * saturated at the other ends up in air at least nearly as damp as nurses
 * keep it; the control, nurses that ignore humidity, leaves much of it in the dry.
 */
import { describe, expect, it } from 'vitest';
import { runBroodDamp } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];

describe('brood hygrotaxis', () => {
  it.each(SEEDS)(
    'nurses carry the brood to damp air (seed %i)',
    (seed) => {
      const r = runBroodDamp({ seed, hours: 2 });
      expect(r.dampByHour.at(-1)).toBeGreaterThan(0.9);
      expect(r.meanByHour.at(-1)).toBeGreaterThan(0.9);
    },
    600_000,
  );

  it(
    'nurses that ignore humidity (the control) leave much of the brood in dry air',
    () => {
      const damp = SEEDS.map((seed) => runBroodDamp({ seed, hours: 2, params: { hygrotaxis: false } }).dampByHour.at(-1)!);
      expect(damp.reduce((a, b) => a + b, 0) / damp.length).toBeLessThan(0.6);
    },
    900_000,
  );
});
