/**
 * Catching live prey (DESIGN.md section 9, test 32; the live-insects plan's
 * check 2). Richard, Fabre & Dejean (2001): capture by contact, failing more
 * often the bigger the prey; Dejean et al. (2007): big prey held still by
 * several workers pulling its legs. Qualitative: no numbers were measured on
 * these species with these insects.
 */
import { describe, expect, it } from 'vitest';
import { runLiveCapture, runLoneGrip } from '../../src/sim/experiments';

describe('live insects caught by size', () => {
  it('one ant alone catches most fruit flies it grabs, but never holds a cricket or a mealworm; the mealworm breaks free soonest', () => {
    const fly = runLoneGrip({ seed: 1, insect: 'fly', tries: 40 });
    const cricket = runLoneGrip({ seed: 1, insect: 'cricket', tries: 40 });
    const mealworm = runLoneGrip({ seed: 1, insect: 'mealworm', tries: 40 });
    expect(fly.killed).toBeGreaterThanOrEqual(30);
    expect(fly.escaped).toBeGreaterThan(0);
    expect(fly.held).toBeLessThan(10);
    expect([cricket.escaped, mealworm.escaped]).toEqual([40, 40]);
    expect(mealworm.held).toBeLessThan(cricket.held);
  });

  it(
    'in a busy foraging arena a fly dies in the grip of one or two ants, a cricket only held by four or more, a mealworm by six or more; both break free often first',
    () => {
      const busy = { ants: 200, minutes: 10, params: { leaveRate: 1 / 60 } };
      let flyEscapes = 0;
      let flyGrabs = 0;
      for (const seed of [1, 2, 3]) {
        const fly = runLiveCapture({ seed, insect: 'fly', ...busy });
        expect(fly.killed).toBeGreaterThan(0);
        expect(fly.killed - fly.grabbed).toBeLessThan(10);
        expect(fly.holdersAtDeath).toBeLessThanOrEqual(2);
        flyEscapes += fly.escapes;
        flyGrabs += fly.grabs;
      }
      for (const [insect, pinned] of [
        ['cricket', 4],
        ['mealworm', 6],
      ] as const) {
        let escapes = 0;
        let grabs = 0;
        for (const seed of [1, 2, 3]) {
          const r = runLiveCapture({ seed, insect, ...busy });
          expect(r.killed).toBeGreaterThan(0);
          expect(r.holdersAtDeath).toBeGreaterThanOrEqual(pinned);
          escapes += r.escapes;
          grabs += r.grabs;
        }
        // Bigger insects escape more (Richard et al. 2001).
        expect(escapes / grabs).toBeGreaterThan(0.4);
        expect(escapes / grabs).toBeGreaterThan(2 * (flyEscapes / flyGrabs));
      }
    },
    900_000,
  );
});
