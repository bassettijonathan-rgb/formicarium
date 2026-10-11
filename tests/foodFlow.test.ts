import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import type { AntParams } from '../src/sim/params';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { colonyCrop, createWorld, step, type World } from '../src/sim/world';

function run(w: World, seconds: number): void {
  for (let s = 0; s < seconds * STEPS_PER_SECOND; s++) step(w);
}

/** Two ants side by side on the soil surface, one with a full crop and one empty. */
function pair(params: Partial<AntParams> = {}): World {
  const w = createWorld(7, { ants: 2, params: { begRate: 50, ...params } });
  const { ants } = w;
  ants.x[1] = ants.x[0]! + 1;
  ants.y[1] = ants.y[0]!;
  ants.crop[0] = w.params.cropLoad;
  ants.crop[1] = 0;
  return w;
}

describe('food flow in the farm', () => {
  it('burns the sugar in the crop on the life clock', () => {
    const w = createWorld(1, { ants: 1 });
    w.ants.crop[0] = w.params.cropLoad;
    run(w, w.params.daySeconds / 10);
    expect(w.ants.crop[0]).toBeCloseTo(w.params.cropLoad - w.params.burnRate / 10, 6);
  });

  it('a hungry ant begs and a full nestmate feeds it, never past an even share', () => {
    const w = pair({ burnRate: 0 });
    const total = colonyCrop(w);
    let shared = false;
    for (let s = 0; s < 60 * STEPS_PER_SECOND; s++) {
      step(w);
      if (w.ants.state[0] === AntState.sharing) shared = true;
      expect(w.ants.crop[1]!).toBeLessThanOrEqual(w.ants.crop[0]! + 1e-12);
    }
    expect(shared).toBe(true);
    expect(w.ants.crop[1]!).toBeGreaterThan(0.1 * w.params.cropLoad);
    expect(colonyCrop(w)).toBeCloseTo(total, 12);
  });

  it('with sharing switched off (the control), nobody passes food on', () => {
    const w = pair({ burnRate: 0, sharing: false });
    run(w, 60);
    expect(w.ants.crop[1]).toBe(0);
  });

  it('hunger sends foragers out: full ones only scout now and then', () => {
    const outAfter = (crop: number) => {
      const w = createWorld(2, { ants: 20, params: { burnRate: 0 } });
      w.ants.crop.fill(crop);
      w.ants.forageThreshold.fill(w.params.forageThresholdMin);
      let out = 0;
      for (let s = 0; s < 600 * STEPS_PER_SECOND; s++) {
        step(w);
        for (let i = 0; i < w.ants.count; i++) if (w.ants.place[i] !== Place.farm) out |= 1 << i;
      }
      let n = 0;
      for (let i = 0; i < 20; i++) if (out & (1 << i)) n++;
      return n;
    };
    expect(outAfter(0)).toBeGreaterThan(8);
    expect(outAfter(0.2)).toBeLessThan(outAfter(0) / 2);
  }, 60_000);
});
