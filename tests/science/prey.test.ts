/**
 * Prey size and recruitment (DESIGN.md section 9, Arena 3).
 *
 * Detrain & Deneubourg (1997) gave starved Pheidole pallidula colonies fruit
 * flies, which one worker can carry, or a cockroach, which none can: flies
 * were carried home one by one with weak recruitment and little trail, the
 * cockroach drew strong trail laying and a crowd that cut it up where it lay
 * (and netted flies, as unmovable as the cockroach, drew the same crowd, so
 * it is whether a worker can take the prey home, not its size). Traniello
 * (1983) found the same scaling of recruitment to prey weight in Lasius
 * neoniger. Here a hungry lab colony of 40 finds one fruit fly, or one
 * cricket, 10 cm from its entrance in the keeper's bare 40 x 30 cm arena.
 */
import { describe, expect, it } from 'vitest';
import { runPrey } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];

describe('prey size and recruitment', () => {
  it(
    'a fruit fly goes home with one forager and no trail; a cricket draws a trail and a crowd that cut it up',
    () => {
      for (const seed of SEEDS) {
        const fly = runPrey({ seed, insect: 'fly', cut: 'whole', minutes: 30 });
        const cricket = runPrey({ seed, insect: 'cricket', cut: 'whole', minutes: 120 });
        expect(fly.found).toBeGreaterThan(0);
        expect(fly.workers).toBe(1);
        expect(fly.carried).toBe(1);
        expect(fly.trail).toBe(0);
        expect(cricket.mostAtOnce).toBeGreaterThanOrEqual(15);
        expect(cricket.workers).toBeGreaterThanOrEqual(25);
        expect(cricket.trail).toBeGreaterThan(1000);
        // Its legs cut off and carried home; the rest drunk where it lies.
        expect(cricket.carried).toBe(6);
        expect(cricket.taken).toBeGreaterThan(0.99);
      }
    },
    900_000,
  );
});
