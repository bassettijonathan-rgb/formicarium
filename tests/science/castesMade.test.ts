/**
 * Pheidole pallidula's castes made and called out (DESIGN.md section 9,
 * tests 29-31; the Pheidole plan's tests 2, 3 and 6).
 *
 * Wheeler & Nijhout (1984), in Pheidole bicarinata: a larva becomes a
 * soldier when it is well fed at the end of its growth, and adult soldiers
 * hold it back. Field colonies of P. pallidula hold 10-12% majors (Sempo &
 * Detrain 2010; Passera 1977). Detrain & Pasteels (1992): a disturbance
 * draws majors in greater numbers than food does.
 */
import { describe, expect, it } from 'vitest';
import { runCasteMaking, runDefence } from '../../src/sim/experiments';

describe('Pheidole castes made by feeding, and called out in defence', () => {
  it(
    'larvae fed plenty of protein make 5-20% majors where one worker in ten is a major; fed little, fewer; with no majors, more',
    () => {
      const rich = runCasteMaking({ seed: 1, protein: 3 });
      const poor = runCasteMaking({ seed: 1, protein: 0.4 });
      const none = runCasteMaking({ seed: 1, protein: 3, majors: 0 });
      // A few larvae the nurses never reach well enough are still growing when the run ends.
      for (const r of [rich, poor, none]) expect(r.pupated).toBeGreaterThanOrEqual(24);
      expect(rich.fed).toBeGreaterThan(0.9);
      expect(poor.fed).toBeLessThan(0.85);
      expect(rich.expectedShare).toBeGreaterThan(0.05);
      expect(rich.expectedShare).toBeLessThan(0.2);
      expect(rich.majors).toBeGreaterThan(0);
      expect(poor.expectedShare).toBeLessThan(0.6 * rich.expectedShare);
      // Majors made where missing (Wheeler & Nijhout 1984).
      expect(none.majorsNear).toBeLessThan(0.05); // only the majors made during the run
      expect(none.expectedShare).toBeGreaterThan(1.4 * rich.expectedShare);
      expect(none.majors).toBeGreaterThan(rich.majors);
    },
    900_000,
  );

  it(
    'four minutes after the nest is uncovered, majors are alarmed far beyond their share; with the same alarm as minors, none are',
    () => {
      for (const seed of [1, 2]) {
        const caste = runDefence({ seed });
        const same = runDefence({ seed, params: { majorAlarm: 0, majorAlarmHalfLife: 45 } });
        const last = caste.atSeconds.length - 1;
        // The whole colony takes alarm at first, majors in their share.
        expect(caste.alarmed[0]).toBeGreaterThan(0.8 * caste.workers);
        expect(caste.alarmedMajors[0]).toBe(caste.majors);
        expect(same.alarmedMajors[0]! / same.alarmed[0]!).toBeLessThan(0.12);
        // Four minutes on, the majors are still out and alarmed, and many minors have calmed.
        expect(caste.alarmedMajors[last]).toBe(caste.majors);
        expect(caste.alarmedMajors[last]! / caste.alarmed[last]!).toBeGreaterThan(0.12);
        expect(same.alarmedMajors[last]).toBe(0);
      }
    },
    900_000,
  );
});
