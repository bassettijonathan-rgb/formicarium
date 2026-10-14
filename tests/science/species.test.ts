/**
 * Crematogaster scutellaris against what was seen of it (DESIGN.md section 9,
 * tests 20-22): its trails fade in about 20 minutes (Gobin & Billen 1994), a
 * disturbed colony takes alarm and calms down again (Pasteels et al. 1989),
 * and its nurses keep brood drier than Lasius niger's.
 */
import { describe, expect, it } from 'vitest';
import { AntState, Caste, DT, Place } from '../../src/sim/ants';
import { depositTrail, sampleTrail } from '../../src/sim/arena';
import { runBroodDamp } from '../../src/sim/experiments';
import { applyCommand, createTank } from '../../src/sim/keeper';
import type { AntParams } from '../../src/sim/params';
import { lightAt } from '../../src/sim/nest';
import { Species, speciesParams } from '../../src/sim/species';
import { STEPS_PER_SECOND } from '../../src/sim/time';
import { createWorld, step, type World } from '../../src/sim/world';

/**
 * The trail one forager lays walking once along a line, and the most an ant
 * walking beside it, parallel and with an antenna over it, smells across its
 * antennae `minutes` later: what decides whether it follows the trail.
 */
function trailAfter(species: number, minutes: number[]): number[] {
  const world = createWorld(1, { species, ants: 0 });
  const p = world.params;
  const y = 50.3;
  for (let x = 20; x < 120; x += p.speed * DT) depositTrail(world.arena, x, y, p.trailDeposit * p.speed * DT);
  const smelt = (): number => {
    let most = 0;
    for (let off = -1.5; off <= 1.5; off += 0.25) {
      const l = sampleTrail(world.arena, 70 + p.antennaReach * Math.cos(p.antennaAngle), y + off - p.antennaReach * Math.sin(p.antennaAngle));
      const r = sampleTrail(world.arena, 70 + p.antennaReach * Math.cos(p.antennaAngle), y + off + p.antennaReach * Math.sin(p.antennaAngle));
      most = Math.max(most, l + r);
    }
    return most;
  };
  const out: number[] = [];
  let t = 0;
  for (const m of minutes) {
    while (t < m * 60 * STEPS_PER_SECOND) {
      step(world);
      t++;
    }
    out.push(smelt());
  }
  return out;
}

/**
 * A colony resting under a covered ytong nest has half the cover lifted
 * off it; returns the workers the light fell on, and, at each of `seconds`
 * after, the workers in the nest that are up and those alarmed.
 */
function liftCover(seed: number, species: number, seconds: number[], params: Partial<AntParams> = {}): { lit: number; counts: { up: number; alarmed: number }[] } {
  const world = createTank(seed, undefined, species);
  Object.assign(world.params, params);
  for (let s = 0; s < 10 * 60 * STEPS_PER_SECOND; s++) step(world);
  const half = world.farm.width / 2;
  const worker = (w: World, i: number) => w.ants.place[i] === Place.farm && w.ants.caste[i] === Caste.worker && w.ants.state[i] !== AntState.dead;
  applyCommand(world, { type: 'cover', from: 0, to: half });
  let lit = 0;
  for (let i = 0; i < world.ants.count; i++) if (worker(world, i) && lightAt(world.farm, world.ants.x[i]!, world.ants.y[i]!) > world.params.lightSense) lit++;
  const count = (w: World) => {
    let up = 0;
    let alarmed = 0;
    for (let i = 0; i < w.ants.count; i++) {
      if (!worker(w, i)) continue;
      if (w.ants.state[i] !== AntState.resting) up++;
      if (w.ants.alarm[i]! > w.params.alarmShow) alarmed++;
    }
    return { up, alarmed };
  };
  const out: { up: number; alarmed: number }[] = [];
  let t = 0;
  for (const s of seconds) {
    while (t < s * STEPS_PER_SECOND) {
      step(world);
      t++;
    }
    out.push(count(world));
  }
  return { lit, counts: out };
}

describe('Crematogaster scutellaris', () => {
  it('test 20: the trail one forager lays is still followed at 15 minutes and no longer at 25 (Gobin & Billen 1994: about 20)', () => {
    const threshold = createWorld(1).params.trailThreshold;
    const [ten, fifteen, twentyFive] = trailAfter(Species.crematogaster, [10, 15, 25]);
    expect(ten).toBeGreaterThan(threshold);
    expect(fifteen).toBeGreaterThan(threshold);
    expect(twentyFive).toBeLessThan(threshold);
    // Lasius niger's lasts about an hour.
    const [lasius45, lasius75] = trailAfter(Species.lasiusNiger, [45, 75]);
    expect(lasius45).toBeGreaterThan(threshold);
    expect(lasius75).toBeLessThan(threshold);
  }, 120_000);

  it.each([1, 2])('test 21: lifting a cover alarms the colony, the alarm spreads into the dark, and it calms down (seed %i)', (seed) => {
    const at = [5, 30, 60, 300];
    const crema = liftCover(seed, Species.crematogaster, at);
    const lasius = liftCover(seed, Species.lasiusNiger, at);
    const [c5, c30, , c300] = crema.counts;
    // Within a minute far more workers are up, and alarmed, than in the same Lasius colony.
    expect(c30!.up).toBeGreaterThan(lasius.counts[1]!.up + 15);
    expect(c30!.alarmed).toBeGreaterThan(15);
    expect(lasius.counts.every((c) => c.alarmed === 0)).toBe(true);
    // The alarm scent carries it to nestmates the light did not fall on.
    expect(c5!.alarmed).toBeGreaterThan(crema.lit);
    // Within five minutes they are calm again.
    expect(c300!.alarmed).toBe(0);
    // Without the scent (no relay), only the workers in the light take alarm.
    const quiet = liftCover(seed, Species.crematogaster, at, { alarmRelay: 0 });
    expect(quiet.counts.every((c) => c.alarmed <= quiet.lit)).toBe(true);
  }, 300_000);

  it('test 22: its nurses keep brood in drier air than Lasius niger nurses', () => {
    for (const seed of [1, 2]) {
      const lasius = runBroodDamp({ seed, hours: 1 });
      const crema = runBroodDamp({ seed, hours: 1, params: speciesParams(Species.crematogaster) });
      expect(crema.meanByHour.at(-1)!).toBeLessThan(lasius.meanByHour.at(-1)! - 0.05);
    }
  }, 900_000);
});
