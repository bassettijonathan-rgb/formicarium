/**
 * Catching live prey (DESIGN.md section 9, tests 32-34; the live-insects
 * plan's checks 2-5). Richard, Fabre & Dejean (2001): capture by contact, failing more
 * often the bigger the prey; Dejean et al. (2007): big prey held still by
 * several workers pulling its legs. Qualitative: no numbers were measured on
 * these species with these insects.
 */
import { describe, expect, it } from 'vitest';
import { runCastes, runLiveCapture, runLoneGrip } from '../../src/sim/experiments';

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
    'in a busy foraging arena a fly dies within seconds, a cricket only held by four or more, a mealworm by six or more; both break free often first',
    () => {
      // Size alone, without the alarm scent that calls help (test 33): the crowd is what brings several ants.
      const busy = { ants: 200, minutes: 10, params: { leaveRate: 1 / 60, liveCall: false } };
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

  it(
    'a worker holding a cricket calls help: the next ant comes several times sooner than the first found it, and without the call crickets get away',
    () => {
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      const runs = (call: boolean) => [1, 2, 3, 4].map((seed) => runLiveCapture({ seed, insect: 'cricket', ants: 60, minutes: 15, params: { liveCall: call } }));
      const on = runs(true);
      const off = runs(false);
      // Help comes fast (Dejean et al. 2007: 7 s for the second worker, 36 s for the first).
      const found = median(on.map((r) => r.grabbed));
      const help = on.flatMap((r) => r.helpTimes);
      expect(help.length).toBeGreaterThan(4);
      expect(median(help)).toBeLessThan(found / 3);
      // Help matters: more grabs get help, more crickets are caught, fewer get away.
      const share = (rs: typeof on) => rs.reduce((n, r) => n + r.helpTimes.length, 0) / rs.reduce((n, r) => n + r.episodes, 0);
      expect(share(on)).toBeGreaterThan(3 * share(off));
      expect(on.filter((r) => r.killed > 0).length).toBeGreaterThanOrEqual(3);
      expect(off.filter((r) => r.killed > 0).length).toBeLessThan(on.filter((r) => r.killed > 0).length);
      expect(off.reduce((n, r) => n + r.escapes, 0)).toBeGreaterThan(on.reduce((n, r) => n + r.escapes, 0));
    },
    1_800_000,
  );

  it(
    'Pheidole majors come to a live cricket, not to a live fruit fly',
    () => {
      for (const seed of [1, 2]) {
        const cricket = runCastes({ seed, food: 'cricket', live: true, minutes: 30 });
        const fly = runCastes({ seed, food: 'fly', live: true, minutes: 30 });
        expect(cricket.majors).toBeGreaterThanOrEqual(3);
        expect(fly.majors).toBe(0);
        expect(fly.minors).toBeGreaterThan(0);
      }
    },
    1_800_000,
  );
});
