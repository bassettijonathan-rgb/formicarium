import { describe, expect, it } from 'vitest';
import { AntState } from '../src/sim/ants';
import { BroodStage, addBrood, createBrood, stepBrood } from '../src/sim/brood';
import { type Farm, updateFresh } from '../src/sim/farm';
import { Material } from '../src/sim/materials';
import { type AntParams, DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { Purpose, Rng } from '../src/sim/rng';
import { stepSoil } from '../src/sim/soil';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { POUR_WIDTH, humidityAt, pourWater, updateHumidity, updateWater } from '../src/sim/water';
import { createWorld, step, water } from '../src/sim/world';

const WET: Partial<AntParams> = { waterFlow: true };

/** Lets water move in `farm` for `days` tank days, as the world does: every 10 s of ant time. */
function soak(farm: Farm, params: AntParams, days: number, rng?: Rng): void {
  for (let t = 0; t < days * params.daySeconds; t += 10) {
    updateWater(farm, params, 10);
    if (rng) for (let s = 0; s < 10 && farm.falling.length > 0; s++) stepSoil(farm, rng);
  }
}

/** Mean water (fraction of saturation) of the soil from `d0` to `d1` mm below the surface, over the whole farm. */
function band(farm: Farm, d0: number, d1: number): number {
  let sum = 0;
  let n = 0;
  for (let x = 0; x < farm.width; x++) {
    for (let y = farm.surface[x]! + d0; y < Math.min(farm.height, farm.surface[x]! + d1); y++) {
      const i = y * farm.width + x;
      if (farm.material[i] === Material.air) continue;
      sum += farm.moisture[i]!;
      n++;
    }
  }
  return sum / n / 255;
}

function totalWater(farm: Farm): number {
  let sum = 0;
  for (let i = 0; i < farm.material.length; i++) if (farm.material[i] !== Material.air) sum += farm.moisture[i]! + farm.moistureRest[i]!;
  return sum;
}

function airCells(farm: Farm, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (farm.material[y * farm.width + x] === Material.air) n++;
  return n;
}

describe('water (M5b)', () => {
  it('with water flow off, the soil stays as poured and its air saturated', () => {
    const w = createWorld(1, { ants: 0 });
    const before = w.farm.moisture.slice();
    soak(w.farm, w.params, 1);
    expect(w.farm.moisture).toEqual(before);
    expect(Math.min(...w.farm.humidity)).toBe(1);
  }, 300_000);

  it('seepage moves water without making or losing any', () => {
    const w = createWorld(1, { ants: 0, params: { ...WET, evaporation: 0 } });
    const before = totalWater(w.farm);
    soak(w.farm, w.params, 2);
    expect(totalWater(w.farm)).toBeCloseTo(before, 0);
  }, 300_000);

  it('the drained soil the farm is poured with stays much as it is', () => {
    const w = createWorld(1, { ants: 0, params: { ...WET, evaporation: 0 } });
    const top = band(w.farm, 0, 10);
    const deep = band(w.farm, 80, 200);
    soak(w.farm, w.params, 3);
    expect(Math.abs(band(w.farm, 0, 10) - top)).toBeLessThan(0.03);
    expect(Math.abs(band(w.farm, 80, 200) - deep)).toBeLessThan(0.03);
  }, 300_000);

  it('an unwatered farm dries from the top: the surface first, the depths hardly', () => {
    const w = createWorld(1, { ants: 0, params: WET });
    const top = band(w.farm, 0, 2);
    const deep = band(w.farm, 80, 200);
    soak(w.farm, w.params, 4);
    expect(band(w.farm, 0, 2)).toBeLessThan(top / 3);
    expect(band(w.farm, 80, 200)).toBeGreaterThan(0.97 * deep);
  }, 300_000);

  it('warm soil dries faster', () => {
    const cool = createWorld(1, { ants: 0, params: WET });
    const warm = createWorld(1, { ants: 0, params: WET });
    warm.farm.temperature.fill(35);
    soak(cool.farm, cool.params, 1);
    soak(warm.farm, warm.params, 1);
    expect(band(warm.farm, 0, 10)).toBeLessThan(band(cool.farm, 0, 10) - 0.02);
  }, 300_000);

  it('the air is damp in the soil and over damp soil, and the headspace dries as the surface dries', () => {
    const w = createWorld(1, { ants: 0, params: WET });
    const { farm, params } = w;
    const x = 150;
    const above = farm.surface[x]! - 1;
    // The headspace lies between the damp surface (saturated pores) and the room, as far as the vents let it mix.
    const damp = 1 + (params.roomHumidity - 1) * params.ventilation;
    expect(humidityAt(farm, x, 2)).toBeCloseTo(damp, 5);
    expect(humidityAt(farm, x, above)).toBeGreaterThan(damp - 0.01);
    // Deep in the soil the pores are saturated.
    expect(humidityAt(farm, x, 150)).toBe(1);
    soak(farm, params, 6);
    expect(humidityAt(farm, x, 2)).toBeLessThan(damp - 0.1);
    expect(humidityAt(farm, x, above)).toBeLessThan(damp - 0.1);
    expect(humidityAt(farm, x, 150)).toBe(1);
  }, 300_000);

  it('a sand ceiling that dries out caves in; kept damp, it holds', () => {
    const fallen: number[] = [];
    for (const evaporation of [DEFAULT_ANT_PARAMS.evaporation, 0]) {
      const w = createWorld(1, { ants: 0, params: { ...WET, evaporation } });
      const { farm, params } = w;
      // Damp sand from the surface down, with a chamber 6 mm wide (dry sand spans 2.5 mm, damp 10)
      // reached from the headspace by a shaft, so fresh air gets in.
      const top = Math.max(...farm.surface);
      for (let y = top - 6; y < 120; y++) {
        for (let x = 100; x < 200; x++) {
          const i = y * farm.width + x;
          farm.material[i] = Material.sand;
          farm.moisture[i] = Math.round(0.4 * 255);
          farm.loose[i] = 0;
        }
      }
      for (let x = 100; x < 200; x++) for (let y = 0; y < top - 6; y++) farm.material[y * farm.width + x] = Material.air;
      const y0 = top + 4;
      for (let y = y0; y < y0 + 4; y++) for (let x = 146; x < 152; x++) farm.material[y * farm.width + x] = Material.air;
      for (let y = top - 6; y < y0; y++) for (let x = 150; x < 152; x++) farm.material[y * farm.width + x] = Material.air;
      updateFresh(farm);
      const open = airCells(farm, 146, y0, 152, y0 + 4);
      soak(farm, params, 4, new Rng(1, Purpose.test));
      fallen.push(open - airCells(farm, 146, y0, 152, y0 + 4));
    }
    expect(fallen[0]).toBeGreaterThan(0);
    expect(fallen[1]).toBe(0);
  }, 300_000);

  it('a pour wets the soil below it, from the top, up to field capacity, deepest under the pour', () => {
    const w = createWorld(1, { ants: 0, params: { ...WET, evaporation: 0 } });
    const { farm, params } = w;
    for (let i = 0; i < farm.material.length; i++) if (farm.material[i] !== Material.air) farm.moisture[i] = 20;
    const before = farm.moisture.slice();
    const taken = water(w, 150);
    expect(taken).toBeCloseTo(params.pourVolume, 0);
    /** How deep the soil in column x was wetted, mm. */
    const wetted = (x: number) => {
      let n = 0;
      for (let y = farm.surface[x]!; y < farm.height; y++) if (farm.moisture[y * farm.width + x]! > 20) n++;
      return n;
    };
    const x = 150;
    const top = farm.surface[x]!;
    expect(farm.moisture[top * farm.width + x]! / 255).toBeCloseTo(params.fieldCapacity, 2);
    expect(farm.moisture[(top + 10) * farm.width + x]! / 255).toBeCloseTo(params.fieldCapacity, 2);
    expect(wetted(x)).toBeGreaterThan(30);
    expect(wetted(x + 12)).toBeLessThan(wetted(x) / 2);
    expect(wetted(x + 12)).toBeGreaterThan(0);
    // Columns outside the strip are untouched.
    for (let y = 0; y < farm.height; y++) {
      for (const cx of [x - POUR_WIDTH / 2 - 1, x + POUR_WIDTH / 2 + 1]) {
        const i = y * farm.width + cx;
        expect(farm.moisture[i]).toBe(before[i]);
      }
    }
  }, 300_000);

  it('pouring on soil already at field capacity takes up nothing', () => {
    const w = createWorld(1, { ants: 0, params: WET });
    const { farm, params } = w;
    for (let i = 0; i < farm.material.length; i++) if (farm.material[i] !== Material.air) farm.moisture[i] = 255;
    expect(pourWater(farm, params, 150)).toBe(0);
  }, 300_000);

  it('brood left in dry air dies in about a tank day; in damp air it lives', () => {
    const w = createWorld(1, { ants: 0, params: { developmentZero: 1e9 } });
    const { farm, params } = w;
    // Dry air on the left half of the farm.
    for (let fy = 0; fy < farm.fieldHeight; fy++) {
      for (let fx = 0; fx < farm.fieldWidth / 2; fx++) farm.humidity[fy * farm.fieldWidth + fx] = 0.5;
    }
    const b = createBrood();
    addBrood(b, BroodStage.egg, 20, 150);
    addBrood(b, BroodStage.larva, farm.width - 20, 150);
    const carried = addBrood(b, BroodStage.pupa, 30, 150);
    b.carried[carried] = 1;
    const tick = 2;
    for (let t = 0; t < 0.9 * params.broodDryDays * params.daySeconds; t += tick) stepBrood(b, farm, params, tick);
    expect(b.stage[0]).toBe(BroodStage.egg);
    for (let t = 0; t < 0.2 * params.broodDryDays * params.daySeconds; t += tick) stepBrood(b, farm, params, tick);
    expect(b.stage[0]).toBe(BroodStage.none);
    expect(b.stage[1]).toBe(BroodStage.larva);
    // Brood in a nurse's mandibles is not lost under her; it dies once put down.
    expect(b.stage[carried]).toBe(BroodStage.pupa);
    expect(b.dried).toBe(1);
  }, 300_000);

  it('a nurse carrying brood where the air is dry turns towards the damp side', () => {
    let damper = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(seed, { ants: 1, params: { broodCarryMax: 1e6, broodDropRate: 0 } });
      const { ants, brood, farm } = w;
      // Damper to the right: 20% at x = 0 up to 100% at the far end.
      for (let fy = 0; fy < farm.fieldHeight; fy++) {
        for (let fx = 0; fx < farm.fieldWidth; fx++) farm.humidity[fy * farm.fieldWidth + fx] = 0.2 + (0.8 * fx) / farm.fieldWidth;
      }
      for (let y = 140; y < 150; y++) for (let x = 60; x < 240; x++) farm.material[y * farm.width + x] = 0;
      const k = addBrood(brood, BroodStage.larva, 150, 145);
      brood.carried[k] = 1;
      ants.x[0] = 150;
      ants.y[0] = 145;
      ants.heading[0] = -Math.PI / 2;
      ants.state[0] = AntState.carryingBrood;
      ants.broodHeld[0] = k;
      for (let s = 0; s < 4 * STEPS_PER_SECOND; s++) step(w);
      if (ants.x[0]! > 150) damper++;
    }
    expect(damper).toBeGreaterThanOrEqual(16);
  }, 300_000);

  it('humidity is recomputed from the soil when the farm is set up with water flow on', () => {
    const w = createWorld(1, { ants: 0, params: WET });
    const copy = w.farm.humidity.slice();
    updateHumidity(w.farm, w.params);
    expect(w.farm.humidity).toEqual(copy);
    expect(Math.min(...w.farm.humidity)).toBeLessThan(1);
  }, 300_000);
});
