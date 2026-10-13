import { describe, expect, it } from 'vitest';
import { AntState, Caste, Place } from '../src/sim/ants';
import { type Farm, FIELD_CELL } from '../src/sim/farm';
import { hashState } from '../src/sim/hash';
import { createTank } from '../src/sim/keeper';
import { Material, diggable } from '../src/sim/materials';
import { NEST_SIZES, type NestLayout, type NestSize } from '../src/sim/nest';
import { DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { SAVE_VERSION, loadWorld } from '../src/sim/save';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { createWorld, setHeatMat, step } from '../src/sim/world';
import { expectDeterministic } from './helpers';

const SIZES: NestSize[] = ['S', 'M', 'L'];
const LAYOUTS: NestLayout[] = ['classic', 'organic', 'honeycomb'];

/** Air cells reachable from the tube's mouth, walking between side neighbours. */
function reachable(farm: Farm): Uint8Array {
  const { width: w, height: h, material } = farm;
  const seen = new Uint8Array(w * h);
  const start = Math.floor(farm.tubeY) * w + Math.floor(farm.tubeX);
  const queue = [start];
  seen[start] = 1;
  while (queue.length > 0) {
    const c = queue.pop()!;
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (seen[n] || material[n] !== Material.air) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

/** Mean humidity of the air in the nest's field cells whose middles lie within [x0, x1) mm across. */
function humidityAcross(farm: Farm, x0: number, x1: number): number {
  let sum = 0;
  let n = 0;
  for (let fy = 0; fy < farm.fieldHeight; fy++) {
    for (let fx = 0; fx < farm.fieldWidth; fx++) {
      const x = (fx + 0.5) * FIELD_CELL;
      const cell = (fy * FIELD_CELL) * farm.width + fx * FIELD_CELL;
      if (x < x0 || x >= x1 || farm.material[cell] !== Material.air) continue;
      sum += farm.humidity[fy * farm.fieldWidth + fx]!;
      n++;
    }
  }
  return sum / n;
}

describe('a bought nest', () => {
  for (const size of SIZES) {
    for (const layout of LAYOUTS) {
      it(`(${size}, ${layout}) is a ytong block with carved chambers, all reachable from the tube`, () => {
        const { farm } = createWorld(3, { bought: { size, layout } });
        expect(farm.width).toBe(NEST_SIZES[size].width);
        expect(farm.height).toBe(NEST_SIZES[size].height);
        expect(farm.nest!.chambers.length).toBeGreaterThanOrEqual(4);
        const seen = reachable(farm);
        let air = 0;
        for (let i = 0; i < farm.material.length; i++) {
          const m = farm.material[i]!;
          expect(m === Material.air || m === Material.ytong).toBe(true);
          if (m !== Material.air) continue;
          air++;
          expect(seen[i], 'every carved cell can be reached from the tube').toBe(1);
        }
        // Chambers take up a good share of the block, as in bought nests.
        expect(air / farm.material.length).toBeGreaterThan(0.15);
        // The tube's mouth is in the right end; the other edges are walls.
        expect(farm.tubeX).toBeGreaterThan(farm.width - 2);
        for (let x = 0; x < farm.width; x++) {
          expect(farm.material[x]).toBe(Material.ytong);
          expect(farm.material[(farm.height - 1) * farm.width + x]).toBe(Material.ytong);
        }
        for (let y = 0; y < farm.height; y++) expect(farm.material[y * farm.width]).toBe(Material.ytong);
      });
    }
  }

  it('differs from tank to tank, and is the same for the same tank', () => {
    const a = createWorld(1, { bought: { size: 'M', layout: 'organic' } }).farm;
    expect(hashState(createWorld(1, { bought: { size: 'M', layout: 'organic' } }).farm.material)).toBe(hashState(a.material));
    expect(hashState(createWorld(2, { bought: { size: 'M', layout: 'organic' } }).farm.material)).not.toBe(hashState(a.material));
  });

  it('has walls the ants cannot dig', () => {
    expect(diggable(Material.ytong)).toBe(false);
    expect(diggable(Material.loam)).toBe(true);
    const world = createTank(4);
    const before = hashState(world.farm.material);
    let carried = 0;
    for (let s = 0; s < 20 * 60 * STEPS_PER_SECOND; s++) {
      step(world);
      if (s % 100 === 0) for (let i = 0; i < world.ants.count; i++) if (world.ants.state[i] === AntState.carrying) carried++;
    }
    expect(hashState(world.farm.material)).toBe(before);
    expect(carried).toBe(0);
  });

  it('is damp at its water end and dry at the far end, and the water stays where it is', () => {
    const world = createTank(5, { size: 'M', layout: 'classic' });
    const { farm } = world;
    expect(humidityAcross(farm, 30, 90)).toBeGreaterThan(0.95);
    expect(humidityAcross(farm, 160, 200)).toBeLessThan(0.75);
    const moisture = hashState(farm.moisture);
    const humidity = hashState(farm.humidity);
    for (let s = 0; s < 5 * 60 * STEPS_PER_SECOND; s++) step(world);
    expect(hashState(farm.moisture)).toBe(moisture);
    expect(hashState(farm.humidity)).toBe(humidity);
  });

  it('lets fresh air in only through the tube', () => {
    const { farm } = createTank(6);
    const mouth = Math.floor(farm.tubeY / FIELD_CELL) * farm.fieldWidth + Math.floor(farm.tubeX / FIELD_CELL);
    expect(farm.fresh[mouth]).toBe(1);
    // Far from the tube, along the corridors, the air is the nest's own.
    expect(farm.fresh[Math.floor(farm.height / 2 / FIELD_CELL) * farm.fieldWidth + Math.floor(40 / FIELD_CELL)]).toBeLessThan(0.01);
  });

  it('is warmed in a strip over the heat mat lying under it', () => {
    const world = createTank(7, { size: 'M', layout: 'classic' });
    setHeatMat(world, 0);
    for (let s = 0; s < 30 * 60 * STEPS_PER_SECOND; s += 1) step(world);
    const { farm, params } = world;
    const t = (x: number) => farm.temperature[Math.floor(75 / FIELD_CELL) * farm.fieldWidth + Math.floor(x / FIELD_CELL)]!;
    const warm = params.roomTemperature + params.nestMatShare * (params.matTemperature - params.roomTemperature);
    expect(t(40)).toBeCloseTo(warm, 5);
    expect(t(180)).toBeLessThan(params.roomTemperature + 1);
  });

  it('is where the colony lives: it forages through the tube and comes back', () => {
    const world = createTank(8);
    const { ants } = world;
    let out = 0;
    for (let s = 0; s < 40 * 60 * STEPS_PER_SECOND; s++) {
      step(world);
      if (s % 200 === 0) for (let i = 0; i < ants.count; i++) if (ants.place[i] === Place.arena) out++;
    }
    expect(out).toBeGreaterThan(0);
    let trips = 0;
    for (let i = 0; i < ants.count; i++) trips += ants.trips[i]!;
    expect(trips).toBeGreaterThan(0);
    // The queen stays in the nest.
    for (let i = 0; i < ants.count; i++) if (ants.caste[i] === Caste.queen) expect(ants.place[i]).toBe(Place.farm);
  }, 120_000);

  it('runs the same every time for the same tank', () => {
    expectDeterministic((seed) => {
      const world = createTank(seed, { size: 'S', layout: 'honeycomb' });
      for (let s = 0; s < 3000; s++) step(world);
      return world;
    });
  });
});

describe('tanks kept from before bought nests', () => {
  it('load as the sand farm they were, and go on digging', () => {
    const world = createTank(9, null);
    for (let s = 0; s < 400; s++) step(world);
    const kept = structuredClone({ version: SAVE_VERSION, seed: 9, savedAt: 0, log: [], world });
    delete (kept.world.farm as unknown as Record<string, unknown>).nest; // saved before bought nests
    const loaded = loadWorld(kept)!;
    expect(loaded.farm.nest).toBeNull();
    expect(loaded.farm.width).toBe(300);
    expect(hashState(loaded.farm.material)).toBe(hashState(world.farm.material));
    for (let s = 0; s < 400; s++) {
      step(world);
      step(loaded);
    }
    expect(hashState(loaded)).toBe(hashState(world));
  });

  it('a kept bought nest loads with its own size and layout', () => {
    const world = createTank(10, { size: 'L', layout: 'honeycomb' });
    for (let s = 0; s < 200; s++) step(world);
    const loaded = loadWorld(structuredClone({ version: SAVE_VERSION, seed: 10, savedAt: 0, log: [], world }))!;
    expect(loaded.farm.nest!.size).toBe('L');
    expect(hashState(loaded)).toBe(hashState(world));
  });

  it('a new sand farm is still the one the experiments use', () => {
    expect(createWorld(1).farm.nest).toBeNull();
    expect(DEFAULT_ANT_PARAMS.nestMatShare).toBeGreaterThan(0);
  });
});
