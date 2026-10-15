/**
 * Messor barbarus against what was seen of it (DESIGN.md section 9, tests
 * 23-25): seeds are stored in the dry, away from the brood (keepers); a
 * clump of seeds is harvested faster than the same seeds scattered (El
 * Boukhrissi et al. 2023); its trails last (Detrain et al. 2000); big
 * workers carry the big seeds (Reyes-López & Fernández-Haeger 2001).
 */
import { describe, expect, it } from 'vitest';
import { runGranary, runHarvest, runSizeMatching, runTrailLife } from '../../src/sim/experiments';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const SEEDS = [1, 2, 3];

describe('Messor barbarus (DESIGN.md 4.4)', () => {
  it('test 23: seeds strewn in the nest end in its dry part, away from the brood; without the liking for dry air they stay strewn', () => {
    for (const seed of SEEDS) {
      const r = runGranary({ seed, minutes: 60 });
      expect(r.stored).toBeGreaterThan(30);
      expect(r.dryShare).toBeGreaterThanOrEqual(0.9);
      expect(r.dryShare).toBeGreaterThan(r.dryAtStart + 0.5);
      expect(r.amongBrood).toBeLessThanOrEqual(0.1);
      expect(r.seedHumidity).toBeLessThan(r.broodHumidity - 0.25);
      const off = runGranary({ seed, minutes: 60, params: { seedDryHumidity: 1.01 } });
      expect(off.dryShare).toBeLessThan(off.dryAtStart + 0.15);
    }
  }, 900_000);

  it('test 24: a pile of seeds is cleared at more seeds a minute than the same seeds scattered, though scattered seeds are found sooner; the trail makes the difference', () => {
    const runs = [1, 2, 3, 4, 5, 6];
    const clumped = runs.map((seed) => runHarvest({ seed, clumped: true, minutes: 120 }));
    const scattered = runs.map((seed) => runHarvest({ seed, clumped: false, minutes: 120 }));
    const untrailed = runs.map((seed) => runHarvest({ seed, clumped: true, minutes: 120, params: { seedTrail: 0 } }));
    for (const r of [...clumped, ...scattered, ...untrailed]) expect(r.taken).toBe(r.seeds);
    // El Boukhrissi et al. 2023: one pile about 2.8 times the rate of scattered seeds, scattered found in 3.5 min against 5.4.
    expect(mean(clumped.map((r) => r.rate))).toBeGreaterThan(1.5 * mean(scattered.map((r) => r.rate)));
    expect(mean(scattered.map((r) => r.found))).toBeLessThan(mean(clumped.map((r) => r.found)));
    expect(mean(untrailed.map((r) => r.rate))).toBeLessThan(mean(clumped.map((r) => r.rate)) / 1.5);
  }, 600_000);

  it('test 25: an hour after the seeds ran out the trail keeps half its strength, and is followed for hours; one fading as fast as Lasius niger\'s keeps a sixteenth', () => {
    for (const seed of SEEDS) {
      const messor = runTrailLife({ seed, after: 60, upTo: 240 });
      expect(messor.cleared).toBeGreaterThan(0);
      expect(messor.smelt / messor.atClearing).toBeGreaterThan(0.4);
      expect(messor.faded).toBe(-1);
      const lasius = runTrailLife({ seed, after: 60, upTo: 240, params: { trailHalfLife: 15 * 60 } });
      expect(lasius.smelt / lasius.atClearing).toBeLessThan(0.1);
      expect(lasius.faded).toBeGreaterThan(0);
    }
  }, 600_000);

  it('test 26: in a colony of all sizes, the workers carrying the heavier seeds are the bigger ones; with every worker a media\'s load, not', () => {
    for (const seed of SEEDS) {
      const r = runSizeMatching({ seed, minutes: 60 });
      expect(r.taken).toBeGreaterThan(0.8 * r.seeds);
      expect(r.r).toBeGreaterThan(0.3);
      expect(r.heavyCarriers).toBeGreaterThan(r.lightCarriers + 1.5);
      expect(r.byClass.minor.mass).toBeLessThan(r.byClass.media.mass);
      expect(r.byClass.media.mass).toBeLessThan(r.byClass.major.mass);
      const flat = runSizeMatching({ seed, minutes: 60, params: { seedSizeExponent: 0 } });
      expect(Math.abs(flat.heavyCarriers - flat.lightCarriers)).toBeLessThan(1);
    }
  }, 600_000);
});
