/**
 * Brood in a temperature gradient (DESIGN.md section 9, test 10). Nurses
 * carry brood to where it is as warm as they keep it (Roces & Núñez 1989
 * found Camponotus mus nurses moving brood to 27.5-30.8 °C in a gradient).
 * Brood strewn through a chamber held at 16 °C at one end and 32 °C at the
 * other ends up round 28 °C; the control, nurses that ignore temperature,
 * piles it wherever the piles happen to form.
 */
import { describe, expect, it } from 'vitest';
import { runBroodWarmth } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];

describe('brood thermotaxis', () => {
  it.each(SEEDS)(
    'nurses carry the brood to the warmth they keep it at (seed %i)',
    (seed) => {
      const r = runBroodWarmth({ seed, hours: 2 });
      expect(r.nearByHour.at(-1)).toBeGreaterThan(0.8);
      expect(Math.abs(r.meanByHour.at(-1)! - 28)).toBeLessThan(1);
    },
    600_000,
  );

  it(
    'nurses that ignore temperature (the control) leave most brood too cold or too warm',
    () => {
      const near = SEEDS.map((seed) => runBroodWarmth({ seed, hours: 2, params: { thermotaxis: false } }).nearByHour.at(-1)!);
      expect(near.reduce((a, b) => a + b, 0) / near.length).toBeLessThan(0.3);
    },
    900_000,
  );
});
