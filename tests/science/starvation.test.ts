/**
 * Starvation (DESIGN.md section 9, test 13). When a Lasius niger colony's
 * food stops, its foragers, which are lean, die before its inner-nest
 * workers, which are fat (Dussutour et al. 2016). Fed for 3 tank days, then
 * starved for 6: most foragers are dead, and far fewer nest workers. A colony
 * still fed loses nobody to hunger.
 */
import { describe, expect, it } from 'vitest';
import { Cause } from '../../src/sim/ants';
import { runStarvation } from '../../src/sim/experiments';

/** Share of `group` (indices into the run's workers) dead by `day`. */
function deadBy(diedOn: number[], group: number[], day: number): number {
  return group.filter((n) => diedOn[n]! <= day).length / Math.max(1, group.length);
}

describe('starvation', () => {
  it.each([1, 2])(
    'starved, the lean foragers die first and the fat nest workers last (seed %i)',
    (seed) => {
      const r = runStarvation({ seed, fedDays: 3, days: 6 });
      const order = r.trips.map((_, n) => n).sort((a, b) => r.trips[b]! - r.trips[a]! || a - b);
      const foragers = order.slice(0, Math.round(order.length / 5));
      const nest = order.filter((n) => r.trips[n] === 0);
      expect(nest.length).toBeGreaterThan(10);
      const f = deadBy(r.diedOn, foragers, 6);
      const n = deadBy(r.diedOn, nest, 6);
      expect(f).toBeGreaterThan(0.5);
      expect(n).toBeLessThan(f - 0.3);
      expect(r.cause.filter((c) => c === Cause.drying || c === Cause.heat)).toEqual([]);
    },
    900_000,
  );

  it('a colony fed every day loses nobody to hunger', () => {
    const r = runStarvation({ seed: 1, fedDays: 3, days: 6, fed: true });
    expect(r.cause.filter((c) => c === Cause.hunger)).toEqual([]);
  }, 900_000);
});
