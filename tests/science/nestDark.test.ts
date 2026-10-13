/**
 * Darkness (DESIGN.md section 9, test 16). A medium nest, soaked so light is
 * the only difference between its halves, has its cover lifted from the left
 * half; workers and brood are strewn through all its chambers. Most brood is
 * under the cover within an hour, as Temnothorax colonies choose a dark nest
 * over a light one (Franks et al. 2003). Ants that ignore light (the control)
 * leave it about where it was strewn.
 */
import { describe, expect, it } from 'vitest';
import { runNestDark } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];

describe('brood under a lifted cover', () => {
  it.each(SEEDS)(
    'nurses carry the brood into the dark (seed %i)',
    (seed) => {
      const r = runNestDark({ seed, hours: 1 });
      expect(r.darkByHour.at(-1)).toBeGreaterThan(0.8);
      expect(r.restingDarkByHour.at(-1)).toBeGreaterThan(0.8);
    },
    900_000,
  );

  it(
    'ants that ignore light (the control) leave much of it in the light',
    () => {
      const dark = SEEDS.map((seed) => runNestDark({ seed, hours: 1, params: { photophobia: false } }).darkByHour.at(-1)!);
      expect(dark.reduce((a, b) => a + b, 0) / dark.length).toBeLessThan(0.75);
    },
    1_800_000,
  );
});
