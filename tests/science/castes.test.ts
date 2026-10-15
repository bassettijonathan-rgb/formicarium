/**
 * Pheidole pallidula's minors and majors at food (DESIGN.md section 9).
 *
 * Detrain & Pasteels (1991) found that the two castes differ in their
 * thresholds during food recruitment: minors scout and are recruited to any
 * food, majors only by the strong recruitment to large prey. Detrain &
 * Deneubourg (1997): a fly one worker can carry goes home with one forager;
 * prey too big to move draws minors and then majors, which cut it up where
 * it lies (no proportions were given, so these checks are qualitative).
 * Here a hungry lab colony of 100 workers, one in ten a major, finds a drop
 * of sugar water, a fruit fly, a cricket or a mealworm 10 cm from its
 * entrance in the keeper's bare 40 x 30 cm arena.
 */
import { describe, expect, it } from 'vitest';
import { runCastes } from '../../src/sim/experiments';

const SEEDS = [1, 2];

describe('Pheidole minors and majors at food', () => {
  it(
    'a cricket draws majors, a sugar drop or a fruit fly none; without the higher threshold, sugar draws them too',
    () => {
      for (const seed of SEEDS) {
        const sugar = runCastes({ seed, food: 'sugar', minutes: 30 });
        const fly = runCastes({ seed, food: 'fly', minutes: 30 });
        const cricket = runCastes({ seed, food: 'cricket', minutes: 30 });
        const same = runCastes({ seed, food: 'sugar', minutes: 30, params: { majorCall: 0 } });
        expect(sugar.minors).toBeGreaterThan(30);
        expect(sugar.majors).toBe(0);
        expect(fly.minors + fly.majors).toBe(1);
        expect(fly.carriedByMinors).toBe(1);
        expect(cricket.majors).toBeGreaterThanOrEqual(5);
        expect(cricket.majorShare).toBeGreaterThan(0.05);
        // The control: majors answer as minors do, and come to sugar in their share of the colony.
        expect(same.majorShare).toBeGreaterThan(0.05);
      }
    },
    900_000,
  );

  it(
    'majors cut the prey where it lies and the minors carry the pieces home; a hard mealworm goes faster with majors',
    () => {
      for (const seed of SEEDS) {
        const cricket = runCastes({ seed, food: 'cricket', minutes: 30 });
        expect(cricket.legsOff).toBeGreaterThan(0);
        expect(cricket.carriedByMinors).toBe(6);
        expect(cricket.carriedByMajors).toBe(0);
        const withMajors = runCastes({ seed, food: 'mealworm', minutes: 45 });
        const minorsOnly = runCastes({ seed, food: 'mealworm', minutes: 45, majors: 0 });
        expect(withMajors.half).toBeGreaterThan(0);
        expect(minorsOnly.half < 0 || withMajors.half < 0.95 * minorsOnly.half).toBe(true);
      }
    },
    900_000,
  );
});
