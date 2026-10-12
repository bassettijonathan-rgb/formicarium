import { describe, expect, it } from 'vitest';
import { AntState } from '../src/sim/ants';
import { BroodStage, addBrood, createBrood, stepBrood } from '../src/sim/brood';
import { MAT_WIDTH, speedAt, temperatureAt, updateTemperature } from '../src/sim/heat';
import { DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { createWorld, setHeatMat, step, type World } from '../src/sim/world';

/** Lets heat flow in `w`'s farm for `hours` without moving any ants. */
function warm(w: World, hours: number): void {
  for (let t = 0; t < hours * 3600; t += 2) updateTemperature(w.farm, w.heatMat, w.params, 2);
}

describe('warmth (M5a)', () => {
  it('a farm without the mat stays at room temperature, exactly', () => {
    const w = createWorld(1, { ants: 0, params: { roomTemperature: 22 } });
    warm(w, 1);
    expect(temperatureAt(w.farm, 37.3, 151.9)).toBe(22);
    expect(Math.min(...w.farm.temperature)).toBe(22);
    expect(Math.max(...w.farm.temperature)).toBe(22);
  });

  it('the mat warms the soil over it, a few cm up, and not the far side of the farm', () => {
    const w = createWorld(1, { ants: 0, params: { roomTemperature: 22 } });
    setHeatMat(w, 110);
    warm(w, 2);
    const { farm, params } = w;
    const mid = 110 + MAT_WIDTH / 2;
    expect(temperatureAt(farm, mid, farm.height - 1)).toBeCloseTo(params.matTemperature, 0);
    expect(temperatureAt(farm, mid, farm.height - 15)).toBeGreaterThan(26);
    expect(temperatureAt(farm, mid, farm.height - 100)).toBeLessThan(23);
    expect(temperatureAt(farm, 10, farm.height - 5)).toBeLessThan(22.5);
  });

  it('taken away, the mat leaves the farm to cool back to the room', () => {
    const w = createWorld(1, { ants: 0, params: { roomTemperature: 22 } });
    setHeatMat(w, 0);
    warm(w, 2);
    setHeatMat(w, null);
    warm(w, 4);
    expect(Math.max(...w.farm.temperature)).toBeLessThan(22.2);
  });

  it('the keeper cannot put the mat past the end of the farm', () => {
    const w = createWorld(1, { ants: 0 });
    setHeatMat(w, 1000);
    expect(w.heatMat!.x + w.heatMat!.width).toBe(w.farm.width);
    setHeatMat(w, -50);
    expect(w.heatMat!.x).toBe(0);
  });

  it('with heat flow off, temperatures stay as set', () => {
    const w = createWorld(1, { ants: 0, params: { heatFlow: false } });
    w.farm.temperature[0] = 40;
    setHeatMat(w, 0);
    warm(w, 1);
    expect(w.farm.temperature[0]).toBe(40);
    expect(w.farm.temperature[w.farm.temperature.length - 1]).toBe(w.params.roomTemperature);
  });

  it('ants walk twice as fast 15 °C warmer (Hurlbert et al. 2008)', () => {
    const p = DEFAULT_ANT_PARAMS;
    expect(speedAt(p, 25)).toBe(p.speed);
    expect(speedAt(p, 40)).toBeCloseTo(2 * p.speed, 10);
    expect(speedAt(p, 10)).toBeCloseTo(p.speed / 2, 10);
    // In the farm, at 37 °C, a worker covers about 1.74 times the ground it covers at 25 °C.
    const walked = (celsius: number) => {
      const w = createWorld(3, { ants: 10, params: { restRate: 0, digRate: 0, forageRate: 0 } });
      w.farm.temperature.fill(celsius);
      for (let s = 0; s < 10 * STEPS_PER_SECOND; s++) step(w);
      return w.ants.walked.reduce((a, b) => a + b, 0);
    };
    expect(walked(37) / walked(25)).toBeGreaterThan(1.55);
    expect(walked(37) / walked(25)).toBeLessThan(1.9);
  });

  it('brood develops at the temperature where it lies', () => {
    const w = createWorld(1, { ants: 0 });
    const { farm, params } = w;
    // 38 °C is twice as far above the development zero (12 °C) as 25 °C: twice the speed.
    const hot = 38;
    for (let fx = 0; fx < farm.fieldWidth / 2; fx++) {
      for (let fy = 0; fy < farm.fieldHeight; fy++) farm.temperature[fy * farm.fieldWidth + fx] = hot;
    }
    const b = createBrood();
    addBrood(b, BroodStage.egg, 20, 100);
    addBrood(b, BroodStage.egg, farm.width - 20, 100);
    stepBrood(b, farm, params, params.daySeconds);
    expect(b.progress[0]).toBeCloseTo(2 * b.progress[1]!, 10);
  });

  it('a nurse carrying brood where it is too cold turns towards the warm side', () => {
    let warmer = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(seed, { ants: 1, params: { heatFlow: false, broodCarryMax: 1e6, broodDropRate: 0 } });
      const { ants, brood, farm } = w;
      // Warmer to the right: 16 °C at x = 0 up to 34 °C at the far end.
      for (let fy = 0; fy < farm.fieldHeight; fy++) {
        for (let fx = 0; fx < farm.fieldWidth; fx++) farm.temperature[fy * farm.fieldWidth + fx] = 16 + (18 * fx) / farm.fieldWidth;
      }
      // An open chamber across the middle of the farm, and a nurse holding a larva in it, facing up.
      for (let y = 140; y < 150; y++) for (let x = 60; x < 240; x++) farm.material[y * farm.width + x] = 0;
      const k = addBrood(brood, BroodStage.larva, 150, 145);
      brood.carried[k] = 1;
      ants.x[0] = 150;
      ants.y[0] = 145;
      ants.heading[0] = -Math.PI / 2;
      ants.state[0] = AntState.carryingBrood;
      ants.broodHeld[0] = k;
      for (let s = 0; s < 4 * STEPS_PER_SECOND; s++) step(w);
      if (ants.x[0]! > 150) warmer++;
    }
    expect(warmer).toBeGreaterThanOrEqual(16);
  });
});
