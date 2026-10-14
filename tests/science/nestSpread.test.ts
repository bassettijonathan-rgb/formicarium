/**
 * Room to grow, second half (DESIGN.md section 9, test 17; Nests 3). Two
 * small ytong nests joined by an open tube, the colony strewn through the
 * first. A colony with room to spare stays (nearly all) in the first; one
 * too big for it fills it and spills into the second.
 */
import { describe, expect, it } from 'vitest';
import { runNestSpread } from '../../src/sim/experiments';

describe('a colony in two joined nests', () => {
  it(
    'spreads into the second only when the first is full',
    () => {
      const small = runNestSpread({ seed: 1, ants: 150, hours: 3 });
      const big = runNestSpread({ seed: 1, ants: 800, hours: 3 });
      const share = (r: typeof small) => r.secondByHour.at(-1)! / (r.firstByHour.at(-1)! + r.secondByHour.at(-1)!);
      expect(share(small)).toBeLessThan(0.12);
      expect(share(big)).toBeGreaterThan(0.25);
      // The first nest holds no more for the bigger colony than it can.
      expect(big.firstByHour.at(-1)!).toBeLessThan(620);
    },
    1_800_000,
  );
});
